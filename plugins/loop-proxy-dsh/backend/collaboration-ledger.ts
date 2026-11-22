import {createHash} from "node:crypto"
import {CollaborationStore} from "./collaboration-store.ts"
import type {CollaborationNamespace} from "./collaboration-store.ts"
import {HostAPI} from "./host-api.ts"
import {acquireLock} from "./storage.ts"
import {LoopError} from "./errors.ts"
import {stringifyWire,parseWire} from "./codec.ts"

const recoverable=(record:any)=>record && ["recorded","dispatching","unknown"].includes(record.phase)
const digest=(value:string)=>createHash("sha256").update(value).digest("hex")
function pruneActions(actions:Record<string,any>,limit:number){
  const entries=Object.entries(actions)
  if(entries.length<limit)return
  // Keep one accepted authority source per intent/Task, preferring dispatch,
  // and its independent closure. Unknown outcomes can never be discarded.
  const proofs=new Map<string,string>()
  for(const [id,action] of entries){
    const task=action.receipt?.receipt?.taskId
    if(action.phase!=="completed"||!["dispatch","followup","review","end-management"].includes(action.kind)||!task)continue
    const key=action.intentRef+"\0"+task+(action.kind==="end-management"?"\0closed":"")
    const previous=proofs.get(key)
    if(!previous||action.kind==="dispatch"&&actions[previous].kind!=="dispatch"||(action.kind===actions[previous].kind||action.kind!=="dispatch"&&actions[previous].kind!=="dispatch")&&id<previous)proofs.set(key,id)
  }
  const protectedIDs=new Set(proofs.values())
  let count=entries.length
  for(const [id] of entries.filter(([id,action])=>action.phase==="completed"&&!protectedIDs.has(id)).sort((a,b)=>String(a[1].updatedAt).localeCompare(String(b[1].updatedAt))||a[0].localeCompare(b[0]))){
    if(count<limit)break
    delete actions[id];count--
  }
}
/** Persist the exact request before I/O. Replay never reconstructs its authority. */
export class CollaborationLedger {
  private store:CollaborationStore
  private api:HostAPI
  constructor(store:CollaborationStore,api:HostAPI){this.store=store;this.api=api}
  async record(namespace:CollaborationNamespace,kind:string,request:any,intentRef:string,signal?:AbortSignal,managementSource?:any,sourceExpiresAt?:string){
    const copy=parseWire(stringifyWire(request));delete copy.payloadHash
    const payloadHash="sha256:"+digest(stringifyWire(copy)),id=copy.clientRequestId
    await this.store.update(namespace,state=>{
      const previous=state.actions[id]
      if(previous){if(previous.kind!==kind || previous.payloadHash!==payloadHash || managementSource&&stringifyWire(previous.managementSource??null)!==stringifyWire(managementSource))throw new LoopError("loop-host/conflict","Collaboration action id was reused with different input");return}
      // Retained Task-management evidence is not permission to start new work.
      // An already recorded request above retains its exact replay identity.
      if(sourceExpiresAt!==undefined && ["dispatch","notify"].includes(kind) && !(Date.parse(sourceExpiresAt)>Date.now()))throw new LoopError("loop-host/intent-expired","Original dispatch authorization expired")
      pruneActions(state.actions,512)
      if(Object.keys(state.actions).length>=512)throw new LoopError("loop-host/queue-full","Collaboration action history is full")
      state.actions[id]={clientRequestId:id,intentRef,kind,payloadHash,request:copy,phase:"recorded",updatedAt:new Date().toISOString(),...(managementSource?{managementSource:parseWire(stringifyWire(managementSource))}:{})}
    },signal)
    return this.send(namespace,id,signal)
  }
  private async route(namespace:CollaborationNamespace){
    const state=await this.store.load(namespace)
    if(state.namespace.bindingId===namespace.bindingId && state.namespace.bindingEpoch===namespace.bindingEpoch)return namespace
    return {...namespace,archive:true}
  }
  async send(namespace:CollaborationNamespace,id:string,signal?:AbortSignal){
    // The ownership key is invariant when a binding is archived. Kernel locks
    // also exclude another Host process and release automatically on a crash.
    const path=this.store.file({...namespace,archive:false}).path+".send-"+digest(namespace.bindingId+"\0"+namespace.bindingEpoch+"\0"+id)+".lock"
    const release=await acquireLock(path,signal)
    try{
      let route=await this.route(namespace)
      const state=await this.store.load(route),record=state.actions[id]
      if(!record)throw new LoopError("loop-host/not-bound","Original collaboration request is unavailable")
      if(record.receipt)return {...record.receipt,replayed:true}
      if(!recoverable(record))throw new LoopError("loop-host/conflict",record.phase==="failed" && Number.isInteger(record.httpStatus) ? `Loop rejected the original ${record.kind} (HTTP ${record.httpStatus}). Inspect the original target and inputs before retrying.` : "Collaboration action has a terminal outcome")
      if(record.kind==="set-subscription" && !record.request.expectedScopeId)throw new LoopError("loop-host/conflict","Legacy subscription request has no stable scope proof")
      await this.store.update(route,current=>{current.actions[id].phase="dispatching";current.actions[id].updatedAt=new Date().toISOString()},signal)
      let result:any,failure:unknown
      try{
        result=await this.api.request("workspace","POST","/collaboration/actions/"+record.kind,record.request,signal,{lossless:true})
        if(!result || typeof result!=="object" || Array.isArray(result))throw new LoopError("loop-host/backend-invalid","Invalid collaboration action receipt",0,true)
      }catch(error){failure=error}
      const save=(current:any)=>{
        const item=current.actions[id]
        if(!item || item.payloadHash!==record.payloadHash)throw new LoopError("loop-host/conflict","Original collaboration request changed")
        item.updatedAt=new Date().toISOString()
        if(failure){
          const known=failure instanceof LoopError && !failure.outcomeUnknown && failure.status>=400 && failure.status<500 && ![408,429].includes(failure.status)
          if(known && failure instanceof LoopError)item.httpStatus=failure.status
          item.phase=known?"failed":"unknown";item.reason=known?"Loop rejected the collaboration request":"The original request requires reconciliation"
        }else{
          item.phase="completed";item.reason="";item.receipt=result
          if(item.kind==="set-subscription"){
            if(result.mode==="push"){current.snapshotRequired=true;delete current.snapshotProgress}
            if(item.managementSource){
              if(typeof result.subscriptionId!=="string"||!result.subscriptionId)throw new LoopError("loop-host/backend-invalid","Subscription response has no identity",0,true)
              current.managementSources??={}
              const previous=current.managementSources[result.subscriptionId]
              if(!previous||previous.messageId!==item.managementSource.messageId)current.managementSources[result.subscriptionId]={...item.managementSource,target:result.currentTarget||result.target,scopeId:result.scopeId}
            }
          }
        }
      }
      // Persist even when the caller cancelled: the remote side may have acted.
      try{await this.store.update(route,save)}catch(error){
        const archived=await this.route(namespace)
        if(route.archive || !archived.archive)throw error
        route=archived;await this.store.update(route,save)
      }
      if(failure)throw failure
      return {...result,replayed:false}
    }finally{await release()}
  }
  async reconcile(namespace:CollaborationNamespace,input:any,signal?:AbortSignal){
    let route=await this.route(namespace),state=await this.store.load(route)
    const ids=input.clientRequestIds?.length?input.clientRequestIds:Object.keys(state.actions).filter(id=>recoverable(state.actions[id]))
    if(!Array.isArray(ids)||ids.length>512||ids.some(id=>typeof id!=="string"||!state.actions[id]))throw new LoopError("loop-host/invalid-request","Original collaboration requests are required")
    let failure:unknown
    for(const id of ids)if(recoverable(state.actions[id]))try{await this.send(namespace,id,signal)}catch(error){failure??=error}
    route=await this.route(namespace);state=await this.store.load(route)
    if(ids.some(id=>recoverable(state.actions[id])))throw new LoopError("loop-host/result-unknown","The exact collaboration action still requires reconciliation",0,true)
    if(failure)throw failure
    return {receipts:ids.flatMap(id=>state.actions[id].receipt?[state.actions[id].receipt]:[]),state}
  }
}
