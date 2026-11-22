import type {SyncOutbox, SyncEvent, PendingContext} from "./sync.ts"
import {LoopError} from "./errors.ts"

interface WriterConfig {profile:string;queueLimit:number;shutdownTimeoutMs:number;clientSessionLabel:string}
interface Intake {profile:string;session:string;event:SyncEvent;context:PendingContext|null;generation:number}
interface Lane {items:Intake[];running?:Promise<void>;retry?:ReturnType<typeof setTimeout>;control:AbortController}
interface Upload {dirty:boolean;outbox:SyncOutbox;profile:string;session:string;generation:number;retry:number;control:AbortController;timer?:ReturnType<typeof setTimeout>;running?:Promise<void>}
export type OutboxResolver = (profile:string,session:string,context:PendingContext|null,signal:AbortSignal) => Promise<SyncOutbox>
export type OutboxRecovery = (profile:string,signal:AbortSignal)=>Promise<SyncOutbox[]>
const laneKey=(profile:string,session:string)=>JSON.stringify([profile,session])
/** Drop-in telemetry writer without a child process. Acks are local durable
 * capture; network receipt completion is a separate retryable operation. */
export class NativeSyncWriter {
  private config:WriterConfig
  private resolve:OutboxResolver
  private status:(session:string,state:string)=>void
  private profile:string
  private lanes=new Map<string,Lane>()
  private uploads=new Map<string,Upload>()
  private generations=new Map<string,number>()
  private control=new AbortController()
  private closing?:Promise<void>
  private stopped=false
  private epoch=0
  private recover?:OutboxRecovery
  private recovering?:Promise<void>
  constructor(config:WriterConfig,resolve:OutboxResolver,status:(session:string,state:string)=>void=()=>{},recover?:OutboxRecovery) {
    this.config=config;this.resolve=resolve;this.status=status;this.profile=config.profile;this.recover=recover
  }
  get totalQueued():number{return [...this.lanes.values()].reduce((sum,lane)=>sum+lane.items.length,0)}
  enqueue(session:string,event:SyncEvent,profile=this.profile,context:PendingContext|null=null):void {
    if(this.stopped)throw new LoopError("loop-host/unavailable","Sync writer is stopped")
    if(this.totalQueued>=this.config.queueLimit)throw new LoopError("loop-host/queue-full","Sync capture queue is full")
    const key=laneKey(profile,session)
    let lane=this.lanes.get(key)
    if(!lane){lane={items:[],control:new AbortController()};this.lanes.set(key,lane)}
    lane.items.push({session,event,profile,context,generation:this.generations.get(session)??0})
    this.pump(key,lane)
  }
  start():void{
    if(this.stopped)return
    this.flushHint()
    if(!this.recover||this.recovering)return
    const profile=this.profile,generations=new Map(this.generations),epoch=this.epoch
    this.recovering=(async()=>{
      const outboxes=await this.recover!(profile,this.control.signal)
      for(const outbox of outboxes){
        if(this.stopped || this.control.signal.aborted || epoch!==this.epoch)return
        const session=outbox.sessionId,generation=generations.get(session)??0,key=laneKey(profile,session)
        if(generation!==(this.generations.get(session)??0)||this.uploads.has(key))continue
        const upload:Upload={dirty:false,outbox,profile,session,generation,retry:250,control:new AbortController()}
        this.uploads.set(key,upload);this.upload(upload)
      }
    })().catch(()=>{if(!this.stopped)this.status("","failed")}).finally(()=>{this.recovering=undefined;if(!this.stopped&&this.profile!==profile)this.start()})
  }
  flushHint():void{
    for(const [key,lane] of this.lanes)if(!lane.retry)this.pump(key,lane)
    for(const upload of this.uploads.values())if(!upload.running && !upload.timer)this.upload(upload)
  }
  setActiveProfile(profile:string):void{this.profile=profile;this.start()}
  private pump(key:string,lane:Lane):void {
    if(lane.running || !lane.items.length || this.control.signal.aborted || lane.control.signal.aborted)return
    const signal=AbortSignal.any([this.control.signal,lane.control.signal])
    lane.running=(async()=>{
      while(lane.items.length && !signal.aborted){
        const item=lane.items[0]
        if(item.generation!==(this.generations.get(item.session)??0)){lane.items.shift();continue}
        try {
          const outbox=await this.resolve(item.profile,item.session,item.context,signal)
          if(item.generation!==(this.generations.get(item.session)??0)){lane.items.shift();continue}
          const captured=await outbox.recordObserved(item.event,signal)
          lane.items.shift()
          if(captured && item.generation===(this.generations.get(item.session)??0)) {
            let upload=this.uploads.get(key)
            if(!upload){upload={dirty:false,outbox,profile:item.profile,session:item.session,generation:item.generation,retry:250,control:new AbortController()};this.uploads.set(key,upload)}
            upload.dirty=true
            this.upload(upload)
          }
        } catch(error) {
          this.status(item.session,"failed")
          if(signal.aborted)break
          if(error instanceof LoopError && ["loop-host/invalid-state","loop-host/conflict"].includes(error.code)){lane.items.shift();continue}
          if(!this.stopped){lane.retry=setTimeout(()=>{lane.retry=undefined;this.pump(key,lane)},250);lane.retry.unref()}
          break
        }
      }
    })().finally(()=>{lane.running=undefined;if(!lane.items.length && !lane.retry && this.lanes.get(key)===lane)this.lanes.delete(key)})
    void lane.running.catch(()=>{})
  }
  private upload(upload:Upload):void {
    if(upload.running || upload.timer || this.control.signal.aborted || upload.control.signal.aborted || upload.generation!==(this.generations.get(upload.session)??0))return
    upload.dirty=false
    const signal=AbortSignal.any([this.control.signal,upload.control.signal])
    upload.running=(async()=>{
      try {await upload.outbox.flush(signal);upload.retry=250;this.status(upload.session,"uploaded")}
      catch(error){
        if(signal.aborted)return
        this.status(upload.session,"failed")
        if(this.stopped || error instanceof LoopError && ["loop-host/invalid-state","loop-host/needs-auth","loop-host/waiting-for-access","loop-host/conflict"].includes(error.code))return
        upload.timer=setTimeout(()=>{upload.timer=undefined;this.upload(upload)},upload.retry)
        upload.timer.unref();upload.retry=Math.min(upload.retry*2,5000)
      }
    })().finally(()=>{upload.running=undefined;if(upload.dirty && !upload.timer && !this.stopped)this.upload(upload)})
    void upload.running.catch(()=>{})
  }
  async fenceSessions(sessions:string[]):Promise<void> {
    const target=new Set(sessions),pending:Promise<unknown>[]=[]
    for(const session of sessions)this.generations.set(session,(this.generations.get(session)??0)+1)
    for(const [key,lane] of this.lanes)if(target.has(JSON.parse(key)[1])) {
      lane.control.abort();if(lane.retry)clearTimeout(lane.retry)
      if(lane.running)pending.push(lane.running)
      this.lanes.delete(key)
    }
    for(const [key,upload] of this.uploads)if(target.has(upload.session)){
      upload.control.abort();if(upload.timer)clearTimeout(upload.timer)
      if(upload.running)pending.push(upload.running)
      this.uploads.delete(key)
    }
    await Promise.allSettled(pending)
    for(const session of target)this.status(session,"idle")
  }
  async fenceAll():Promise<void> {
    this.epoch++
    await this.fenceSessions([...new Set([...this.lanes.keys()].map(key=>JSON.parse(key)[1]).concat([...this.uploads.values()].map(upload=>upload.session)))])
  }
  shutdown():Promise<void> {
    if(this.closing)return this.closing
    this.stopped=true
    this.closing=(async()=>{
      // Stop network work first so it cannot hold an outbox lock in front of
      // the last accepted local captures. Network delivery resumes from disk.
      for(const upload of this.uploads.values()){upload.control.abort();if(upload.timer)clearTimeout(upload.timer)}
      await Promise.allSettled([...this.uploads.values()].map(upload=>upload.running))
      const timeout=setTimeout(()=>this.control.abort(),this.config.shutdownTimeoutMs)
      try {
        for(const [key,lane] of this.lanes){if(lane.retry){clearTimeout(lane.retry);lane.retry=undefined}this.pump(key,lane)}
        await Promise.allSettled([...this.lanes.values()].map(lane=>lane.running))
        if(this.totalQueued)throw new LoopError("loop-host/backend-unavailable","Sync stopped before all accepted events could be saved")
      } finally {clearTimeout(timeout);this.control.abort();this.uploads.clear()}
    })()
    return this.closing
  }
}
