import {createHash} from "node:crypto"
import {integer,parseWire,stringifyWire} from "./codec.ts"
import {LoopError} from "./errors.ts"
import {CollaborationStore} from "./collaboration-store.ts"
import type {CollaborationNamespace} from "./collaboration-store.ts"
import {HostAPI} from "./host-api.ts"

const hash=(value:string)=>createHash("sha256").update(value).digest("hex")
const valid=(value:unknown)=>typeof value==="string" && /^[a-zA-Z0-9_.:-]{1,255}$/u.test(value)
const read=(event:any,key:string)=>event?.[key] || event?.payload?.[key] || ""
export function blockDelivery(item:any,reason:string){
  const subscriptionId=read(item.event,"subscriptionId"),scopeId=read(item.event,"scopeId")
  if(subscriptionId)item.subscriptionId??=subscriptionId
  if(scopeId)item.scopeId??=scopeId
  item.state="blocked";item.reason=reason;item.event={}
}
const sequence=(value:any)=>typeof value==="string"&&/^\d+$/u.test(value)?BigInt(value):integer(value||0)
export function eventHash(event:any){
  const copy=parseWire(stringifyWire(event))
  for(const key of ["createdAt","subscriptionId","subscriptionRevision","mode"])delete copy[key]
  if(copy.payload)for(const key of ["subscriptionId","subscriptionRevision","mode"])delete copy.payload[key]
  return "sha256:"+hash(stringifyWire(copy))
}
export function eventMatches(event:any,namespace:CollaborationNamespace){
  const kind=event.type
  if(!["collaboration.directory_changed","collaboration.subscription_invalidated","collaboration.message","collaboration.task_message","collaboration.task_input_failed","collaboration.task_changed","collaboration.delivery_unavailable"].includes(kind))return false
  if(read(event,"targetKind")!=="coordinator"||read(event,"targetBindingId")!==namespace.bindingId||sequence(read(event,"targetBindingEpoch")).toString()!==namespace.bindingEpoch||read(event,"targetSourceSessionId")!==namespace.hostSessionId)return false
  for(const [legacy,current] of [["bindingId","targetBindingId"],["sourceSessionId","targetSourceSessionId"]])if(read(event,legacy)&&read(event,legacy)!==read(event,current))return false
  if(read(event,"bindingEpoch")&&sequence(read(event,"bindingEpoch"))!==sequence(read(event,"targetBindingEpoch")))return false
  if(read(event,"workspaceId")!==namespace.workspaceId||!namespace.deviceBindingId||read(event,"deviceBindingId")!==namespace.deviceBindingId||!namespace.agentMemberId||read(event,"agentMemberId")!==namespace.agentMemberId)return false
  if(["collaboration.directory_changed","collaboration.subscription_invalidated"].includes(kind))return !read(event,"taskId")&&!read(event,"runId")
  if(read(event,"originBindingId")!==namespace.bindingId||sequence(read(event,"originBindingEpoch")).toString()!==namespace.bindingEpoch||read(event,"originSourceSessionId")!==namespace.hostSessionId)return false
  if(kind==="collaboration.delivery_unavailable"&&read(event,"subscriptionId"))return !!read(event,"scopeId")&&!read(event,"runId")
  if(["collaboration.task_changed","collaboration.delivery_unavailable"].includes(kind))return !!read(event,"taskId")
  if(read(event,"runId"))return false
  if(kind==="collaboration.message")return !!read(event,"subscriptionId")&&!!read(event,"messageId")
  return !!read(event,"taskId")&&(kind!=="collaboration.task_message"||!!read(event,"messageId"))
}
export class CollaborationInbox {
  private store:CollaborationStore
  private api:HostAPI
  constructor(store:CollaborationStore,api:HostAPI){this.store=store;this.api=api}
  private apply(namespace:CollaborationNamespace,event:any,current:any,snapshot=false){
    if(!valid(event?.eventId)||sequence(event.eventSeq)<=0n||!eventMatches(event,namespace))throw new LoopError("loop-host/conflict","Collaboration event route does not match the authenticated binding")
    const eventSeq=sequence(event.eventSeq),kind=event.type,payloadHash=eventHash(event)
    let delivery:any,emit=false
    {
      if(["collaboration.directory_changed","collaboration.subscription_invalidated","collaboration.task_changed","collaboration.delivery_unavailable"].includes(kind)){
        if(kind==="collaboration.task_changed"){
          const task=event.task??event.payload?.task,taskId=read(event,"taskId")
          if(task?.taskId!==taskId)throw new LoopError("loop-host/backend-invalid","Task projection identity changed")
          const previous=current.taskStates[taskId]
          if(!previous||sequence(task.revision)>=sequence(previous.revision)){
            const copy=parseWire(stringifyWire(task));delete copy.description
            current.taskStates[taskId]=copy
          }
        }
        if(kind==="collaboration.delivery_unavailable"){
          const previous=current.events[event.eventId]
          if(previous){
            if(!['committed','canceled'].includes(previous.state))blockDelivery(previous,"Loop delivery is no longer available")
          }else if(snapshot||eventSeq>integer(current.deliveryCursor)){
            const taskId=read(event,"taskId"),subscriptionId=read(event,"subscriptionId"),scopeId=read(event,"scopeId")
            // Same bounded, body-free journal as unavailable snapshot events.
            current.snapshotSkipped=[...(current.snapshotSkipped??[]),{eventId:event.eventId,eventSeq,reason:"unavailable",
              ...(valid(taskId)?{taskId}:{}),...(valid(subscriptionId)&&valid(scopeId)?{subscriptionId,scopeId}:{})}].slice(-64)
          }
        }
        if(!snapshot&&eventSeq>integer(current.deliveryCursor))current.deliveryCursor=eventSeq
        emit=true;return {delivery,emit}
      }
      const content=String(read(event,"contentHash")).replace(/^sha256:/u,"")
      const contentHash=/^[a-fA-F0-9]{64}$/u.test(content)?"sha256:"+content.toLowerCase():""
      const incoming:any={eventId:event.eventId,eventSeq,kind,payloadHash,receivedAt:new Date().toISOString(),state:"pending",sourceSessionId:namespace.hostSessionId,bindingId:namespace.bindingId,bindingEpoch:namespace.bindingEpoch,taskId:read(event,"taskId"),contentHash,event:parseWire(stringifyWire(event))}
      const subscriptionId=read(event,"subscriptionId"),scopeId=read(event,"scopeId")
      if(subscriptionId){incoming.subscriptionId=subscriptionId;if(scopeId)incoming.scopeId=scopeId}
      incoming.deliveryKey="sha256:"+hash(stringifyWire([event.deliveryId||event.eventId,event.eventId,incoming.sourceSessionId,incoming.bindingId,incoming.bindingEpoch,incoming.taskId,contentHash]))
      incoming.deliveryId="delivery-"+incoming.deliveryKey.slice(7,39)
      const previous=current.events[event.eventId]??current.events[current.deliveryIndex[incoming.deliveryKey]]
      if(previous){
        for(const key of ["bindingId","bindingEpoch","sourceSessionId","taskId","contentHash"])if(previous[key]!==incoming[key])throw new LoopError("loop-host/conflict","Duplicate event changed its delivery identity")
        if(previous.payloadHash!==payloadHash&&eventHash(previous.event)!==payloadHash)throw new LoopError("loop-host/conflict","Duplicate event changed its content")
        if(["pending","needs-auth","reconcile"].includes(previous.state)){
          if(subscriptionId)previous.subscriptionId??=subscriptionId
          if(scopeId)previous.scopeId??=scopeId
          previous.event={...incoming.event,...(previous.event.createdAt?{createdAt:previous.event.createdAt}:{})};emit=true
        }
        delivery=previous;return {delivery,emit}
      }
      if(!snapshot && eventSeq<=integer(current.deliveryCursor))return {delivery,emit}
      const full=()=>Object.keys(current.events).length>=512||Buffer.byteLength(stringifyWire(current.events))+Buffer.byteLength(stringifyWire(incoming))>4<<20
      const removable=Object.values<any>(current.events).filter(item=>
        ["collaboration.message","collaboration.task_message","collaboration.task_input_failed"].includes(item.kind)&&
        ["committed","canceled"].includes(item.state)
      ).sort((a,b)=>sequence(a.eventSeq)<sequence(b.eventSeq)?-1:1)
      for(const item of removable){if(!full())break;delete current.events[item.eventId];delete current.deliveryIndex[item.deliveryKey]}
      if(full())throw new LoopError("loop-host/queue-full","Collaboration inbox requires draining")
      current.events[event.eventId]=incoming;current.deliveryIndex[incoming.deliveryKey]=event.eventId;if(!snapshot)current.deliveryCursor=eventSeq;delivery=incoming;emit=true
    }
    return {delivery,emit}
  }
  async receive(namespace:CollaborationNamespace,event:any,signal?:AbortSignal){
    let result:any
    const document=await this.store.update(namespace,current=>{result=this.apply(namespace,event,current)},signal)
    return {document,...result}
  }
  async snapshot(namespace:CollaborationNamespace,signal?:AbortSignal){
    const before=await this.store.load(namespace),generation=namespace.bindingId+":"+namespace.bindingEpoch
    const query=new URLSearchParams({generation,afterEventSeq:integer(before.deliveryCursor).toString(),...(before.snapshotProgress?{cursor:before.snapshotProgress.cursor}:{})})
    const page=await this.api.request("workspace","GET","/collaboration/snapshot?"+query,undefined,signal,{lossless:true})
    if(page?.generation!==generation||page.bindingId!==namespace.bindingId||sequence(page.bindingEpoch).toString()!==namespace.bindingEpoch||page.watermarkEventSeq===undefined||sequence(page.watermarkEventSeq)<0n||before.snapshotProgress&&sequence(page.watermarkEventSeq)!==sequence(before.snapshotProgress.watermark))throw new LoopError("loop-host/conflict","Snapshot route or watermark changed")
    if(typeof page.hasMore!=="boolean"||page.hasMore!==!!page.nextCursor||page.hasMore&&page.nextCursor===query.get("cursor")||!Array.isArray(page.nativeTaskEvents??[])||(page.nativeTaskEvents??[]).some((event:any)=>!["collaboration.message","collaboration.task_message","collaboration.task_input_failed"].includes(event.type)||!eventMatches(event,namespace)))throw new LoopError("loop-host/backend-invalid","Snapshot pagination or event routes are invalid")
    const deliveries:any[]=[]
    const document=await this.store.update(namespace,current=>{
      if(stringifyWire(current.snapshotProgress??null)!==stringifyWire(before.snapshotProgress??null)||integer(current.deliveryCursor)!==integer(before.deliveryCursor))throw new LoopError("loop-host/conflict","Snapshot recovery state changed")
      for(const event of page.nativeTaskEvents??[]){const result=this.apply(namespace,event,current,true);if(result.emit&&result.delivery)deliveries.push(result.delivery)}
      for(const task of page.taskStates??[]){
        if(!valid(task.taskId))throw new LoopError("loop-host/backend-invalid","Invalid snapshot Task identity")
        const previous=current.taskStates[task.taskId]
        if(!previous||sequence(task.revision)>=sequence(previous.revision)){const copy=parseWire(stringifyWire(task));delete copy.description;current.taskStates[task.taskId]=copy}
      }
      for(const skipped of page.skippedEvents??[]){
        const item=current.events[skipped.eventId]
        if(item&&!['committed','canceled'].includes(item.state))blockDelivery(item,"Loop delivery is no longer available")
      }
      current.snapshotSkipped=[...(current.snapshotSkipped??[]),...(page.skippedEvents??[])].slice(-64)
      current.generation=generation;current.snapshotRequired=page.hasMore
      if(page.deliveryGap)current.deliveryGap=page.deliveryGap
      if(page.hasMore)current.snapshotProgress={cursor:page.nextCursor,watermark:page.watermarkEventSeq}
      else{delete current.snapshotProgress;if(sequence(page.watermarkEventSeq)>integer(current.deliveryCursor))current.deliveryCursor=page.watermarkEventSeq}
    },signal)
    return {document,deliveries,hasMore:page.hasMore}
  }
  async readUpdates(namespace:CollaborationNamespace,selected:any,limit:number|undefined,signal?:AbortSignal){
    const before=await this.store.load(namespace),id=selected.subscriptionId,progress=before.subscriptionProgress?.[id]
    const request:any={subscriptionId:id,expectedBindingEpoch:integer(before.binding.bindingEpoch),expectedRevision:integer(selected.revision),...(limit===undefined?{}:{limit})}
    if(progress){request.afterEventSeq=progress.after;if(sequence(progress.watermark)>0n)request.throughEventSeq=progress.watermark}
    const result=await this.api.request("workspace","POST","/collaboration/actions/read-updates",request,signal,{lossless:true})
    const deliveries:any[]=[]
    const after=sequence(progress?.after),next=sequence(result.nextAfterEventSeq),watermark=sequence(result.watermarkEventSeq)
    if(result.nextAfterEventSeq===undefined||result.watermarkEventSeq===undefined||!Array.isArray(result.events)||result.events.length>8||typeof result.hasMore!=="boolean"||next<after||watermark<next||progress&&sequence(progress.watermark)>0n&&sequence(progress.watermark)!==watermark)throw new LoopError("loop-host/backend-invalid","Subscription read frontier is invalid")
    if(result.deliveryGap){
      const retained=sequence(result.deliveryGap.retainedFromEventSeq)
      if(retained<1n||retained-1n<after||retained>watermark+1n||result.events.length)throw new LoopError("loop-host/backend-invalid","Delivery gap has no valid retained boundary")
      await this.store.update(namespace,current=>{
        if(stringifyWire(current.subscriptionProgress?.[id]??null)!==stringifyWire(progress??null))throw new LoopError("loop-host/conflict","Subscription read progress changed")
        current.subscriptionProgress??={};current.subscriptionProgress[id]={after:retained-1n,watermark:0n,deliveryGap:result.deliveryGap}
      },signal)
      return {result:{...result,recovery:"Next read continues from retained history; expired history is unavailable"},deliveries}
    }
    if(result.hasMore!==(next<watermark)||result.hasMore&&next===after)throw new LoopError("loop-host/backend-invalid","Subscription read did not advance")
    let previous=after
    const returnedIDs=new Set<string>()
    for(const event of result.events){
      const seq=sequence(event.eventSeq)
      if(seq<=previous||seq>next||returnedIDs.has(event.eventId)||read(event,"subscriptionId")!==id||read(event,"scopeId")!==selected.scopeId)throw new LoopError("loop-host/backend-invalid","Subscription event is outside its read window")
      previous=seq;returnedIDs.add(event.eventId)
    }
    const events=[...result.events],seen=new Set(events.map(event=>event.eventId))
    for(const item of Object.values<any>(before.events).sort((a,b)=>sequence(a.eventSeq)<sequence(b.eventSeq)?-1:1)){
      if(events.length>=8)break
      if(item.event?.subscriptionId!==id||!["pending","needs-auth","reconcile"].includes(item.state)||progress&&sequence(item.eventSeq)>sequence(progress.after)||seen.has(item.eventId))continue
      const event=parseWire(stringifyWire(item.event));event.subscriptionRevision=selected.revision;event.mode=selected.mode
      if(event.payload){event.payload.subscriptionRevision=selected.revision;event.payload.mode=selected.mode}
      events.push(event);seen.add(item.eventId)
    }
    const document=await this.store.update(namespace,current=>{
      if(stringifyWire(current.subscriptionProgress?.[id]??null)!==stringifyWire(progress??null))throw new LoopError("loop-host/conflict","Subscription read progress changed")
      for(const event of events){
        const received=this.apply(namespace,event,current,true)
        if(received.emit&&received.delivery){received.delivery.state="pending";deliveries.push(received.delivery)}
      }
      current.subscriptionProgress??={}
      current.subscriptionProgress[id]={after:result.nextAfterEventSeq,watermark:result.hasMore?result.watermarkEventSeq:0n,...(progress?.deliveryGap?{deliveryGap:progress.deliveryGap}:{})}
    },signal)
    delete result.events
    const taskId=String(selected.target??"").replace(/^#/u,"")
    return {result:{...result,eventIds:events.map(event=>event.eventId),delivery:"queued_for_session",subscriptionId:id,...(progress?.deliveryGap?{previousDeliveryGap:progress.deliveryGap}:{}),...(document.taskStates[taskId]?{task:document.taskStates[taskId]}:{})},deliveries}
  }
  async accept(namespace:CollaborationNamespace,input:any,signal?:AbortSignal){
    if(!["accepted","cancelled","pending","needs-auth","reconcile","revoked","retired-route","binding-conflict","blocked"].includes(input.status))throw new LoopError("loop-host/invalid-request","Invalid delivery acceptance status")
    const current=await this.store.load(namespace),record=current.events[input.eventId]
    if(!record)throw new LoopError("loop-host/not-found","Original collaboration event is unavailable")
    if(record.payloadHash!==input.contentHash)throw new LoopError("loop-host/conflict","Collaboration event content changed")
    const terminal=["accepted","cancelled"].includes(input.status)
    let sessionSequence=0n
    if(terminal){
      try{sessionSequence=typeof input.sessionSequence==="string"&&/^\d+$/u.test(input.sessionSequence)?BigInt(input.sessionSequence):integer(input.sessionSequence)}
      catch{throw new LoopError("loop-host/invalid-request","Invalid durable Session sequence")}
      if(!valid(input.sessionMessageId)||sessionSequence<0n||sessionSequence>9223372036854775807n)throw new LoopError("loop-host/invalid-request","Durable Session acceptance evidence is incomplete")
    }
    if(record.state==="committed"&&(input.status!=="accepted"||record.messageId!==input.sessionMessageId||sequence(record.sessionSeq)!==sessionSequence)||record.state==="canceled"&&input.status!=="cancelled")throw new LoopError("loop-host/conflict","Terminal delivery acceptance cannot change")
    let acceptance:any
    if(terminal)acceptance=await this.api.request("workspace","POST","/collaboration/delivery-receipts",{clientRequestId:"accept-"+hash(input.eventId).slice(0,24),eventId:input.eventId,contentHash:input.contentHash.replace(/^sha256:/u,""),bindingId:namespace.bindingId,bindingEpoch:integer(current.binding.bindingEpoch),subscriptionId:current.subscriptionId??"",generation:current.generation??"",sessionId:input.sessionId,sessionMessageId:input.sessionMessageId??"",sessionSequence,status:input.status},signal,{lossless:true})
    const updated=await this.store.update(namespace,state=>{
      const item=state.events[input.eventId]
      if(!item||item.payloadHash!==input.contentHash)throw new LoopError("loop-host/conflict","Original delivery changed")
      if(item.state==="committed"&&(input.status!=="accepted"||item.messageId!==input.sessionMessageId||sequence(item.sessionSeq)!==sessionSequence)||item.state==="canceled"&&input.status!=="cancelled")throw new LoopError("loop-host/conflict","Terminal delivery acceptance cannot change")
      if(input.status==="accepted")Object.assign(item,{state:"committed",messageId:input.sessionMessageId,sessionSeq:sessionSequence,committedAt:item.committedAt||new Date().toISOString()})
      else Object.assign(item,{state:input.status==="cancelled"?"canceled":input.status,reason:typeof input.reason==="string"?input.reason.slice(0,4096):""})
    },signal)
    return {...(acceptance?{acceptance}:{}),delivery:updated.events[input.eventId]}
  }
}
