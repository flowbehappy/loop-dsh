import {createHash} from "node:crypto"
import {setTimeout as delay} from "node:timers/promises"
import {CollaborationStore} from "./collaboration-store.ts"
import type {CollaborationNamespace} from "./collaboration-store.ts"
import {CollaborationInbox} from "./collaboration-inbox.ts"
import {HostAPI} from "./host-api.ts"
import {ProtectedStream} from "./stream.ts"
import {integer,publicValue} from "./codec.ts"
import {LoopError} from "./errors.ts"

export function collaborationEventScope(namespace:CollaborationNamespace){
  return {installationId:namespace.installationId,deviceBindingId:namespace.deviceBindingId,accountPrincipal:namespace.accountId,serviceBaseUrl:namespace.serverBaseUrl,workspaceId:namespace.workspaceId,sessionId:namespace.hostSessionId,agentMemberId:namespace.agentMemberId,bindingId:namespace.bindingId,bindingEpoch:namespace.bindingEpoch,...(namespace.archive?{archived:true}:{})}
}

export class CollaborationWatch {
  private control=new AbortController()
  private completion:Promise<void>
  private phase="connecting"
  private stream?:ProtectedStream
  private signal:AbortSignal
  private route:CollaborationNamespace
  get state(){return this.signal.aborted?"stopped":this.phase==="live"&&!this.stream?.connected?"backoff":this.phase}
  get namespace(){return this.route}
  constructor(api:HostAPI,store:CollaborationStore,namespace:CollaborationNamespace,emit:(value:any)=>void,signal?:AbortSignal){
    this.route=namespace
    this.signal=signal?AbortSignal.any([this.control.signal,signal]):this.control.signal
    this.completion=this.run(api,store,namespace,emit,this.signal)
    void this.completion.catch(()=>{})
  }
  private async run(api:HostAPI,store:CollaborationStore,namespace:CollaborationNamespace,notify:(value:any)=>void,signal:AbortSignal){
    const generation=namespace.bindingId+":"+namespace.bindingEpoch
    const clientId="dsh-"+createHash("sha256").update([namespace.serverBaseUrl,namespace.accountId,namespace.installationId,namespace.workspaceId,namespace.hostSessionId,namespace.bindingId,namespace.bindingEpoch].join("\0")).digest("hex").slice(0,36)
    const inbox=new CollaborationInbox(store,api)
    const emit=(event:any)=>{if(!signal.aborted)try{notify(publicValue({type:"loop-host-collaboration-event",scope:collaborationEventScope(namespace),event}))}catch{}}
    const subscription=(state:string)=>{this.phase=state;emit({eventId:"subscription-"+namespace.bindingId,kind:"subscription.changed",occurredAt:new Date().toISOString(),status:{state,generation}})}
    const delivery=({event,...metadata}:any)=>emit({eventId:metadata.eventId,kind:"delivery.changed",occurredAt:metadata.receivedAt,delivery:{...metadata,sessionId:namespace.hostSessionId,eventKind:metadata.kind},event})
    const authorize=async()=>{
      const credential=await api.tokens.credential(signal)
      if(credential.principal_id!==namespace.accountId||credential.workspace_id!==namespace.workspaceId)throw new LoopError("loop-host/conflict","Collaboration stream account changed")
      const result=await api.request("workspace","GET","/collaboration/binding?generation="+encodeURIComponent(generation),undefined,signal,{lossless:true})
      if(result?.binding?.bindingId!==namespace.bindingId||integer(result.binding.bindingEpoch).toString()!==namespace.bindingEpoch||!["active","retired"].includes(result.binding.status))throw new LoopError("loop-host/conflict","Collaboration stream binding changed")
    }
    let backoff=1000
    while(!signal.aborted){
      let stream:ProtectedStream|undefined
      try{
        await authorize()
        let document=await store.load(namespace)
        if(!namespace.archive&&(document.namespace.bindingId!==namespace.bindingId||document.namespace.bindingEpoch!==namespace.bindingEpoch)){
          // Rebinding moved this exact route's ledger before replacing it.
          // Resume historical feedback only against the archived ledger.
          const archived=await store.load({...namespace,archive:true})
          if(!archived.binding)throw new LoopError("loop-host/conflict","Original collaboration route is unavailable")
          this.route=namespace=archived.namespace
          document=archived
        }
        if(document.snapshotRequired){
          const recovered=await inbox.snapshot(namespace,signal)
          await authorize()
          for(const item of recovered.deliveries)delivery(item)
          if(recovered.hasMore)continue
          document=recovered.document
        }
        for(const item of Object.values<any>(document.events))if(["pending","needs-auth","reconcile"].includes(item.state))delivery(item)
        stream=await ProtectedStream.open(api.tokens,"/collaboration/stream",{clientId,afterEventSeq:integer(document.deliveryCursor).toString(),generation},signal)
        this.stream=stream
        let subscriptionId="",introduced=false
        for(;;){
          const frame=await stream.read()
          if(frame.kind==="hello"){
            if(introduced||frame.generation!==generation||typeof frame.subscriptionId!=="string"||!frame.subscriptionId||frame.agentMemberId!==namespace.agentMemberId)throw new LoopError("loop-host/backend-invalid","Collaboration stream identity changed")
            introduced=true;subscriptionId=frame.subscriptionId;backoff=1000
            await store.update(namespace,state=>{state.subscriptionId=subscriptionId;state.generation=generation;state.snapshotRequired=state.snapshotRequired||frame.snapshotRequired===true},signal)
            if(frame.snapshotRequired){subscription("snapshot-required");break}
          }else if(frame.kind==="event"){
            if(!introduced)throw new LoopError("loop-host/backend-invalid","Collaboration event preceded stream identity")
            const result=await inbox.receive(namespace,frame.event,signal)
            await authorize()
            await stream.send({kind:"ack",clientId,subscriptionId,generation,ackedEventSeq:integer(frame.event.eventSeq),ackedEventId:frame.event.eventId})
            if(result.emit){
              if(result.delivery)delivery(result.delivery)
              else emit({eventId:frame.event.eventId,kind:frame.event.type==="collaboration.directory_changed"?"directory.changed":"action.changed",occurredAt:new Date().toISOString()})
            }
            if(frame.event.type==="collaboration.subscription_invalidated"){subscription("connecting");break}
          }else if(frame.kind==="replay_end"){
            if(!introduced||integer(frame.throughEventSeq)<0n)throw new LoopError("loop-host/backend-invalid","Invalid collaboration replay frontier")
            await store.update(namespace,state=>{if(integer(frame.throughEventSeq)>integer(state.deliveryCursor))state.deliveryCursor=frame.throughEventSeq},signal)
            if(this.phase!=="live"&&stream.connected)subscription("live")
          }else if(!["ack","ping","pong"].includes(frame.kind))throw new LoopError("loop-host/backend-invalid","Invalid collaboration stream frame")
        }
      }catch{if(signal.aborted)break;subscription("backoff")}
      finally{this.stream=undefined;stream?.close();if(signal.aborted)this.phase="stopped"}
      await delay(backoff,undefined,{signal}).catch(()=>{});backoff=Math.min(backoff*2,30_000)
    }
  }
  async dispose(){this.control.abort();await this.completion}
}
