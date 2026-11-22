import {integer} from "./codec.ts"
import {LoopError} from "./errors.ts"
import {HostAPI} from "./host-api.ts"
import {CollaborationStore} from "./collaboration-store.ts"
import type {CollaborationNamespace} from "./collaboration-store.ts"
import {managementForTask,managementForEvent,reserveReply} from "./collaboration-management.ts"
import {blockDelivery} from "./collaboration-inbox.ts"

export async function lookupSubscription(api:HostAPI,epoch:bigint,target:string,subscriptionId:string,signal?:AbortSignal,checkImplicit=false){
  let cursor="",scopeId="",implicitTaskMode=""
  for(let page=0;page<20;page++){
    const result=await api.request("workspace","POST","/collaboration/actions/list-subscriptions",{expectedBindingEpoch:epoch,cursor,limit:100,...(target?{target}:{})},signal,{lossless:true})
    if(target){
      if(!result?.resolvedScopeId)throw new LoopError("loop-host/capability-unsupported","Server must resolve a stable subscription scope")
      if(scopeId&&scopeId!==result.resolvedScopeId)throw new LoopError("loop-host/conflict","Subscription target changed during lookup")
      scopeId=result.resolvedScopeId
    }
    if(!Array.isArray(result?.subscriptions)||result.subscriptions.length>100)throw new LoopError("loop-host/backend-invalid","Invalid subscription list")
    if(checkImplicit){
      const mode=result.implicitTaskMode==="push"?"push":""
      if(page===0)implicitTaskMode=mode
      else if(mode!==implicitTaskMode)throw new LoopError("loop-host/conflict","Implicit Task subscription mode changed during lookup")
    }
    const selected=result.subscriptions.find((item:any)=>target?item.scopeId===scopeId:item.subscriptionId===subscriptionId)
    if(selected||!result.hasMore)return {selected,scopeId,implicitTaskMode}
    if(!result.nextCursor||result.nextCursor===cursor)throw new LoopError("loop-host/backend-invalid","Subscription cursor did not advance")
    cursor=result.nextCursor
  }
  throw new LoopError("loop-host/limit","Subscription lookup budget exhausted")
}
function failure(error:unknown){
  const status=error instanceof LoopError?error.status:0,code=error instanceof LoopError?error.code:""
  const state=status===401||code==="loop-host/needs-auth"?"needs-auth":status===403||status===409||code==="loop-host/conflict"?"binding-conflict":status>=500||status===0||status===429?"reconcile":"blocked"
  return {authorized:false,state,retryable:["needs-auth","reconcile"].includes(state),reason:"Current Loop authorization could not be established"}
}
export async function authorizeCollaboration(api:HostAPI,store:CollaborationStore,namespace:CollaborationNamespace,input:any,signal?:AbortSignal){
  const denied=(reason:string,state="blocked")=>({authorized:false,state,retryable:false,reason})
  if(input.taskId&&(input.eventId||input.reply||input.target))throw new LoopError("loop-host/invalid-request","Task management and message authorization require separate requests")
  let binding:any
  try{
    binding=(await api.request("workspace","GET","/collaboration/binding?generation="+encodeURIComponent(namespace.bindingId+":"+namespace.bindingEpoch),undefined,signal,{lossless:true}))?.binding
  }catch(error){return failure(error)}
  if(!binding||binding.bindingId!==namespace.bindingId||integer(binding.bindingEpoch).toString()!==namespace.bindingEpoch||!["active","retired"].includes(binding.status))return denied("Original collaboration binding changed","binding-conflict")
  let document=await store.load(namespace),currentTask:any,currentTarget="",currentScopeId=""
  if(input.taskId){
    const source=managementForTask(document,input.taskId,namespace.hostSessionId,namespace.bindingEpoch!,input.managementRef)
    if(!source||source.state==="closed"&&input.action!=="end-management")return denied("No unique active management source for this Task")
    if(input.action!=="end-management"){
      try{currentTask=(await api.request("workspace","POST","/collaboration/actions/inspect",{taskId:input.taskId,userIntentId:source.userIntentId,expectedBindingEpoch:integer(binding.bindingEpoch)},signal,{lossless:true}))?.task}catch(error){return failure(error)}
      if(currentTask?.taskId!==input.taskId||!currentTask.status)throw new LoopError("loop-host/backend-invalid","Current Task management state is unavailable")
    }
  }
  if(input.eventId){
    const event=document.events[input.eventId]
    if(!event)return denied("Original collaboration delivery is unavailable")
    if(["revoked","binding-conflict","blocked","canceled"].includes(event.state))return denied("Loop delivery is no longer admissible",event.state)
    try{
      if(event.kind==="collaboration.message"||integer(event.event.subscriptionRevision??0)>0n||["collaboration.task_message","collaboration.task_input_failed"].includes(event.kind)&&integer(binding.protocolCapabilities?.messageSubscriptions??0)>0n){
        const result=await api.request("workspace","POST","/collaboration/actions/inspect-update",{expectedBindingEpoch:integer(binding.bindingEpoch),eventId:event.eventId,expectedRevision:integer(event.event.subscriptionRevision??0),mode:event.event.mode||"push"},signal,{lossless:true})
        currentTarget=result.currentTarget??"";currentScopeId=result.scopeId??""
        if(result.authorized!==true)return denied("Subscription mode or revision changed; read updates after resuming","pending")
      }
      if(event.taskId){
        const messageId=event.event.messageId||event.event.payload?.messageId||""
        if(!messageId&&event.kind==="collaboration.task_message")return denied("Task message identity is missing")
        currentTask=(await api.request("workspace","POST","/collaboration/actions/inspect",{taskId:event.taskId,messageId,expectedBindingEpoch:integer(binding.bindingEpoch)},signal,{lossless:true}))?.task
        if(currentTask?.taskId!==event.taskId)throw new LoopError("loop-host/backend-invalid","Task inspection identity changed")
      }
    }catch(error){
      const result=failure(error)
      if(!result.retryable)await store.update(namespace,state=>{const item=state.events[input.eventId];if(item&&!['committed','canceled'].includes(item.state))blockDelivery(item,result.reason)},signal)
      return result
    }
  }
  let management:any=null,managementReason=""
  if((input.eventId||input.taskId)&&(binding.status==="active"||input.action==="end-management"&&binding.status==="retired")){
    document=await store.load(namespace)
    const event=document.events[input.eventId],source=event&&document.managementSources?.[event.event.subscriptionId]
    if(source&&currentTarget&&currentScopeId&&(source.target!==currentTarget||source.scopeId!==currentScopeId))document=await store.update(namespace,state=>{
      const live=state.managementSources?.[event.event.subscriptionId]
      if(live&&(live.scopeId===currentScopeId||!live.scopeId&&live.target===event.event.target)){live.scopeId=currentScopeId;live.target=currentTarget}
    },signal)
    management=input.taskId?managementForTask(document,input.taskId,namespace.hostSessionId,namespace.bindingEpoch!,input.managementRef):managementForEvent(document,document.events[input.eventId])
    if(currentTask?.management&&currentTask.management.state!=="active"){management=null;managementReason="The exact Task delegation is closed or unavailable"}
  }
  if(input.target){
    if(typeof input.target!=="string"||input.target.trim().startsWith("#tsk_")||input.eventId||binding.status!=="active")throw new LoopError("loop-host/permission-denied","Discussion management requires an active exact discussion binding")
    const {selected,scopeId}=await lookupSubscription(api,integer(binding.bindingEpoch),input.target,"",signal)
    if(String(selected?.currentTarget||selected?.target||"").trim().startsWith("#tsk_"))throw new LoopError("loop-host/permission-denied","Task messages require exact Task delegation")
    document=await store.load(namespace)
    const source=document.managementSources?.[selected?.subscriptionId]
    if(!source||source.sessionId!==namespace.hostSessionId||source.scopeId!==scopeId||selected.mode==="paused")management=null
    else{
      management={target:input.target,scopeId,subscriptionId:selected.subscriptionId,sourceMessageId:source.messageId}
      if(input.reply){
        if(input.reply.target!==input.target)throw new LoopError("loop-host/permission-denied","Reply target differs from the managed discussion")
        await store.update(namespace,state=>{const live=state.managementSources?.[selected.subscriptionId];if(!live||live.messageId!==source.messageId||live.scopeId!==scopeId)throw new LoopError("loop-host/conflict","Discussion source changed");reserveReply(live,input.reply)},signal)
      }
    }
  }
  if(!input.target&&input.reply){
    if(!management||management.target!==input.reply.target||binding.status!=="active")throw new LoopError("loop-host/permission-denied","Original discussion authority is unavailable")
    await store.update(namespace,state=>{
      const event=state.events[input.eventId],current=managementForEvent(state,event)
      if(!current||current.target!==input.reply.target)throw new LoopError("loop-host/permission-denied","Original discussion authority changed")
      reserveReply(state.managementSources?.[event.event.subscriptionId],input.reply)
    },signal)
  }
  return {management,managementReason:management?"":managementReason||"Original accepted management source is unavailable",managementEligible:!!management,readAdmitted:!!input.eventId,authorized:true,binding,state:binding.status}
}
