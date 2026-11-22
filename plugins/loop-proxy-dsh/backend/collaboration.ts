import {createHash,randomUUID} from "node:crypto"
import {HostAPI} from "./host-api.ts"
import {HostIdentity} from "./host-identity.ts"
import {HostCredentialStore} from "./credentials.ts"
import {CollaborationStore} from "./collaboration-store.ts"
import {CollaborationLedger} from "./collaboration-ledger.ts"
import {collaborationActive,collaborationDeliveries} from "./collaboration-views.ts"
import {CollaborationContinuation} from "./collaboration-continuation.ts"
import {CollaborationInbox} from "./collaboration-inbox.ts"
import {CollaborationWatch,collaborationEventScope} from "./collaboration-watch.ts"
import {authorizeCollaboration,lookupSubscription} from "./collaboration-authorization.ts"
import {managementForTask} from "./collaboration-management.ts"
import {subscriptionAction} from "./collaboration-subscriptions.ts"
import type {CollaborationNamespace} from "./collaboration-store.ts"
import {integer,stringifyWire,parseWire} from "./codec.ts"
import {LoopError} from "./errors.ts"

const id=(value:unknown):value is string=>typeof value==="string" && /^[a-zA-Z0-9_.:-]{1,255}$/u.test(value)
const hash=(value:string)=>createHash("sha256").update(value).digest("hex")
const text=(value:unknown)=>typeof value==="string"?value:""
const revision=(value:any)=>typeof value==="string"?value:integer(value??0).toString()
export function capability(value:any){
  const result:any={available:false,delegable:false,notifiable:false,conditionalNotify:false,followup:false,cancel:false,reason:"Collaboration binding is not ready"}
  const caps=value?.capabilities
  if(caps){for(const key of ["delegable","notifiable","conditionalNotify","followup","cancel"])result[key]=caps[key]===true;result.reason=text(caps.unsupportedReason)}
  result.available=value?.active===true || value?.status==="active" || !!caps && ["delegable","notifiable","followup","cancel"].some(key=>result[key])
  if(!caps && result.available){for(const key of ["delegable","notifiable","conditionalNotify","followup","cancel"])result[key]=true;result.reason=""}
  return result
}
export class CollaborationService {
  private api:HostAPI
  private credentials:HostCredentialStore
  private identity:HostIdentity
  private store:CollaborationStore
  private installation:string
  constructor(api:HostAPI,credentials:HostCredentialStore,identity:HostIdentity,root:string,installation:string){this.api=api;this.credentials=credentials;this.identity=identity;this.store=new CollaborationStore(root);this.installation=installation}
  private async sessionContext(session:string,signal?:AbortSignal){
    if(!id(session))throw new LoopError("loop-host/invalid-request","Invalid Host Session")
    const credential=await this.api.tokens.credential(signal)
    const namespace:CollaborationNamespace={serverBaseUrl:this.credentials.server,accountId:credential.principal_id,installationId:this.installation,workspaceId:credential.workspace_id,hostSessionId:session}
    return {namespace,hasDeviceCredential:!!credential.device_credential}
  }
  async namespace(session:string,signal?:AbortSignal):Promise<CollaborationNamespace>{
    return (await this.sessionContext(session,signal)).namespace
  }
  private scope(document:any){
    const ns=document.namespace,binding=document.binding??{}
    const result:any={}
    for(const key of ["serverBaseUrl","workspaceId","accountId","installationId","coordinatorAgentId","bindingId","bindingRevision","bindingEpoch","projectId","boardId"])result[key]=text(ns[key])
    for(const key of ["workspaceName","accountName","coordinatorAgentName","projectName","boardName"])result[key]=text(binding[key])
    return {scope:result, ...(ns.deviceBindingId && ns.agentMemberId ? {deliveryScope:collaborationEventScope(ns)} : {})}
  }
  private subscription(document:any){return {state:document.snapshotRequired?"snapshot-required":document.subscriptionId?"live":document.binding?"connecting":"stopped",subscriptionId:document.subscriptionId??"",generation:document.generation??"",lastEventSeq:integer(document.deliveryCursor),snapshotRequired:document.snapshotRequired===true,deliveryGap:document.deliveryGap??null,reason:""}}
  private query(input:any){
    const query=new URLSearchParams()
    if(input.query){if(typeof input.query!=="string" || input.query.length>200)throw new LoopError("loop-host/invalid-request","Invalid directory query");query.set("q",input.query)}
    if(input.cursor){if(typeof input.cursor!=="string" || input.cursor.length>2048)throw new LoopError("loop-host/invalid-request","Invalid directory cursor");query.set("cursor",input.cursor)}
    if(input.limit!==undefined){if(!Number.isSafeInteger(input.limit)||input.limit<0)throw new LoopError("loop-host/invalid-request","Invalid directory limit");if(input.limit)query.set("limit",String(Math.min(input.limit,50)))}
    return query
  }
  async boards(input:any,signal?:AbortSignal){
    await this.identity.device(this.credentials,signal)
    const result=await this.api.request("workspace","GET","/collaboration/boards?"+this.query(input),undefined,signal,{lossless:true})
    if(!Array.isArray(result?.items) || result.items.length>200)throw new LoopError("loop-host/backend-invalid","Invalid collaboration boards")
    return {boards:result.items.map((item:any)=>({boardId:item.boardId||item.id,boardName:item.boardName||item.name,projectId:text(item.projectId),projectName:text(item.projectName),revision:revision(item.revision),capability:capability(item)})),nextCursor:result.nextCursor??"",revision:typeof result.revision==="string"?result.revision:revision(result.bindingEpoch),capability:capability(result)}
  }
  async bindings(signal?:AbortSignal){
    const credential=await this.api.tokens.credential(signal)
    const documents=await this.store.list({serverBaseUrl:this.credentials.server,accountId:credential.principal_id,installationId:this.installation,workspaceId:credential.workspace_id})
    return {bindings:documents.map(document=>{
      const ns=document.namespace
      const view=this.scope(document)
      return {...view.scope,...view,sessionId:ns.hostSessionId,deviceBindingId:ns.deviceBindingId??"",agentMemberId:ns.agentMemberId??"",hasMessageSubscriptions:Object.keys(document.managementSources??{}).length>0,active:collaborationActive(document),archived:ns.archive===true,state:ns.archive?"retired":document.snapshotRequired?"degraded":"ready"}
    }).sort((a,b)=>a.sessionId.localeCompare(b.sessionId))}
  }
  async bind(input:any,signal?:AbortSignal){
    const base=await this.namespace(input.sessionId,signal)
    if(input.workspaceId!==base.workspaceId || !id(input.boardId) || !id(input.coordinatorAgentId))throw new LoopError("loop-host/invalid-request","Invalid collaboration binding")
    const device=await this.identity.device(this.credentials,signal)
    const generation=integer(input.sourceGeneration??1)>0n?integer(input.sourceGeneration??1):1n
    const result=await this.api.request("workspace","POST","/collaboration/binding",{sourceSessionId:input.sessionId,sourceGeneration:generation,boardId:input.boardId},signal,{lossless:true})
    const binding=result?.binding
    if(!binding || !id(binding.bindingId) || integer(binding.bindingEpoch)<=0n || binding.status!=="active" || binding.agentId!==input.coordinatorAgentId || binding.boardId!==input.boardId || binding.sourceSessionId!==input.sessionId)throw new LoopError("loop-host/conflict","Collaboration binding identity changed")
    binding.sourceGeneration=generation
    const next={...base,bindingId:binding.bindingId,bindingEpoch:revision(binding.bindingEpoch),bindingRevision:revision(binding.bindingEpoch),deviceBindingId:device.bindingId,agentMemberId:binding.agentMemberId,boardId:input.boardId,projectId:text(binding.projectId),coordinatorAgentId:input.coordinatorAgentId}
    const document=await this.store.transition(base,next,binding,capability(binding),signal)
    return {...this.scope(document),capability:document.capability,subscription:this.subscription(document)}
  }
  async status(input:any,signal?:AbortSignal){
    const {namespace:base,hasDeviceCredential}=await this.sessionContext(input.sourceSessionId||input.sessionId,signal)
    let document=await this.store.load(base),stale=false
    // A fresh connection cannot query protected routes until bind() registers
    // its device. Reading status must neither claim a device nor invent a route.
    if(document.binding || hasDeviceCredential){
      const query=document.binding?"?generation="+encodeURIComponent(document.namespace.bindingId+":"+document.namespace.bindingEpoch):""
      let remote
      try{
        remote=await this.api.request("workspace","GET","/collaboration/binding"+query,undefined,signal,{lossless:true})
      }catch(error){
        if(!(error instanceof LoopError))throw error
        if(error.status===404)stale=!!document.binding
        else if(error.status===401 && !document.binding){
          // A proof can be saved before device registration finishes. Only an
          // authenticated, explicit "no device" response permits bootstrapping.
          const device=await this.api.request("workspace","GET","/external-host/binding",undefined,signal)
          if(device?.binding!==null)throw error
        }else throw error
      }
      const binding=remote?.binding
      if(!document.binding && binding?.status==="active" && binding.sourceSessionId===base.hostSessionId && id(binding.bindingId) && integer(binding.bindingEpoch)>0n){
        const next={...base,bindingId:binding.bindingId,bindingEpoch:revision(binding.bindingEpoch),bindingRevision:revision(binding.bindingEpoch),coordinatorAgentId:binding.agentId,agentMemberId:binding.agentMemberId,projectId:text(binding.projectId),boardId:binding.boardId}
        document=await this.store.transition(base,next,binding,capability(binding),signal)
      }
    }
    return {state:stale || !document.binding?"unbound":document.snapshotRequired?"degraded":"ready",...this.scope(document),capability:stale?capability(null):document.capability??capability(null),subscription:this.subscription(document),hasMessageSubscriptions:Object.keys(document.managementSources??{}).length>0,active:collaborationActive(document),deliveries:collaborationDeliveries(document),reason:stale?"Restore this Session's original Loop connection":document.binding?"":"This Session has no accepted collaboration channel yet"}
  }
  private async active(session:string,signal?:AbortSignal){
    const base=await this.namespace(session,signal),document=await this.store.load(base)
    if(!document.binding || !document.namespace.bindingId || !document.namespace.bindingEpoch)throw new LoopError("loop-host/not-bound","Prepare the Session's collaboration channel first")
    return {namespace:document.namespace as CollaborationNamespace,document}
  }
  // Read only: receipt, subscription mode, stream replay and Session admission
  // are separate facts. Never infer a wake from a Task status projection.
  async waitStatus(input:any,watchState:(route:CollaborationNamespace)=>string,signal?:AbortSignal){
    const {sessionId}=input
    let {taskId,subscriptionId}=input
    if(taskId!==undefined&&!id(taskId)||subscriptionId!==undefined&&!id(subscriptionId)||taskId&&subscriptionId)
      throw new LoopError("loop-host/invalid-request","Select exactly one Task or message subscription")
    const {namespace,document}=await this.active(sessionId,signal)
    const epoch=namespace.bindingEpoch!,epochNumber=BigInt(epoch)
    const managedTask=(state:any,task:string)=>managementForTask(state,task,sessionId,epoch)?.state==="active"
    const managedSubscription=(state:any,sub:string)=>{
      const source=Object.hasOwn(state.managementSources??{},sub)?state.managementSources[sub]:undefined
      return source?.sessionId===sessionId&&source.scopeId?source:undefined
    }
    if(!taskId&&!subscriptionId){
      const tasks=[...new Set(Object.values<any>(document.actions).map(action=>action.receipt?.receipt?.taskId).filter(id))].filter(task=>managedTask(document,task))
      const subscriptions=Object.keys(document.managementSources??{}).filter(sub=>managedSubscription(document,sub))
      if(tasks.length+subscriptions.length!==1)return {state:tasks.length+subscriptions.length?"scope_required":"scope_unavailable"}
      taskId=tasks[0];subscriptionId=subscriptions[0]
    }
    const scope=taskId?{taskId}:{subscriptionId}
    const result=(state:string,extra:object={})=>({state,...scope,bindingId:namespace.bindingId,bindingEpoch:epoch,...extra})
    const source=subscriptionId?managedSubscription(document,subscriptionId):undefined
    if(taskId?!managedTask(document,taskId):!source)return result("scope_unavailable")
    const binding=(await this.api.request("workspace","GET","/collaboration/binding?generation="+
      encodeURIComponent(namespace.bindingId+":"+epoch),undefined,signal,{lossless:true}))?.binding
    if(binding?.status!=="active"||binding.bindingId!==namespace.bindingId||
       revision(binding.bindingEpoch)!==epoch||binding.sourceSessionId!==sessionId||binding.agentMemberId!==namespace.agentMemberId)
      return result("scope_unavailable")
    const lookup=await lookupSubscription(this.api,epochNumber,taskId?"#"+taskId:"",subscriptionId??"",signal,!!taskId)
    if(subscriptionId&&(!lookup.selected||lookup.selected.scopeId!==source.scopeId))return result("scope_unavailable")
    const mode=lookup.selected?.mode??(taskId?lookup.implicitTaskMode:"")
    const current=await this.active(sessionId,signal)
    if((["serverBaseUrl","accountId","installationId","workspaceId","deviceBindingId","agentMemberId","bindingId","bindingEpoch"] as const)
       .some(key=>current.namespace[key]!==namespace[key])||
       (taskId?!managedTask(current.document,taskId):managedSubscription(current.document,subscriptionId)?.scopeId!==source.scopeId))return result("scope_unavailable")
    const actionScope=taskId?lookup.scopeId:source.scopeId
    const clientRequestIds=Object.values<any>(current.document.actions)
      .filter(action=>["recorded","dispatching","unknown"].includes(action.phase)&&
        (action.kind==="set-subscription"?action.request?.expectedScopeId===actionScope:
          taskId&&action.request?.taskId===taskId))
      .map(action=>action.clientRequestId)
    if(clientRequestIds.length)return result("reconcile_required",{clientRequestIds})
    if(mode==="pull"||mode==="paused")return result(mode,lookup.selected?.subscriptionId?{subscriptionId:lookup.selected.subscriptionId}:{})
    if(mode!=="push")return result("mode_unknown")
    const selectedSubscription=lookup.selected?.subscriptionId
    const matchesScope=(event:any)=>{
      if(taskId&&event.taskId===taskId)return true
      const sub=event.subscriptionId??event.event?.subscriptionId??event.event?.payload?.subscriptionId
      const scope=event.scopeId??event.event?.scopeId??event.event?.payload?.scopeId
      return !!selectedSubscription&&sub===selectedSubscription&&(!scope||scope===actionScope)
    }
    const matches=Object.values<any>(current.document.events).filter(matchesScope)
    if(matches.some(event=>["pending","needs-auth","reconcile"].includes(event.state)))return result("delivery_pending")
    const latest=[...matches,...(current.document.snapshotSkipped??[]).filter(matchesScope).map((event:any)=>({...event,state:"blocked"}))]
      .reduce((best,event)=>!best||integer(event.eventSeq)>integer(best.eventSeq)?event:best,undefined)
    if(latest&&["revoked","binding-conflict","blocked"].includes(latest.state))return result("delivery_unavailable",{eventId:latest.eventId})
    if(current.document.snapshotRequired||current.document.deliveryGap)return result("delivery_gap")
    const streamState=watchState(current.namespace)
    return streamState==="live"?result("push_ready"):result("push_unavailable",{streamState})
  }
  async prepareIntent(input:any,signal?:AbortSignal){
    if(!Array.isArray(input.targets) || !input.targets.length || input.targets.length>32 || typeof input.payloadText!=="string" || !input.payloadText || Buffer.byteLength(input.payloadText)>1<<20 || input.payloadDigest!=="sha256:"+hash(input.payloadText))throw new LoopError("loop-host/invalid-request","Invalid collaboration intent or digest")
    if(input.targets.some((target:any)=>!id(target?.targetId) || !["agent","human"].includes(target.targetType) || !Array.isArray(target.intendedActions) || target.intendedActions.some((action:any)=>!["dispatch","notify","followup","cancel","review","end-management"].includes(action))))throw new LoopError("loop-host/invalid-request","Invalid collaboration targets")
    const {namespace}=await this.active(input.sessionId,signal),ref=randomUUID(),expiresAt=input.expiresAt||new Date(Date.now()+900_000).toISOString()
    if(!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt)<=Date.now() || Date.parse(expiresAt)>Date.now()+900_000)throw new LoopError("loop-host/invalid-request","Invalid intent expiration")
    let firstExpansion=false
    await this.store.update(namespace,state=>{
      if(input.bindingRevision!==state.namespace.bindingRevision)throw new LoopError("loop-host/conflict","Collaboration binding changed")
      // Accepted Task sources and uncertain writes live with the ledger, not
      // with the initial dispatch window. The store still enforces its byte cap.
      const referenced=new Set(Object.values<any>(state.actions).map(action=>action.intentRef))
      let pending=0
      for(const [key,value] of Object.entries<any>(state.intents)){
        if(value?.state==="activated" && referenced.has(key))continue
        if(value && (["cancelled","expired","failed"].includes(value.state)||Date.parse(value.expiresAt)<=Date.now()))delete state.intents[key]
        else pending++
      }
      if(pending>=64)throw new LoopError("loop-host/queue-full","Too many pending collaboration intents")
      firstExpansion=!state.audienceAcknowledged
      if(input.shareScope?.expandedAudience===true){state.audienceAcknowledged=true;firstExpansion=false}
      state.intents[ref]={ref,state:"prepared",sessionId:input.sessionId,bindingRevision:input.bindingRevision,payloadDigest:input.payloadDigest,targets:parseWire(stringifyWire(input.targets)),shareScope:parseWire(stringifyWire(input.shareScope??{})),expiresAt,updatedAt:new Date().toISOString()}
    },signal)
    return {intentRef:ref,state:"prepared",expiresAt,sharePreview:{scope:input.shareScope?.scope??"",resourceRefs:input.shareScope?.resourceRefs??[],targetIds:input.targets.map((target:any)=>target.targetId),firstExpansion}}
  }
  async bindIntent(input:any,signal?:AbortSignal){
    if(typeof input.acceptedSerializedText!=="string" || input.payloadDigest!=="sha256:"+hash(input.acceptedSerializedText) || !id(input.requestId))throw new LoopError("loop-host/conflict","Accepted submission does not match the prepared intent")
    const {namespace}=await this.active(input.sessionId,signal)
    const document=await this.store.update(namespace,state=>{
      const record=state.intents[input.intentRef]
      if(!record || record.sessionId!==input.sessionId)throw new LoopError("loop-host/not-bound","Collaboration intent is unavailable")
      if(Date.parse(record.expiresAt)<=Date.now())throw new LoopError("loop-host/intent-expired","Collaboration intent expired")
      if(record.payloadDigest!==input.payloadDigest || input.bindingRevision && record.bindingRevision!==input.bindingRevision)throw new LoopError("loop-host/conflict","Collaboration submission changed after preparation")
      if(record.state==="bound" && record.requestId===input.requestId)return
      if(record.state!=="prepared")throw new LoopError("loop-host/conflict","Intent is already bound")
      Object.assign(record,{state:"bound",requestId:input.requestId,acceptedTextDigest:input.payloadDigest,updatedAt:new Date().toISOString()})
    },signal)
    return {intentRef:input.intentRef,state:document.intents[input.intentRef].state,boundAt:document.intents[input.intentRef].updatedAt}
  }
  async activateIntent(input:any,signal?:AbortSignal){
    if(!id(input.acceptedEventId) || !id(input.acceptedMessageId) || integer(input.acceptedSequence)<=0n)throw new LoopError("loop-host/invalid-request","Accepted Host message identity is incomplete")
    const {namespace}=await this.active(input.sessionId,signal)
    const document=await this.store.update(namespace,state=>{
      const intent=state.intents[input.intentRef]
      if(!intent || intent.sessionId!==input.sessionId)throw new LoopError("loop-host/not-bound","Collaboration intent is unavailable")
      if(intent.acceptedTextDigest!==input.acceptedTextDigest || intent.payloadDigest!==input.acceptedTextDigest)throw new LoopError("loop-host/conflict","Accepted message changed after binding")
      if(["activated","activating"].includes(intent.state) && (intent.acceptedEventId!==input.acceptedEventId || intent.acceptedMessageId!==input.acceptedMessageId || integer(intent.acceptedSequence)!==integer(input.acceptedSequence)))throw new LoopError("loop-host/conflict","Intent acceptance identity changed")
      if(intent.state==="activated")return
      if(!["bound","activating"].includes(intent.state) || Date.parse(intent.expiresAt)<=Date.now())throw new LoopError("loop-host/conflict","Intent is not ready for activation")
      Object.assign(intent,{state:"activating",acceptedEventId:input.acceptedEventId,acceptedMessageId:input.acceptedMessageId,acceptedSequence:integer(input.acceptedSequence),updatedAt:new Date().toISOString()})
    },signal)
    const intent=document.intents[input.intentRef]
    if(intent.state==="activated")return {intentRef:intent.ref,state:"activated",userIntentId:intent.userIntentId}
    const actions=new Set<string>(["cancel","inspect"])
    for(const target of intent.targets){for(const action of target.intendedActions)actions.add(action);actions.add("followup")}
    const request={intentRef:intent.ref,sourceSessionId:intent.sessionId,sourceGeneration:integer(document.binding.sourceGeneration??1),sourceRequestId:intent.requestId,sourceEventId:intent.acceptedEventId,sourceHash:input.acceptedTextDigest.slice(7),expectedBindingEpoch:integer(document.binding.bindingEpoch),allowedActions:[...actions].sort(),targetIds:intent.targets.map((target:any)=>target.targetId),resourceRefs:intent.shareScope.resourceRefs??[],shareScope:{projectId:namespace.projectId??"",boardId:namespace.boardId,visibility:intent.shareScope.scope==="selected-resources"?"project_members":"task_participants",resourceRefs:intent.shareScope.resourceRefs??[]},budget:{maxRuns:20,maxDepth:4,maxAutoWakes:20,deadline:null},expiresAt:intent.expiresAt}
    const result=await this.api.request("workspace","POST","/collaboration/intents",request,signal,{lossless:true})
    if(!id(result?.userIntentId))throw new LoopError("loop-host/backend-invalid","Intent activation returned no identity",0,true)
    await this.store.update(namespace,state=>{
      const current=state.intents[input.intentRef]
      if(!current || !["activating","activated"].includes(current.state))throw new LoopError("loop-host/conflict","Intent changed during activation")
      Object.assign(current,{state:"activated",userIntentId:result.userIntentId,updatedAt:new Date().toISOString()})
    },signal)
    return {intentRef:intent.ref,state:"activated",userIntentId:result.userIntentId}
  }
  async action(input:any,signal?:AbortSignal,emit:(value:any)=>void=()=>{}){
    if(!["dispatch","followup","notify","cancel","review","end-management","inspect","set-subscription","list-subscriptions","read-updates"].includes(input.action) || !input.arguments || typeof input.arguments!=="object" || Array.isArray(input.arguments))throw new LoopError("loop-host/invalid-request","Invalid collaboration action")
    const {namespace,document}=await this.active(input.sessionId,signal)
    if(["set-subscription","list-subscriptions","read-updates"].includes(input.action))return subscriptionAction(this.api,this.store,namespace,document,input,event=>emit({type:"loop-host-collaboration-event",scope:collaborationEventScope(namespace),event}),signal)
    if(["dispatch","followup","notify"].includes(input.action) && document.binding.status!=="active")throw new LoopError("loop-host/conflict","The original collaboration route is retired")
    const request=parseWire(stringifyWire(input.arguments));delete request.payloadHash
    request.expectedBindingEpoch=integer(document.binding.bindingEpoch)
    if(input.action==="inspect"){
      const result=await this.api.request("workspace","POST","/collaboration/actions/inspect",request,signal,{lossless:true})
      if(result?.task){
        const projection={...result.task,available:true};delete projection.description
        if(projection.taskId!==request.taskId)throw new LoopError("loop-host/backend-invalid","Task inspection returned a different identity")
        await this.store.update(namespace,current=>{
          const previous=current.taskStates[request.taskId]
          if(!previous || integer(projection.revision)>=integer(previous.revision))current.taskStates[request.taskId]=projection
        },signal)
      }
      return result
    }
    if(input.continuationRef && input.action==="followup"){
      // One accepted continuation can cover several Tasks, each with its own
      // recipient. Never infer that recipient from the union of all targets.
      const task=document.continuations[input.continuationRef]?.tasks.find((item:any)=>item.taskId===request.taskId)
      const targetId=task?.targetIds.length===1?task.targetIds[0]:undefined,kind=task?.targetTypes?.[targetId]
      if(!id(targetId)||!["human","agent"].includes(kind)||request.target && (request.target.targetId!==targetId||request.target.kind!==kind))throw new LoopError("loop-host/conflict","Task target is ambiguous or differs from its accepted recipient")
      request.target={targetId,kind}
    }
    const intent=input.continuationRef?await new CollaborationContinuation(this.store,this.api).activate(namespace,document,input,signal):document.intents[input.intentRef]
    if(!intent || intent.state!=="activated" || !id(intent.userIntentId))throw new LoopError("loop-host/not-bound","An accepted collaboration submission is required")
    const clientRequestId=input.clientRequestId || (input.actionKey?"act-"+hash(intent.userIntentId+"\0"+input.actionKey).slice(0,32):"")
    if(!id(clientRequestId))throw new LoopError("loop-host/invalid-request","Invalid collaboration action identity")
    if(input.action==="followup" && !request.target){
      const original=Object.values<any>(document.actions).find(action=>action.phase==="completed" && action.intentRef===intent.ref && action.receipt?.receipt?.taskId===request.taskId && action.request.target)
      if(original)request.target=original.request.target
      else if(intent.targets.length===1)request.target={targetId:intent.targets[0].targetId,kind:intent.targets[0].targetType}
      else throw new LoopError("loop-host/conflict","Task target is ambiguous")
    }
    const shareScope={projectId:namespace.projectId??"",boardId:namespace.boardId,visibility:intent.shareScope.scope==="selected-resources"?"project_members":"task_participants",resourceRefs:intent.shareScope.resourceRefs??[]}
    if(input.action==="dispatch"){
      request.task??={};request.task.projectId??=namespace.projectId??"";request.task.boardId??=namespace.boardId
      request.inputRefs??=[];request.shareScope=shareScope
    }
    if(["notify","followup"].includes(input.action))request.shareScope??=shareScope
    if(input.action==="notify" && request.trigger){request.triggerKind=request.trigger.kind;request.taskId??=request.trigger.taskId;delete request.trigger;if(request.taskId===undefined)delete request.taskId}
    request.clientRequestId=clientRequestId;request.userIntentId=intent.userIntentId
    return new CollaborationLedger(this.store,this.api).record(namespace,input.action,request,intent.ref,signal,undefined,text(intent.expiresAt))
  }
  async reconcile(input:any,signal?:AbortSignal){
    let {namespace}=await this.active(input.sessionId,signal)
    if(input.bindingId || input.bindingEpoch){
      if(!id(input.bindingId)||typeof input.bindingEpoch!=="string"||!/^\d+$/u.test(input.bindingEpoch))throw new LoopError("loop-host/invalid-request","Invalid collaboration route")
      if(input.bindingId!==namespace.bindingId || input.bindingEpoch!==namespace.bindingEpoch)namespace={...namespace,bindingId:input.bindingId,bindingEpoch:input.bindingEpoch,archive:true}
    }
    const result=await new CollaborationLedger(this.store,this.api).reconcile(namespace,input,signal)
    const subscription=this.subscription(result.state)
    const watchRoute=subscription.snapshotRequired&&result.receipts.some(receipt=>receipt.mode==="push")
      ? {sessionId:input.sessionId,bindingId:result.state.namespace.bindingId,bindingEpoch:result.state.namespace.bindingEpoch} : undefined
    return {receipts:result.receipts,deliveries:(input.eventIds??[]).flatMap((id:string)=>result.state.events[id]?[result.state.events[id]]:[]),subscription,watchRoute}
  }
  async continuation(input:any,signal?:AbortSignal){
    const {namespace}=await this.active(input.sessionId,signal)
    return new CollaborationContinuation(this.store,this.api).prepare(namespace,input,signal)
  }
  async watchRoute(input:any,signal?:AbortSignal){
    let {namespace}=await this.active(input.sessionId,signal)
    if(input.bindingId||input.bindingEpoch){
      if(!id(input.bindingId)||typeof input.bindingEpoch!=="string"||!/^\d+$/u.test(input.bindingEpoch)||BigInt(input.bindingEpoch)<1n)throw new LoopError("loop-host/invalid-request","Invalid collaboration watch route")
      if(input.bindingId!==namespace.bindingId||input.bindingEpoch!==namespace.bindingEpoch){
        const archived=await this.store.load({...namespace,bindingId:input.bindingId,bindingEpoch:input.bindingEpoch,archive:true})
        if(!archived.binding)throw new LoopError("loop-host/not-found","Original collaboration route is unavailable")
        namespace=archived.namespace
      }
    }
    return namespace
  }
  async watch(namespace:CollaborationNamespace,emit:(value:any)=>void,lifetime:AbortSignal,signal?:AbortSignal){
    const device=await this.identity.device(this.credentials,signal)
    if(namespace.deviceBindingId && namespace.deviceBindingId!==device.bindingId)throw new LoopError("loop-host/conflict","Collaboration device binding changed")
    namespace.deviceBindingId=device.bindingId
    await this.store.update(namespace,current=>{current.namespace.deviceBindingId=device.bindingId},signal)
    if(lifetime.aborted||signal?.aborted)throw new LoopError("loop-host/cancelled","Collaboration watch cancelled")
    return new CollaborationWatch(this.api,this.store,namespace,emit,lifetime)
  }
  async accept(input:any,signal?:AbortSignal){
    let {namespace}=await this.active(input.sourceSessionId||input.sessionId,signal)
    if(input.bindingId||input.bindingEpoch){
      if(!id(input.bindingId)||typeof input.bindingEpoch!=="string"||!/^\d+$/u.test(input.bindingEpoch))throw new LoopError("loop-host/invalid-request","Invalid original delivery route")
      if(input.bindingId!==namespace.bindingId||input.bindingEpoch!==namespace.bindingEpoch)namespace={...namespace,bindingId:input.bindingId,bindingEpoch:input.bindingEpoch,archive:true}
    }
    return new CollaborationInbox(this.store,this.api).accept(namespace,input,signal)
  }
  async authorize(input:any,signal?:AbortSignal){
    let {namespace}=await this.active(input.sessionId,signal)
    if(input.bindingId||input.bindingEpoch){
      if(!id(input.bindingId)||typeof input.bindingEpoch!=="string"||!/^\d+$/u.test(input.bindingEpoch)||BigInt(input.bindingEpoch)<1n)throw new LoopError("loop-host/invalid-request","Invalid original authorization route")
      if(input.bindingId!==namespace.bindingId||input.bindingEpoch!==namespace.bindingEpoch){
        const original=await this.store.load({...namespace,bindingId:input.bindingId,bindingEpoch:input.bindingEpoch,archive:true})
        if(!original.binding)throw new LoopError("loop-host/not-found","Original authorization route is unavailable")
        namespace=original.namespace
      }
    }
    return authorizeCollaboration(this.api,this.store,namespace,input,signal)
  }
  async cancel(input:any,signal?:AbortSignal){
    if(input.target?.kind!=="intent" || !id(input.clientRequestId) || !id(input.target.id) || typeof input.reason!=="string" || input.reason.length>4096)throw new LoopError("loop-host/invalid-request","Only an unaccepted local intent can be discarded here")
    const {namespace}=await this.active(input.sessionId,signal),payloadHash="sha256:"+hash(input.target.id+"\0"+input.reason)
    let receipt:any
    await this.store.update(namespace,current=>{
      const previous=current.actions[input.clientRequestId]
      if(previous){if(previous.kind!=="cancel-intent" || previous.payloadHash!==payloadHash)throw new LoopError("loop-host/conflict","Cancellation id was reused");receipt=previous.receipt;return}
      const intent=current.intents[input.target.id]
      if(!intent)throw new LoopError("loop-host/not-found","Original intent is unavailable")
      if(input.expectedStatus && intent.state!==input.expectedStatus || ["activated","activating","accepted"].includes(intent.state))throw new LoopError("loop-host/conflict","Accepted work requires an explicit Task cancellation")
      if(Object.keys(current.actions).length>=512)throw new LoopError("loop-host/queue-full","Collaboration action history is full")
      Object.assign(intent,{state:"cancelled",reason:input.reason,updatedAt:new Date().toISOString()})
      receipt={clientRequestId:input.clientRequestId,action:"cancel",state:"canceled",intentRef:input.target.id,recordedAt:intent.updatedAt}
      current.actions[input.clientRequestId]={clientRequestId:input.clientRequestId,intentRef:input.target.id,kind:"cancel-intent",payloadHash,receipt,phase:"completed",updatedAt:intent.updatedAt}
    },signal)
    return {state:"not-dispatched",receipt}
  }
  async directory(input:any,signal?:AbortSignal){
    const namespace=await this.namespace(input.sessionId,signal),query=this.query(input)
    if(input.kinds?.length===1){if(!["agent","human"].includes(input.kinds[0]))throw new LoopError("loop-host/invalid-request","Invalid directory kind");query.set("kind",input.kinds[0])}
    const result=await this.api.request("workspace","GET","/collaboration/directory?"+query,undefined,signal,{lossless:true})
    if(!Array.isArray(result?.items)||result.items.length>200)throw new LoopError("loop-host/backend-invalid","Invalid collaboration directory")
    const entries=result.items.map((item:any)=>{
      const kind=item.kind||item.targetType,target=item.targetId||item.memberId,caps=item.capabilities??item
      if(!["agent","human"].includes(kind)||!id(target))throw new LoopError("loop-host/backend-invalid","Invalid directory identity")
      return {targetId:target,memberId:text(item.memberId),targetType:kind,displayName:text(item.displayName),description:text(item.ownershipLabel),stableRef:"loop-collaboration:"+kind+"/"+target,visible:item.visible===true,notifiable:item.notifiable===true,delegable:item.delegable===true,needsAccess:item.needsAccess===true,
        capability:{available:item.visible===true,assignable:caps.assign===true,execute:caps.execute===true,delegable:item.delegable===true&&caps.execute===true,notifiable:item.notifiable===true,conditionalNotify:item.notifiable===true,followup:caps.followup===true,cancel:caps.cancel===true,reason:text(item.unsupportedReason)},projectId:text(item.projectId),projectName:text(item.projectName),workspaceName:text(item.workspaceName),revision:revision(item.revision??result.revision),staleReason:text(item.unsupportedReason),...(kind==="agent" && item.agentId?{agentId:item.agentId,...(item.mention?{mention:item.mention}:{})}:{})}
    })
    return {entries,items:entries,groups:{agent:entries.filter((entry:any)=>entry.targetType==="agent"),human:entries.filter((entry:any)=>entry.targetType==="human")},nextCursor:result.nextCursor??"",revision:revision(result.revision),freshness:"live",truncated:result.hasMore===true,needsAccessCount:entries.filter((item:any)=>item.needsAccess).length,
      cacheKey:"dsh-"+hash([namespace.serverBaseUrl,namespace.accountId,namespace.installationId,namespace.workspaceId,namespace.hostSessionId].join("\0")).slice(0,36)}
  }
}
