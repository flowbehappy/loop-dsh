import {integer} from "./codec.ts"
import {LoopError} from "./errors.ts"

export function managementForTask(document:any,taskId:string,sessionId:string,epoch:string,ref=""){
  let selected:any,selectedSequence=-1n,ambiguous=false
  for(const action of Object.values<any>(document.actions??{})){
    if(!["dispatch","followup","review"].includes(action.kind)||action.phase!=="completed"||action.receipt?.receipt?.taskId!==taskId)continue
    const intent=document.intents[action.intentRef]
    if(!intent||intent.state!=="activated"||!intent.userIntentId||intent.sessionId!==sessionId||intent.bindingRevision!==epoch||integer(intent.acceptedSequence??0)<selectedSequence)continue
    const sequence=integer(intent.acceptedSequence??0)
    if(selected&&sequence===selectedSequence&&selected.intentRef!==intent.ref){ambiguous=true;continue}
    if(sequence>selectedSequence)ambiguous=false
    selectedSequence=sequence
    selected={taskId,intentRef:intent.ref,userIntentId:intent.userIntentId,state:"active",allowedActions:[...new Set(["cancel","inspect",...intent.targets.flatMap((target:any)=>[...target.intendedActions,"followup"])])].sort()}
  }
  if(ambiguous||!selected||ref&&selected.intentRef!==ref)return null
  for(const ending of Object.values<any>(document.actions??{}))if(ending.kind==="end-management"&&ending.phase==="completed"&&ending.intentRef===selected.intentRef&&ending.receipt?.receipt?.taskId===taskId)selected.state="closed"
  return selected
}
export function managementForEvent(document:any,event:any){
  if(!event)return null
  if(event.taskId){const source=managementForTask(document,event.taskId,event.sourceSessionId,event.bindingEpoch);return source?.state==="closed"?null:source}
  const source=document.managementSources?.[event.event?.subscriptionId]
  if(!source||source.sessionId!==event.sourceSessionId||(source.scopeId?source.scopeId!==event.event.scopeId:source.target!==event.event.target))return null
  return {target:source.target,sourceMessageId:source.messageId,scopeId:source.scopeId}
}
export function reserveReply(source:any,reply:any){
  if(!source)throw new LoopError("loop-host/permission-denied","Original discussion authority is unavailable")
  if(typeof reply.clientMessageId!=="string"||reply.clientMessageId.length<1||reply.clientMessageId.length>200||typeof reply.payloadDigest!=="string"||!/^sha256:[a-fA-F0-9]{64}$/u.test(reply.payloadDigest))throw new LoopError("loop-host/invalid-request","Feedback requires a stable message identity and digest")
  source.replies??={}
  if(Object.hasOwn(source.replies,reply.clientMessageId)){
    if(source.replies[reply.clientMessageId]!==reply.payloadDigest)throw new LoopError("loop-host/conflict","Reply identity was reused with different content")
    return
  }
  if(Object.keys(source.replies).length>=8)throw new LoopError("loop-host/limit","Original discussion reply budget exhausted")
  source.replies[reply.clientMessageId]=reply.payloadDigest
}
