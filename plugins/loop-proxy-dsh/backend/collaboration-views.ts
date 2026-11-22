import {integer} from "./codec.ts"
import {managementForTask} from "./collaboration-management.ts"

export function collaborationActive(document:any){
  const latest=new Map<string,any>(),titles=new Map<string,string>()
  for(const action of Object.values<any>(document.actions??{})){
    const taskId=action?.receipt?.receipt?.taskId
    if(!taskId)continue
    const previous=latest.get(taskId)
    if(!previous || action.updatedAt>previous.updatedAt || action.updatedAt===previous.updatedAt && action.clientRequestId>previous.clientRequestId)latest.set(taskId,action)
    if(action.request?.task?.title)titles.set(taskId,action.request.task.title)
  }
  return [...latest].map(([taskId,action])=>{
    const receipt=action.receipt.receipt,projection=document.taskStates?.[taskId]
    const unknown=["recorded","dispatching","unknown"].includes(action.phase)||receipt.state==="unknown"
    const item:any={taskId,taskTitle:titles.get(taskId)??"",revision:integer(receipt.revision??0).toString(),state:"accepted",nextAction:unknown?"reconcile":"wait",acceptanceState:receipt.state??"",resultUnknown:unknown,updatedAt:action.updatedAt,reason:action.reason??"",managementState:"unavailable"}
    item.managementState=managementForTask(document,taskId,document.namespace.hostSessionId,document.namespace.bindingEpoch)?.state??"unavailable"
    if(projection){
      Object.assign(item,{taskStatus:projection.status,revision:integer(projection.revision??0).toString(),taskAvailable:projection.available,assigneeMemberId:projection.assigneeMemberId??""})
      if(!projection.available)Object.assign(item,{taskTitle:"",state:"blocked",nextAction:"none"})
      else{
        item.taskTitle=projection.title??""
        if(projection.status==="done")Object.assign(item,{state:"completed",nextAction:unknown?"reconcile":"none"})
        if(projection.status==="in_progress")item.state="running"
        if(projection.status==="in_review")item.state="in_review"
      }
    }
    return item
  }).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,100)
}
export function collaborationDeliveries(document:any){
  return Object.values<any>(document.events??{}).filter(event=>event && !["collaboration.directory_changed","collaboration.subscription_invalidated"].includes(event.kind))
    .sort((a,b)=>integer(a.eventSeq)===integer(b.eventSeq)?0:integer(a.eventSeq)>integer(b.eventSeq)?-1:1).slice(0,100)
    .map(event=>{
      const result:any={sessionId:document.namespace.hostSessionId}
      for(const key of ["deliveryId","deliveryKey","eventId","eventSeq","sourceSessionId","bindingId","bindingEpoch","taskId","contentHash","state","payloadHash","messageId","sessionSeq","receivedAt","committedAt","reason","event"])if(event[key]!==undefined)result[key]=event[key]
      result.eventKind=event.kind;return result
    })
}
