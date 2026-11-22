import {createHash} from "node:crypto"
import {integer,stringifyWire} from "./codec.ts"
import {LoopError} from "./errors.ts"
import {HostAPI} from "./host-api.ts"
import {CollaborationStore} from "./collaboration-store.ts"
import type {CollaborationNamespace} from "./collaboration-store.ts"
import {CollaborationLedger} from "./collaboration-ledger.ts"
import {CollaborationInbox} from "./collaboration-inbox.ts"
import {lookupSubscription} from "./collaboration-authorization.ts"

export async function subscriptionAction(api:HostAPI,store:CollaborationStore,namespace:CollaborationNamespace,document:any,input:any,emit:(value:any)=>void,signal?:AbortSignal){
  if(integer(document.binding.protocolCapabilities?.messageSubscriptions??0)<1n)throw new LoopError("loop-host/capability-unsupported","Loop server does not support message subscriptions")
  const allowed:Record<string,string[]>={"set-subscription":["target","mode"],"list-subscriptions":["cursor","limit"],"read-updates":["subscriptionId","limit"]}
  if(Object.keys(input.arguments).some(key=>!allowed[input.action]?.includes(key)))throw new LoopError("loop-host/invalid-request","Host supplies subscription Session, revision and progress")
  const args:any={...input.arguments,expectedBindingEpoch:integer(document.binding.bindingEpoch)}
  if(args.limit!==undefined&&(!Number.isSafeInteger(args.limit)||args.limit<1||args.limit>100))throw new LoopError("loop-host/invalid-request","Invalid subscription limit")
  if(input.action==="list-subscriptions")return api.request("workspace","POST","/collaboration/actions/list-subscriptions",args,signal,{lossless:true})
  const source=input.managementSource
  if(input.action==="set-subscription"){
    if(typeof args.target!=="string"||!args.target||args.target.length>2048||!["push","pull","paused"].includes(args.mode))throw new LoopError("loop-host/invalid-request","Invalid subscription target or mode")
    if(source ? source.sessionId!==namespace.hostSessionId||typeof source.messageId!=="string"||!/^[a-zA-Z0-9_.:-]{1,255}$/u.test(source.messageId)||integer(source.sequence)<=0n||typeof source.textDigest!=="string"||!/^sha256:[a-fA-F0-9]{64}$/u.test(source.textDigest) : args.mode!=="paused")throw new LoopError("loop-host/invalid-request","Management source must be an accepted local message")
    const recovery=Object.values<any>(document.actions).find(action=>action.kind==="set-subscription"&&["recorded","dispatching","unknown"].includes(action.phase)&&action.request.target===args.target)
    if(recovery){
      if(recovery.request.mode!==args.mode)throw new LoopError("loop-host/result-unknown","Recover the original mode change before selecting another mode",0,true)
      return new CollaborationLedger(store,api).send(namespace,recovery.clientRequestId,signal)
    }
    const {selected,scopeId}=await lookupSubscription(api,args.expectedBindingEpoch,args.target,"",signal)
    if(!source){
      const original=document.managementSources?.[selected?.subscriptionId]
      if(!original||original.sessionId!==namespace.hostSessionId||original.scopeId!==scopeId)throw new LoopError("loop-host/permission-denied","Feedback can only pause its original managed subscription")
    }
    args.expectedScopeId=scopeId;args.expectedRevision=integer(selected?.revision??0)
    args.clientRequestId="sub-"+createHash("sha256").update(stringifyWire({request:args,sourceMessageId:source?.messageId??""})).digest("hex").slice(0,32)
    return new CollaborationLedger(store,api).record(namespace,"set-subscription",args,"",signal,source?{...source,expiresAt:""}:undefined)
  }
  if(typeof args.subscriptionId!=="string"||!args.subscriptionId)throw new LoopError("loop-host/invalid-request","Subscription identity is required")
  const {selected}=await lookupSubscription(api,args.expectedBindingEpoch,"",args.subscriptionId,signal)
  if(!selected)throw new LoopError("loop-host/not-found","Subscription is not in this Session")
  const {result,deliveries}=await new CollaborationInbox(store,api).readUpdates(namespace,selected,args.limit,signal)
  for(const {event,...delivery} of deliveries)emit({eventId:delivery.eventId,kind:"delivery.changed",occurredAt:delivery.receivedAt,delivery:{...delivery,sessionId:namespace.hostSessionId,eventKind:delivery.kind},event})
  return result
}
