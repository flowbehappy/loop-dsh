import {createHash} from "node:crypto"
import {join} from "node:path"
import {readdir,lstat} from "node:fs/promises"
import type {Credential} from "./credentials.ts"
import {HostAPI} from "./host-api.ts"
import {DurableJSON} from "./storage.ts"
import {integer, parseWire, stringifyWire} from "./codec.ts"
import {LoopError} from "./errors.ts"

export interface SyncEvent {
  sourceEventId:string; sourceItemId:string; kind:string; state:string; provenance:string
  content?:string; sourceThreadId?:string; sourceTurnId?:string; startedAt?:string; completedAt?:string
  resourceRefs?: {kind:string;id:string;label?:string}[]
}
export interface SyncPlacement {kind:"channel_session" | "project_session";targetId:string;channelId?:string;confirmedSourceSequence?:bigint}
export interface PendingContext {accountPrincipal:string;loopWorkspaceId:string;agentId:string;projectId:string;defaultChannelId:string}
function fail(message: string): never {throw new LoopError("loop-host/invalid-state",message)}
const hash=(value:string)=>createHash("sha256").update(value).digest("hex")
const clone=(value:unknown)=>parseWire(stringifyWire(value,{sortKeys:false}))
export function connectionBindingKey(credential: Credential): string {
  return "sha256:"+hash([credential.client_id.trim(),credential.resource.trim().replace(/\/+$/u,""),(credential.host_source ?? "deepseek_harness").trim()].join("\0"))
}
function pendingKey(context:PendingContext,session:string):string {
  return "pending:"+hash(stringifyWire(["pending",context.accountPrincipal.trim(),context.loopWorkspaceId.trim(),context.agentId.trim(),context.projectId.trim(),context.defaultChannelId.trim(),session.trim()]))
}
function normalized(event:SyncEvent): SyncEvent {
  const result=clone(event)
  if(!result.sourceEventId || !result.sourceItemId || !result.kind || !result.state || !result.provenance) fail("Sync event identity is incomplete")
  if(typeof result.content==="string") {
    const raw=Buffer.from(result.content)
    let end=Math.min(raw.length,32<<10)
    while(end<raw.length && end>0 && (raw[end]&0xc0)===0x80)end--
    result.content=raw.subarray(0,end).toString("utf8")
  }
  if(result.resourceRefs) {
    if(!Array.isArray(result.resourceRefs))fail("Invalid sync resource references")
    const refs=new Map<string,any>()
    for(const ref of result.resourceRefs) {
      if(typeof ref?.kind!=="string" || typeof ref.id!=="string")fail("Invalid sync resource reference")
      refs.set(ref.kind+"\0"+ref.id,ref)
    }
    result.resourceRefs=[...refs].sort(([a],[b])=>Buffer.compare(Buffer.from(a),Buffer.from(b))).slice(0,20).map(([,ref])=>ref)
  }
  return result
}
const fields=new Set(["lastUploadFailed","version","bindingKey","pendingContext","pendingExpiresAt","externalSessionId","syncSessionId","projectId","defaultChannelId","topicId","rootMessageId","syncState","resumeSourceSequence","cursor","lastReceipt","nextSequence","pending"])

/** Uses the original v1 outbox layout and kernel lock. Upload retry reuses the
 * exact persisted sourceEventId/sequence; an ACK is emitted only after fsync. */
