import {createHash} from "node:crypto"
import {setTimeout as delay} from "node:timers/promises"
import {TokenManager} from "./http.ts"
import {ProtectedStream} from "./stream.ts"
import {integer} from "./codec.ts"
import {LoopError} from "./errors.ts"

const uiInteger=(value:unknown)=>{const number=integer(value);if(number<0n || number>BigInt(Number.MAX_SAFE_INTEGER))throw new LoopError("loop-host/backend-invalid","Catalog sequence exceeds Host range");return Number(number)}
const digest=(value:string)=>createHash("sha256").update(value).digest("hex").slice(0,36)
export class CatalogWatch {
  private tokens:TokenManager
  private scope:()=>Promise<any>
  private emit:(value:any)=>void
  private control=new AbortController()
  private completion:Promise<void>
  constructor(tokens:TokenManager,scope:()=>Promise<any>,emit:(value:any)=>void,signal?:AbortSignal){
    this.tokens=tokens;this.scope=scope;this.emit=emit
    this.completion=this.run(AbortSignal.any([this.control.signal,...(signal?[signal]:[])]))
    void this.completion.catch(()=>{})
  }
  private async run(signal:AbortSignal){
    let cursor=0n,backoff=1000
    while(!signal.aborted){
      let stream:ProtectedStream|undefined
      try{
        const scope=await this.scope()
        const generation="skill-catalog-v1:"+scope.workspaceId
        const clientId="dsh-skill-"+digest([scope.serverBaseUrl,scope.accountId,scope.installationId,scope.workspaceId,scope.hostWorkspaceId].join("\0"))
        const eventId=(kind:string,sequence:bigint)=>"skc-"+digest([generation,kind,sequence.toString()].join("\0"))
        const emit=async(event:any)=>{const currentScope=await this.scope();if(!signal.aborted)this.emit({type:"loop-host-skill-catalog-event",scope:currentScope,event})}
        stream=await ProtectedStream.open(this.tokens,"/catalog/events",{clientId,afterEventSeq:cursor.toString(),generation},signal)
        let subscriptionId="",hello=false
        const ack=async(sequence:bigint,id="")=>{await stream!.send({kind:"ack",clientId,subscriptionId,generation,ackedEventSeq:sequence,ackedEventId:id});cursor=sequence>cursor?sequence:cursor}
        for(;;){
          const frame=await stream.read(),occurredAt=new Date().toISOString()
          if(frame.kind==="hello"){
            if(hello || frame.type!=="skill_catalog" || frame.workspaceId!==scope.workspaceId || !frame.agentMemberId || frame.generation!==generation || !frame.subscriptionId)throw new LoopError("loop-host/backend-invalid","Catalog stream identity changed")
            hello=true;subscriptionId=frame.subscriptionId;backoff=1000
            const latest=integer(frame.latestEventSeq)
            await emit({eventId:eventId("live",latest),kind:"subscription.changed",occurredAt,status:{state:"live",latestEventSeq:uiInteger(latest),retainedFromSeq:uiInteger(frame.retainedFromSeq??0),resumeFrom:uiInteger(frame.resumeFrom??0),snapshotRequired:frame.snapshotRequired===true}})
            if(frame.snapshotRequired){await emit({eventId:eventId("baseline",latest),kind:"catalog.changed",revision:uiInteger(latest),occurredAt,reason:"snapshot"});await ack(latest)}
          }else if(frame.kind==="event"){
            if(!hello || !frame.event || typeof frame.event.eventId!=="string" || !frame.event.eventId)throw new LoopError("loop-host/backend-invalid","Invalid catalog event")
            const event=frame.event,sequence=integer(event.eventSeq)
            if(sequence<0n || sequence>BigInt(Number.MAX_SAFE_INTEGER))throw new LoopError("loop-host/backend-invalid","Catalog sequence exceeds Host range")
            const kind=({"skill.catalog_changed":"catalog.changed","kb.catalog_changed":"catalog.changed","collaboration.directory_changed":"directory.changed"} as Record<string,string>)[event.type]
            if(kind && sequence>cursor)await emit({eventId:event.eventId,eventSeq:Number(sequence),kind,eventType:event.type,revision:uiInteger(event.payload?.revision??0),occurredAt:event.createdAt||occurredAt})
            await ack(sequence,event.eventId)
          }else if(frame.kind==="replay_end"){
            if(!hello)throw new LoopError("loop-host/backend-invalid","Catalog stream did not introduce itself")
            await ack(integer(frame.throughEventSeq)>cursor?integer(frame.throughEventSeq):cursor)
          }else if(!["ping","pong","ack"].includes(frame.kind))throw new LoopError("loop-host/backend-invalid","Unexpected catalog frame")
        }
      }catch{
        if(signal.aborted)break
        try{const scope=await this.scope();this.emit({type:"loop-host-skill-catalog-event",scope,event:{eventId:"skc-"+digest(Date.now().toString()),kind:"subscription.changed",occurredAt:new Date().toISOString(),status:{state:"backoff",reason:"Loop catalog stream is reconnecting"}}})}catch{}
      }finally{stream?.close()}
      await delay(backoff,undefined,{signal}).catch(()=>{})
      backoff=Math.min(backoff*2,30_000)
    }
  }
  async dispose(){this.control.abort();await this.completion}
}
