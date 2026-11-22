import {createHash} from "node:crypto"
import {integer,parseWire,stringifyWire} from "./codec.ts"
import {LoopError} from "./errors.ts"
import {CollaborationStore} from "./collaboration-store.ts"
import type {CollaborationNamespace} from "./collaboration-store.ts"
import {HostAPI} from "./host-api.ts"

const hash=(value:string)=>createHash("sha256").update(value).digest("hex")
const valid=(value:unknown)=>typeof value==="string" && /^[a-zA-Z0-9_.:-]{1,255}$/u.test(value)
const actions=(targets:any[])=>[...new Set<string>(["cancel","inspect",...targets.flatMap(target=>[...target.intendedActions,"followup"])])].sort()
const conflict=(message:string):never=>{throw new LoopError("loop-host/conflict",message)}
export function authorizedTasks(tasks:any[],acceptedText:string):string[]{
  const tokens=new Set(acceptedText.split(/[^\p{L}\p{N}_-]+/u))
  const selected=tasks.filter(task=>task.targetIds.length && tokens.has(task.taskId)).map(task=>task.taskId)
  if(!selected.length && tasks.length===1 && tasks[0].targetIds.length)selected.push(tasks[0].taskId)
  return selected.sort()
}
/** Continuation authority is derived from a saved Human message, never from
 * the taskId a model chooses later when invoking an action. */