export class SyncOutbox {
  readonly store: DurableJSON
  private api: HostAPI
  private externalSessionId:string
  private binding:string
  private expectedPending?:PendingContext
  private pendingCapture?:{context:PendingContext;expiresAt:string}
  constructor(root:string,profile:string,externalSessionId:string,credential:Credential,api:HostAPI,pending?:PendingContext) {
    if(!/^[a-zA-Z0-9_.-]+$/u.test(profile) || [".",".."].includes(profile) || !externalSessionId.trim() || Buffer.byteLength(externalSessionId)>255) fail("Invalid sync profile or session")
    this.externalSessionId=externalSessionId.trim();this.binding=connectionBindingKey(credential);this.api=api;this.expectedPending=pending
    this.store=new DurableJSON(join(root,"outbox",profile,hash(this.externalSessionId)+".json"))
  }
  static pending(root:string,profile:string,session:string,context:PendingContext):SyncOutbox{
    if(![context?.accountPrincipal,context?.loopWorkspaceId,context?.agentId,context?.defaultChannelId].every(value=>typeof value==="string"&&value.trim())||typeof context.projectId!=="string")fail("Explicit pending sync context is required")
    const unavailable={async request(){throw new LoopError("loop-host/needs-auth","Pending sync capture has no remote authority")}} as unknown as HostAPI
    const outbox=new SyncOutbox(root,profile,session,{client_id:"pending",resource:"pending",host_source:"deepseek_harness"} as Credential,unavailable)
    outbox.binding=pendingKey(context,session.trim())
    outbox.pendingCapture={context:clone(context),expiresAt:new Date(Date.now()+24*60*60_000).toISOString()}
    return outbox
  }
  static async resumable(root:string,profile:string,credential:Credential,api:HostAPI,
    canResumeProject?: (sessionId:string, projectId:string, channelId:string) => Promise<boolean>):Promise<SyncOutbox[]>{
    if(!/^[a-zA-Z0-9_.-]+$/u.test(profile)||[".",".."].includes(profile))fail("Invalid sync profile")
    const directory=join(root,"outbox",profile)
    let entries
    try{
      const info=await lstat(directory)
      if(!info.isDirectory()||info.isSymbolicLink()||process.platform!=="win32"&&(info.mode&0o077)!==0)fail("Outbox directory must be private")
      entries=await readdir(directory,{withFileTypes:true})
    }catch(error:any){if(error.code==="ENOENT")return [];throw error}
    const result:SyncOutbox[]=[]
    for(const entry of entries){
      if(!/^[a-f0-9]{64}\.json$/u.test(entry.name))continue
      if(!entry.isFile())fail("Outbox state must be a regular file")
      const raw=await new DurableJSON(join(directory,entry.name)).read()
      if(!raw || raw.bindingKey!==connectionBindingKey(credential))continue
      if(typeof raw.externalSessionId!=="string"||hash(raw.externalSessionId)+".json"!==entry.name)fail("Outbox filename identity changed")
      const outbox=new SyncOutbox(root,profile,raw.externalSessionId,credential,api)
      const state=outbox.load(raw)
      // A saved remote session is the durable admission proof. Merely
      // possessing a credential never admits pre-consent captured events.
      if (!state.syncSessionId || state.syncState !== "active" || !state.pending.length) continue
      if (state.projectId && !await canResumeProject?.(outbox.sessionId, state.projectId, state.defaultChannelId)) continue
      result.push(outbox)
    }
    return result
  }
  /** Explicit consent may isolate an orphan left by an older completed logout.
   * Only an intact v1, stopped, empty, non-current connection is archived. */
  static async archiveLegacy(root:string,profile:string,session:string,credential:Credential,signal?:AbortSignal):Promise<string|undefined>{
    if(!/^[a-zA-Z0-9_.-]+$/u.test(profile)||[".",".."].includes(profile)||!session.trim()||Buffer.byteLength(session)>255)fail("Invalid sync profile or session")
    const sessionKey=hash(session.trim()),source=new DurableJSON(join(root,"outbox",profile,sessionKey+".json")),raw=await source.read()
    const valid=(record:any)=>record!==undefined &&
      Object.keys(record).every(key=>fields.has(key)) &&
      integer(record.version)===1n &&
      record.externalSessionId===session.trim() &&
      integer(record.nextSequence)>=1n &&
      record.bindingKey!==connectionBindingKey(credential) &&
      record.syncState==="stopped" &&
      Array.isArray(record.pending)&&record.pending.length===0
    if(!valid(raw))return undefined
    const expected=stringifyWire(raw),destination=join(root,"outbox",profile,"legacy",sessionKey+"."+hash(expected)+".json")
    const archived=await source.archive(destination,current=>valid(current)&&stringifyWire(current)===expected,signal)
    return archived?destination:undefined
  }
  get sessionId():string{return this.externalSessionId}
  private load(raw:any):any {
    if(raw===undefined)return {version:1,bindingKey:this.binding,externalSessionId:this.externalSessionId,syncSessionId:"",syncState:"active",nextSequence:1n,pending:[],...(this.pendingCapture?{pendingContext:this.pendingCapture.context,pendingExpiresAt:this.pendingCapture.expiresAt}:{})}
    if(!raw || Object.keys(raw).some(key=>!fields.has(key)) || integer(raw.version)!==1n || raw.externalSessionId!==this.externalSessionId || integer(raw.nextSequence)<1n || integer(raw.resumeSourceSequence??0)<0n)fail("Invalid sync outbox")
    if(raw.pendingContext) {
      const context=raw.pendingContext
      if(![context.accountPrincipal,context.loopWorkspaceId,context.agentId,context.defaultChannelId].every(value=>typeof value==="string" && value.trim()) || !Number.isFinite(Date.parse(raw.pendingExpiresAt)))fail("Invalid pending sync context")
    } else if(raw.pendingExpiresAt)fail("Unexpected pending sync expiration")
    if(this.pendingCapture && (!raw.pendingContext||stringifyWire(raw.pendingContext)!==stringifyWire(this.pendingCapture.context)||Date.parse(raw.pendingExpiresAt)<=Date.now()||raw.syncSessionId))fail("Pending sync capture context expired or was already admitted")
    if(raw.bindingKey!==this.binding) {
      if(!this.expectedPending || !raw.pendingContext || stringifyWire(raw.pendingContext)!==stringifyWire(this.expectedPending) || raw.bindingKey!==pendingKey(raw.pendingContext,this.externalSessionId) || Date.parse(raw.pendingExpiresAt)<=Date.now()) fail("Sync outbox belongs to another connection")
      raw.bindingKey=this.binding
    }
    raw.syncState=raw.syncState?.trim() || "active"
    if(!["active","stopped"].includes(raw.syncState))fail("Invalid sync state")
    raw.pending??=[]
    if(!Array.isArray(raw.pending))fail("Invalid pending sync events")
    for(const event of raw.pending) {
      if(integer(event.sourceSequence)<1n || integer(event.sourceSequence)>=integer(raw.nextSequence))fail("Invalid event sequence")
    }
    if(raw.lastReceipt && (!raw.lastReceipt.sourceEventId || !raw.lastReceipt.eventId || integer(raw.lastReceipt.sourceSequence)<1n))fail("Invalid sync receipt")
    return raw
  }
  async snapshot():Promise<any> {return this.load(await this.store.read())}
  async ensureSession(placement:SyncPlacement,expectedWorkspaceId:string,expectedAgentId:string,clientSessionLabel="",signal?:AbortSignal):Promise<any> {
    return this.store.transaction(async(raw,save)=>{
      const state=this.load(raw)
      const {confirmedSourceSequence,...remotePlacement}=placement
      const request:any={externalSessionId:this.externalSessionId,source:"deepseek_harness",placement:remotePlacement,associationConfirmedByHuman:true,...(confirmedSourceSequence===undefined?{}:{confirmedSourceSequence})}
      if(clientSessionLabel)request.clientSessionLabel=clientSessionLabel
      const session=await this.api.request("sync","POST","/sessions",request,signal,{lossless:true})
      if(!session?.syncSessionId || session.workspaceId!==expectedWorkspaceId || (session.externalSessionId && session.externalSessionId!==this.externalSessionId) ||
          session.placement?.kind!==placement.kind || session.placement?.targetId!==placement.targetId || (session.placement?.channelId??"")!==(placement.channelId??"") ||
          integer(session.resumeSourceSequence??0)<integer(state.resumeSourceSequence??0) ||
          !session.participants?.some((item:any)=>item.kind==="agent" && item.verified===true && item.principalId===expectedAgentId))fail("Sync session identity or placement changed")
      if(state.syncSessionId && state.syncSessionId!==session.syncSessionId)fail("Sync session changed for an existing outbox")
      state.syncSessionId=session.syncSessionId
      state.projectId=placement.kind==="project_session"?placement.targetId:""
      state.defaultChannelId=placement.kind==="channel_session"?placement.targetId:placement.channelId??""
      this.applySession(state,session)
      await save(state)
      return session
    },signal)
  }
  private applySession(state:any,session:any):void {
    for(const key of ["topicId","rootMessageId","cursor"])if(session[key])state[key]=session[key]
    if(session.syncState) {
      if(!["active","stopped"].includes(session.syncState))fail("Invalid remote sync state")
      state.syncState=session.syncState
    }
    if(integer(session.resumeSourceSequence??0)>integer(state.resumeSourceSequence??0))state.resumeSourceSequence=session.resumeSourceSequence
  }
  async record(events:SyncEvent[],signal?:AbortSignal):Promise<void> {
    if(!events.length)return
    await this.store.transaction(async(raw,save)=>{
      const state=this.load(raw)
      if(state.syncState!=="active")fail("Sync outbox is stopped")
      for(const event of events) {
        const next=normalized(event)
        const previous=state.pending.find((item:any)=>item.sourceEventId===next.sourceEventId)
        if(previous) {
          const {sourceSequence,...payload}=previous
          if(stringifyWire(payload)!==stringifyWire(next))fail("Sync event identity was reused with different content")
          continue
        }
        const sequence=integer(state.nextSequence)
        if(sequence>=9223372036854775807n)fail("Sync sequence exhausted")
        state.pending.push({...next,sourceSequence:sequence});state.nextSequence=sequence+1n
      }
      await save(state)
    },signal)
  }
  async recordObserved(event:SyncEvent,signal?:AbortSignal):Promise<boolean> {
    if(event.sourceThreadId!==this.externalSessionId || !["human_message","agent_message","tool_started","tool_completed"].includes(event.kind) ||
        Buffer.byteLength(event.sourceEventId)>512 || event.sourceEventId.includes("\0"))fail("Invalid DSH source event")
    const match=/:([0-9]+)$/u.exec(event.sourceEventId)
    if(!match)fail("Invalid DSH source sequence")
    const sequence=BigInt(match[1])
    if(sequence<=0n || sequence>=9223372036854775807n)fail("Invalid DSH source sequence")
    return this.store.transaction(async(raw,save)=>{
      // Match managed admission: telemetry cannot create an upload binding.
      if(raw===undefined&&!this.pendingCapture)return false
      const state=this.load(raw)
      if(state.syncState!=="active")return false
      const next=normalized(event)
      const byId=new Map<string,any>()
      for(const item of [...state.pending,{...next,sourceSequence:sequence}]) {
        const source=/:([0-9]+)$/u.exec(item.sourceEventId)
        if(!source)fail("Invalid durable DSH event identity")
        item.sourceSequence=BigInt(source[1])
        const previous=byId.get(item.sourceEventId)
        if(previous && stringifyWire(previous)!==stringifyWire(item))fail("DSH event conflicts with durable facts")
        byId.set(item.sourceEventId,item)
      }
      state.pending=[...byId.values()].sort((a,b)=>integer(a.sourceSequence)<integer(b.sourceSequence)?-1:integer(a.sourceSequence)>integer(b.sourceSequence)?1:a.sourceEventId.localeCompare(b.sourceEventId))
      if(integer(state.nextSequence)<=sequence)state.nextSequence=sequence+1n
      await save(state)
      return true
    },signal)
  }
  async flush(signal?:AbortSignal):Promise<void> {
    if(this.pendingCapture)throw new LoopError("loop-host/needs-auth","Pending sync capture has no remote authority")
    await this.store.transaction(async(raw,save)=>{
      const state=this.load(raw)
      if(state.syncState!=="active")fail("Sync outbox is stopped")
      if(state.pending.length && !state.syncSessionId)fail("Sync outbox has events without a remote session")
      while(state.pending.length) {
        const batch=state.pending.slice(0,50)
        let result:any
        try {
          result=await this.api.request("sync","POST",`/sessions/${encodeURIComponent(state.syncSessionId)}/events`,{events:batch},signal,{lossless:true})
          if(!Array.isArray(result?.receipts) || result.receipts.length!==batch.length || result.receipts.some((receipt:any,i:number)=>receipt.sourceEventId!==batch[i].sourceEventId || !receipt.eventId))fail("Incomplete or misordered sync receipts")
        } catch(error) {state.lastUploadFailed=true;await save(state);throw error}
        state.lastUploadFailed=false
        state.pending=state.pending.slice(batch.length)
        this.applySession(state,result)
        for(const receipt of [...result.receipts].reverse()) {
          if(integer(receipt.sequence??0)<=0n || !receipt.createdAt)continue
          if(!state.lastReceipt || integer(receipt.sequence)>integer(state.lastReceipt.sourceSequence)) {
            state.lastReceipt={sourceEventId:receipt.sourceEventId,eventId:receipt.eventId,...(receipt.messageId?{messageId:receipt.messageId}:{}),sourceSequence:receipt.sequence,acceptedAt:receipt.createdAt}
          }
          break
        }
        await save(state)
      }
    },signal)
  }
  async stop(signal?:AbortSignal):Promise<any> {
    return this.store.transaction(async(raw,save)=>{
      const state=this.load(raw),boundary=integer(state.nextSequence)-1n
      if(boundary>integer(state.resumeSourceSequence??0))state.resumeSourceSequence=boundary
      state.pending=[];state.syncState="stopped";await save(state);return state
    },signal)
  }
  async resume(boundary:bigint,signal?:AbortSignal):Promise<any> {
    if(boundary<0n)fail("Invalid sync resume boundary")
    return this.store.transaction(async(raw,save)=>{
      const state=this.load(raw)
      if(!state.syncSessionId)fail("Sync outbox has no remote session")
      if(integer(state.resumeSourceSequence??0)>boundary)boundary=integer(state.resumeSourceSequence)
      const session=await this.api.request("sync","POST",`/sessions/${encodeURIComponent(state.syncSessionId)}/sync-state`,{state:"active",boundarySourceSequence:boundary},signal,{lossless:true})
      if(session.syncState!=="active" || integer(session.resumeSourceSequence??0)<boundary)fail("Sync resume boundary was not applied")
      this.applySession(state,session);await save(state);return state
    },signal)
  }
}