export class CollaborationContinuation {
  private store:CollaborationStore
  private api:HostAPI
  constructor(store:CollaborationStore,api:HostAPI){this.store=store;this.api=api}
  async prepare(namespace:CollaborationNamespace,input:any,signal?:AbortSignal){
    if(!valid(input.requestId)||!valid(input.continuationRef)||!valid(input.acceptedMessageId)||integer(input.acceptedSequence)<0n||typeof input.acceptedSerializedText!=="string"||Buffer.byteLength(input.acceptedSerializedText)>1<<20||input.payloadDigest!=="sha256:"+hash(input.acceptedSerializedText))throw new LoopError("loop-host/invalid-request","Invalid continuation acceptance evidence")
    let continuation:any
    await this.store.update(namespace,current=>{
      const existing=current.continuations[input.continuationRef]
      if(existing){
        if(existing.requestId!==input.requestId||existing.acceptedMessageId!==input.acceptedMessageId||existing.acceptedTextDigest!==input.payloadDigest||existing.bindingRevision!==(input.bindingRevision||namespace.bindingRevision)||integer(existing.acceptedSequence)!==integer(input.acceptedSequence))conflict("Accepted continuation source changed")
        continuation=existing;return
      }
      if(input.bindingRevision && input.bindingRevision!==namespace.bindingRevision)conflict("Collaboration binding changed")
      const byTask=new Map<string,any>()
      for(const action of Object.values<any>(current.actions)){
        if(action.phase!=="completed" || !["dispatch","followup","review"].includes(action.kind))continue
        const data=action.receipt?.receipt?.taskId?action.receipt.receipt:action.receipt
        if(!data?.taskId || ["canceled","failed"].includes(data.state))continue
        const intent=current.intents[action.intentRef],previous=byTask.get(data.taskId),previousIntent=previous&&current.intents[previous.intentRef]
        if(!previous || intent && (!previousIntent || integer(intent.acceptedSequence??0)>integer(previousIntent.acceptedSequence??0) || previous.intentRef===intent.ref && !previous.targetIds.length)){
          let targets=intent?.targets??[]
          const target=action.request?.target?.targetId || action.receipt?.targetMemberId
          targets=target?targets.filter((item:any)=>item.targetId===target):targets.length===1?targets:[]
          byTask.set(data.taskId,{taskId:data.taskId,revision:integer(data.revision??0)===0n?"":integer(data.revision).toString(),taskTitle:previous?.taskTitle??"",targetIds:targets.map((item:any)=>item.targetId),targetTypes:Object.fromEntries(targets.map((item:any)=>[item.targetId,item.targetType])),allowedActions:[...new Set([...actions(targets),"review","end-management"])],intentRef:action.intentRef})
        }
        const task=byTask.get(data.taskId)
        task.taskTitle||=data.taskTitle||action.request?.task?.title||""
      }
      const tasks=[...byTask.values()].sort((a,b)=>a.taskId.localeCompare(b.taskId))
      const latest=Object.values<any>(current.intents).filter(intent=>intent.state==="activated").sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0]
      const references=!tasks.length && latest?latest.targets:[],authorizedTaskIds=authorizedTasks(tasks,input.acceptedSerializedText)
      const state=!tasks.length&&!references.length?"no-active-work":tasks.length&&!authorizedTaskIds.length?"needs-explicit-target":"ready"
      for(const [key,value] of Object.entries<any>(current.continuations))if(Date.parse(value.expiresAt)<=Date.now())delete current.continuations[key]
      if(Object.keys(current.continuations).length>=64)throw new LoopError("loop-host/queue-full","Too many pending continuations")
      continuation={scopeVersion:1,authorizedTaskIds,ref:input.continuationRef,requestId:input.requestId,state,sessionId:input.sessionId,bindingRevision:namespace.bindingRevision,bindingEpoch:namespace.bindingEpoch,acceptedMessageId:input.acceptedMessageId,acceptedSequence:integer(input.acceptedSequence),acceptedTextDigest:input.payloadDigest,references,referenceIntentRef:!tasks.length&&latest?latest.ref:"",tasks,expiresAt:new Date(Date.now()+900_000).toISOString(),updatedAt:new Date().toISOString(),reason:state==="needs-explicit-target"?"Choose the intended existing Task explicitly":""}
      current.continuations[input.continuationRef]=continuation
    },signal)
    const {ref,...view}=continuation
    return {...view,continuationRef:ref,localIntentId:ref,bindingId:namespace.bindingId,sessionGeneration:namespace.bindingEpoch}
  }
  async activate(namespace:CollaborationNamespace,document:any,input:any,signal?:AbortSignal){
    const continuation=document.continuations[input.continuationRef]
    if(!continuation || continuation.sessionId!==input.sessionId)conflict("Original continuation is unavailable")
    if(!["ready","needs-explicit-target"].includes(continuation.state)||Date.parse(continuation.expiresAt)<=Date.now()||continuation.bindingEpoch!==namespace.bindingEpoch)conflict("Continuation expired or its binding changed")
    if(!["dispatch","followup","cancel","review","end-management"].includes(input.action))conflict("Continuation does not authorize new notification targets")
    let task=continuation.tasks.find((item:any)=>item.taskId===input.arguments.taskId)
    if(!task && !input.arguments.taskId && continuation.tasks.length===1)task=continuation.tasks[0]
    if(input.action==="dispatch"){
      if(continuation.tasks.length)conflict("Use an explicit target for new work when Tasks are already active")
      const requested=input.arguments.target
      if(continuation.references.some((target:any)=>target.targetId===requested?.targetId && target.targetType===requested.kind))task={taskId:"",targetIds:continuation.references.map((target:any)=>target.targetId),targetTypes:Object.fromEntries(continuation.references.map((target:any)=>[target.targetId,target.targetType])),allowedActions:actions(continuation.references),intentRef:continuation.referenceIntentRef}
    }
    if(!task?.targetIds.length || !task.allowedActions.includes(input.action) || task.taskId && !continuation.authorizedTaskIds?.includes(task.taskId))conflict("Choose the intended Task in a new accepted submission before continuing")
    const original=document.intents[task.intentRef]
    if(!original)conflict("Original Task source is unavailable")
    if(continuation.userIntentId){
      const prior=Object.values<any>(document.intents).find(intent=>intent.userIntentId===continuation.userIntentId)
      if(prior)return prior
    }
    const tasks=task.taskId?continuation.tasks.filter((item:any)=>continuation.authorizedTaskIds.includes(item.taskId)):[task]
    const targetsById=new Map<string,any>(),allowed=new Set<string>()
    for(const item of tasks){for(const action of item.allowedActions)allowed.add(action);for(const id of item.targetIds)targetsById.set(id,{targetId:id,targetType:item.targetTypes[id]||"agent",intendedActions:item.allowedActions})}
    const targets=[...targetsById.values()].sort((a,b)=>a.targetId.localeCompare(b.targetId))
    const shareScope=parseWire(stringifyWire(original.shareScope??{}))
    if(continuation.tasks.length)shareScope.resourceRefs=[]
    const resourceRefs=task.taskId?tasks.map((item:any)=>"task:"+item.taskId).sort():shareScope.resourceRefs??[]
    const intentRef="cont-intent-"+hash(continuation.ref).slice(0,32)
    const request={intentRef,sourceSessionId:input.sessionId,sourceGeneration:integer(document.binding.sourceGeneration??1),sourceRequestId:continuation.requestId,sourceEventId:continuation.acceptedMessageId,sourceHash:continuation.acceptedTextDigest.slice(7),expectedBindingEpoch:integer(document.binding.bindingEpoch),allowedActions:[...allowed].sort(),targetIds:targets.map(item=>item.targetId),resourceRefs,shareScope:{projectId:namespace.projectId??"",boardId:namespace.boardId,visibility:shareScope.scope==="selected-resources"?"project_members":"task_participants",resourceRefs:shareScope.resourceRefs??[]},budget:{maxRuns:10,maxDepth:2,maxAutoWakes:10,deadline:null},expiresAt:continuation.expiresAt}
    const result=await this.api.request("workspace","POST","/collaboration/intents",request,signal,{lossless:true})
    if(!valid(result?.userIntentId))throw new LoopError("loop-host/result-unknown","Continuation returned no identity",0,true)
    const updated=await this.store.update(namespace,current=>{
      const saved=current.continuations[input.continuationRef]
      if(!saved || saved.acceptedTextDigest!==continuation.acceptedTextDigest || saved.userIntentId && saved.userIntentId!==result.userIntentId)conflict("Continuation changed during activation")
      saved.userIntentId=result.userIntentId;saved.updatedAt=new Date().toISOString()
      current.intents[intentRef]={ref:intentRef,state:"activated",sessionId:input.sessionId,bindingRevision:namespace.bindingRevision,payloadDigest:continuation.acceptedTextDigest,acceptedTextDigest:continuation.acceptedTextDigest,requestId:continuation.requestId,acceptedMessageId:continuation.acceptedMessageId,acceptedSequence:continuation.acceptedSequence,userIntentId:result.userIntentId,targets,shareScope,expiresAt:continuation.expiresAt,updatedAt:new Date().toISOString()}
    },signal)
    return updated.intents[intentRef]
  }
}
