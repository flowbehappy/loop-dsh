import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {createHash} from 'node:crypto'
import {CollaborationStore} from '../backend/collaboration-store.ts'
import {CollaborationLedger} from '../backend/collaboration-ledger.ts'
import {LoopError} from '../backend/errors.ts'
import {stringifyWire,integer} from '../backend/codec.ts'
import {CollaborationContinuation,authorizedTasks} from '../backend/collaboration-continuation.ts'
import {CollaborationInbox,eventHash,eventMatches} from '../backend/collaboration-inbox.ts'
import {managementForTask,reserveReply} from '../backend/collaboration-management.ts'
import {subscriptionAction} from '../backend/collaboration-subscriptions.ts'

async function fixture(t,send){
  const root=await mkdtemp(tmpdir()+'/loop-collaboration-');t.after(()=>rm(root,{recursive:true,force:true}))
  const store=new CollaborationStore(root)
  const namespace={serverBaseUrl:'https://loop.example',accountId:'human',installationId:'installation',workspaceId:'workspace',hostSessionId:'session',bindingId:'binding',bindingEpoch:'9007199254740993',bindingRevision:'9007199254740993'}
  await store.transition(namespace,namespace,{bindingId:'binding',bindingEpoch:9007199254740993n,status:'active'}, {})
  const calls=[]
  const api={async request(area,method,path,body,signal){calls.push(stringifyWire(body));return send?.({area,method,path,body,signal,calls})??{receipt:{taskId:'task',state:'accepted',revision:1n}}}}
  const ledger=new CollaborationLedger(store,api)
  const request={clientRequestId:'request',userIntentId:'accepted-human-intent',expectedBindingEpoch:9007199254740993n,task:{title:'你好 <>&'}}
  return {store,namespace,ledger,request,calls,reopen:()=>new CollaborationLedger(new CollaborationStore(root),api)}
}
test('collaboration replay preserves canonical request and exact int64 authority across restart',async t=>{
  const f=await fixture(t,({calls})=>{if(calls.length===1)throw new LoopError('loop-host/backend-unavailable','lost response',0,true)})
  await assert.rejects(f.ledger.record(f.namespace,'dispatch',f.request,'intent'))
  assert.equal((await f.store.load(f.namespace)).actions.request.phase,'unknown')
  const result=await f.reopen().reconcile(f.namespace,{})
  assert.equal(result.receipts.length,1);assert.equal(f.calls[0],f.calls[1])
  assert.equal(integer(result.state.actions.request.request.expectedBindingEpoch),9007199254740993n)
  const replay=await f.reopen().record(f.namespace,'dispatch',f.request,'intent')
  assert.equal(replay.replayed,true);assert.equal(f.calls.length,2)
  await assert.rejects(f.ledger.record(f.namespace,'dispatch',{...f.request,task:{title:'changed'}},'intent'),{code:'loop-host/conflict'})
  await assert.rejects(f.ledger.record(f.namespace,'notify',f.request,'intent'),{code:'loop-host/conflict'})
})
test('concurrent service instances send one mutation and replay the persisted result',async t=>{
  let resolve,started
  const gate=new Promise(r=>resolve=r),ready=new Promise(r=>started=r)
  const f=await fixture(t,async()=>{started();await gate;return {receipt:{taskId:'task'}}})
  const first=f.ledger.record(f.namespace,'dispatch',f.request,'intent')
  await ready
  const second=f.reopen().record(f.namespace,'dispatch',f.request,'intent')
  resolve()
  const results=await Promise.all([first,second])
  assert.equal(f.calls.length,1);assert.deepEqual(results.map(v=>v.replayed),[false,true])
})
test('late response after rebind is saved only in the archived original route',async t=>{
  let resolve,started
  const gate=new Promise(r=>resolve=r),ready=new Promise(r=>started=r)
  const f=await fixture(t,async()=>{started();await gate;return {receipt:{taskId:'old-task'}}})
  const pending=f.ledger.record(f.namespace,'dispatch',f.request,'intent');await ready
  const next={...f.namespace,bindingId:'next-binding',bindingEpoch:'9007199254740994'}
  await f.store.transition(f.namespace,next,{bindingId:'next-binding',bindingEpoch:9007199254740994n,status:'active'}, {})
  resolve();await pending
  assert.equal(Object.keys((await f.store.load(next)).actions).length,0)
  assert.equal((await f.store.load({...f.namespace,archive:true})).actions.request.receipt.receipt.taskId,'old-task')
  const result=await f.reopen().send(f.namespace,'request')
  assert.equal(result.replayed,true);assert.equal(f.calls.length,1)
})
test('definitive rejection is terminal while server failure remains reconcilable',async t=>{
  for(const status of [403,409,429,500]){
    const f=await fixture(t,()=>{throw new LoopError('loop-host/backend-unavailable','rejected',status)})
    await assert.rejects(f.ledger.record(f.namespace,'dispatch',f.request,'intent'))
    const phase=(await f.store.load(f.namespace)).actions.request.phase
    assert.equal(phase,status===403||status===409?'failed':'unknown')
    if(phase==='failed'){await assert.rejects(f.reopen().send(f.namespace,'request'),{code:'loop-host/conflict'});assert.equal(f.calls.length,1)}
  }
})
test('cancellation persists uncertainty and keeps the exact replay body',async t=>{
  const controller=new AbortController()
  const f=await fixture(t,()=>{controller.abort();throw new LoopError('loop-host/cancelled','cancelled')})
  await assert.rejects(f.ledger.record(f.namespace,'dispatch',f.request,'intent',controller.signal))
  const record=(await f.store.load(f.namespace)).actions.request
  assert.equal(record.phase,'unknown');assert.equal(stringifyWire(record.request),f.calls[0])
})
test('state identity mismatch and stale route cannot mutate a new binding',async t=>{
  const f=await fixture(t)
  await f.store.file(f.namespace).write({...await f.store.load(f.namespace),namespace:{...f.namespace,accountId:'other'}})
  await assert.rejects(f.ledger.record(f.namespace,'dispatch',f.request,'intent'),{code:'loop-host/invalid-state'})
  assert.equal(f.calls.length,0)
})
test('Go v1 upgrade preserves original bytes and refuses conflicting backups',async t=>{
  const f=await fixture(t),file=f.store.file(f.namespace)
  const state=await f.store.load(f.namespace);state.version=1
  state.actions.old={clientRequestId:'old',phase:'unknown',request:{sequence:9007199254740993n}}
  await file.write(state)
  const original=await readFile(file.path)
  const upgraded=await f.store.load(f.namespace)
  assert.equal(integer(upgraded.version),2n)
  assert.equal(integer(upgraded.actions.old.request.sequence),9007199254740993n)
  assert.deepEqual(await readFile(file.path+'.v1.bak'),original)
  await f.store.update(f.namespace,current=>{current.actions.old.phase='completed'})
  assert.deepEqual(await readFile(file.path+'.v1.bak'),original)
  await file.write(state)
  await writeFile(file.path+'.v1.bak','{}')
  await assert.rejects(f.store.load(f.namespace),{code:'loop-host/invalid-state'})
  assert.equal(integer((await file.read()).version),1n)
})
test('continuation scopes only explicit task tokens or one unique existing task',()=>{
  const tasks=[{taskId:'task-a',targetIds:['a']},{taskId:'task-b',targetIds:['b']}]
  assert.deepEqual(authorizedTasks(tasks,'继续它'),[])
  assert.deepEqual(authorizedTasks(tasks,'继续 task-a，别创建新任务'),['task-a'])
  assert.deepEqual(authorizedTasks(tasks,'task-a-extra'),[])
  assert.deepEqual(authorizedTasks(tasks.slice(0,1),'继续它'),['task-a'])
  assert.deepEqual(authorizedTasks([{taskId:'task-a',targetIds:[]}],'task-a'),[])
})
test('accepted continuation constrains later model selections and removes prior shared resources',async t=>{
  const f=await fixture(t)
  await f.store.update(f.namespace,state=>{
    for(const suffix of ['a','b']){
      state.intents['intent-'+suffix]={ref:'intent-'+suffix,state:'activated',userIntentId:'user-intent-'+suffix,targets:[{targetId:'target-'+suffix,targetType:'human',intendedActions:['dispatch']}],shareScope:{scope:'selected-resources',resourceRefs:['document:private']},acceptedSequence:1n,updatedAt:'2026-11-18'}
      state.actions[suffix]={kind:'dispatch',phase:'completed',intentRef:'intent-'+suffix,request:{target:{targetId:'target-'+suffix},task:{title:suffix}},receipt:{receipt:{taskId:'task-'+suffix,state:'accepted',revision:1n}}}
    }
  })
  const requests=[],api={async request(_area,_method,_path,body){requests.push(body);return {userIntentId:'continuation-intent'}}}
  const service=new CollaborationContinuation(f.store,api)
  const accepted='继续 task-a'
  const input={sessionId:'session',requestId:'human-request',continuationRef:'continuation',acceptedMessageId:'human-message',acceptedSequence:2n,acceptedSerializedText:accepted,payloadDigest:'sha256:'+createHash('sha256').update(accepted).digest('hex'),bindingRevision:f.namespace.bindingRevision}
  const prepared=await service.prepare(f.namespace,input)
  assert.equal(prepared.state,'ready')
  assert.deepEqual(prepared.authorizedTaskIds,['task-a'])
  const document=await f.store.load(f.namespace)
  await assert.rejects(service.activate(f.namespace,document,{sessionId:'session',continuationRef:'continuation',action:'followup',arguments:{taskId:'task-b'}}),{code:'loop-host/conflict'})
  await assert.rejects(service.activate(f.namespace,document,{sessionId:'session',continuationRef:'continuation',action:'dispatch',arguments:{target:{targetId:'target-a',kind:'human'}}}),{code:'loop-host/conflict'})
  const action={sessionId:'session',continuationRef:'continuation',action:'followup',arguments:{taskId:'task-a'}}
  const intent=await service.activate(f.namespace,document,action)
  assert.equal(intent.userIntentId,'continuation-intent')
  assert.deepEqual(requests[0].targetIds,['target-a'])
  assert.deepEqual(requests[0].resourceRefs,['task:task-a'])
  assert.deepEqual(requests[0].shareScope.resourceRefs,[])
  await service.activate(f.namespace,await f.store.load(f.namespace),action)
  assert.equal(requests.length,1)
  await assert.rejects(service.prepare(f.namespace,{...input,acceptedSequence:3n}),{code:'loop-host/conflict'})
})
test('inbox persists before acknowledgement and preserves accepted identity across replay',async t=>{
  const f=await fixture(t),namespace={...f.namespace,deviceBindingId:'device',agentMemberId:'agent-member'}
  await f.store.update(f.namespace,state=>{state.namespace=namespace})
  const event={eventId:'event',eventSeq:9007199254740994n,type:'collaboration.task_message',targetKind:'coordinator',targetBindingId:namespace.bindingId,targetBindingEpoch:9007199254740993n,targetSourceSessionId:namespace.hostSessionId,workspaceId:namespace.workspaceId,deviceBindingId:'device',agentMemberId:'agent-member',originBindingId:namespace.bindingId,originBindingEpoch:9007199254740993n,originSourceSessionId:namespace.hostSessionId,taskId:'task',messageId:'message',createdAt:'2026-11-18',payload:{body:'test reply',subscriptionId:'old'}}
  let sends=0
  const inbox=new CollaborationInbox(f.store,{async request(){if(++sends===1)throw new LoopError('loop-host/backend-unavailable','lost response',0,true);return {state:'accepted'}}})
  const received=await inbox.receive(namespace,event)
  assert.equal(received.emit,true)
  assert.equal(integer((await f.store.load(namespace)).deliveryCursor),9007199254740994n)
  assert.equal(eventMatches({...event,targetBindingEpoch:2n},namespace),false)
  await assert.rejects(inbox.receive(namespace,{...event,payload:{body:'changed'}}),{code:'loop-host/conflict'})
  const replay=await inbox.receive(namespace,{...event,createdAt:'rounded-clock',payload:{...event.payload,subscriptionId:'new'}})
  assert.equal(replay.delivery.deliveryId,received.delivery.deliveryId)
  assert.equal(replay.delivery.payloadHash,received.delivery.payloadHash)
  const input={eventId:'event',sessionId:'session',contentHash:eventHash(event),status:'accepted',sessionMessageId:'durable-message',sessionSequence:42n}
  for(const status of ['accepted','cancelled']){
    for(const sessionSequence of [undefined,null,false,-1,0.5,9223372036854775808n]){
      await assert.rejects(inbox.accept(namespace,{...input,status,sessionSequence}),{code:'loop-host/invalid-request'})
    }
  }
  assert.equal(sends,0,'no receipt for missing or invalid durable evidence')
  await assert.rejects(inbox.accept(namespace,input))
  assert.equal((await f.store.load(namespace)).events.event.state,'pending')
  await inbox.accept(namespace,input)
  assert.equal((await f.store.load(namespace)).events.event.state,'committed')
  assert.equal((await inbox.receive(namespace,event)).emit,false)
  await assert.rejects(inbox.accept(namespace,{...input,status:'pending'}),{code:'loop-host/conflict'})
  await assert.rejects(inbox.accept(namespace,{...input,sessionMessageId:'different'}),{code:'loop-host/conflict'})
  assert.equal(sends,2)
})
test('collaboration inbox evicts committed discussion events without losing uncertain work',async t=>{
  const f=await fixture(t),namespace={...f.namespace,deviceBindingId:'device',agentMemberId:'agent-member'}
  const event=sequence=>{
    const suffix=String(sequence)
    return {eventId:'event-'+suffix,eventSeq:BigInt(sequence),type:'collaboration.message',
      targetKind:'coordinator',targetBindingId:namespace.bindingId,targetBindingEpoch:9007199254740993n,
      targetSourceSessionId:namespace.hostSessionId,workspaceId:namespace.workspaceId,deviceBindingId:'device',
      agentMemberId:'agent-member',originBindingId:namespace.bindingId,originBindingEpoch:9007199254740993n,
      originSourceSessionId:namespace.hostSessionId,subscriptionId:'subscription',scopeId:'scope',
      messageId:'message-'+suffix,createdAt:'2026-11-18',payload:{body:'discussion '+suffix}}
  }
  const seed=(sequence,state)=>{
    const value=event(sequence),payloadHash=eventHash(value),deliveryKey='delivery-key-'+sequence
    return {eventId:value.eventId,eventSeq:value.eventSeq,kind:value.type,payloadHash,receivedAt:'2026-11-18',
      state,sourceSessionId:namespace.hostSessionId,bindingId:namespace.bindingId,bindingEpoch:namespace.bindingEpoch,
      taskId:'',contentHash:'',event:value,deliveryKey,deliveryId:'delivery-'+sequence}
  }
  await f.store.update(namespace,state=>{
    state.namespace=namespace
    for(let sequence=1;sequence<=511;sequence++){
      const item=seed(sequence,'committed');state.events[item.eventId]=item;state.deliveryIndex[item.deliveryKey]=item.eventId
    }
    const uncertain=seed(512,'reconcile');state.events[uncertain.eventId]=uncertain;state.deliveryIndex[uncertain.deliveryKey]=uncertain.eventId
    state.deliveryCursor=512n
  })
  const inbox=new CollaborationInbox(f.store,{async request(){throw new Error('unexpected receipt request')}})
  const received=await inbox.receive(namespace,event(513))
  assert.equal(received.emit,true)
  const state=await f.store.load(namespace)
  assert.equal(integer(state.deliveryCursor),513n)
  assert.ok(state.events['event-513'])
  assert.ok(state.events['event-512'],'reconcile work is never evicted')
  assert.equal(state.events['event-1'],undefined,'the oldest committed delivery is evicted')
  assert.ok(Object.keys(state.events).length<=512)
  assert.equal((await inbox.receive(namespace,event(1))).emit,false,'an evicted duplicate stays behind the delivery cursor')
  assert.equal((await f.store.load(namespace)).events['event-1'],undefined)
})
test('collaboration inbox also evicts committed task input failures',async t=>{
  const f=await fixture(t),namespace={...f.namespace,hostSessionId:'task-input-session',deviceBindingId:'device',agentMemberId:'agent-member'}
  const event=sequence=>({eventId:'failed-'+sequence,eventSeq:BigInt(sequence),type:'collaboration.task_input_failed',
    targetKind:'coordinator',targetBindingId:namespace.bindingId,targetBindingEpoch:9007199254740993n,
    targetSourceSessionId:namespace.hostSessionId,workspaceId:namespace.workspaceId,deviceBindingId:'device',
    agentMemberId:'agent-member',originBindingId:namespace.bindingId,originBindingEpoch:9007199254740993n,
    originSourceSessionId:namespace.hostSessionId,taskId:'task',createdAt:'2026-11-18',
    payload:{reason:'wake_failed',body:'wake failed '+sequence}})
  await f.store.update(namespace,state=>{
    state.namespace=namespace
    for(let sequence=1;sequence<=512;sequence++){
      const value=event(sequence),deliveryKey='failed-key-'+sequence
      state.events[value.eventId]={eventId:value.eventId,eventSeq:value.eventSeq,kind:value.type,payloadHash:eventHash(value),
        receivedAt:'2026-11-18',state:'committed',sourceSessionId:namespace.hostSessionId,bindingId:namespace.bindingId,
        bindingEpoch:namespace.bindingEpoch,taskId:'task',contentHash:'',event:value,deliveryKey,deliveryId:'delivery-'+sequence}
      state.deliveryIndex[deliveryKey]=value.eventId
    }
    state.deliveryCursor=512n
  })
  const inbox=new CollaborationInbox(f.store,{async request(){throw new Error('unexpected receipt request')}})
  await inbox.receive(namespace,event(513))
  const state=await f.store.load(namespace)
  assert.equal(state.events['failed-1'],undefined)
  assert.ok(state.events['failed-513'])
  assert.equal(integer(state.deliveryCursor),513n)
})
test('snapshot pages retain a fixed watermark and never advance past incomplete recovery',async t=>{
  const f=await fixture(t),namespace={...f.namespace,deviceBindingId:'device',agentMemberId:'agent-member'}
  await f.store.update(f.namespace,state=>{state.namespace=namespace;state.snapshotRequired=true})
  const generation=namespace.bindingId+':'+namespace.bindingEpoch
  const event={eventId:'snapshot-event',eventSeq:1n,type:'collaboration.task_message',targetKind:'coordinator',targetBindingId:namespace.bindingId,targetBindingEpoch:9007199254740993n,targetSourceSessionId:namespace.hostSessionId,workspaceId:namespace.workspaceId,deviceBindingId:'device',agentMemberId:'agent-member',originBindingId:namespace.bindingId,originBindingEpoch:9007199254740993n,originSourceSessionId:namespace.hostSessionId,taskId:'task',messageId:'message',payload:{body:'snapshot reply'}}
  const page={generation,bindingId:namespace.bindingId,bindingEpoch:9007199254740993n,watermarkEventSeq:10n,hasMore:true,nextCursor:'page-2',nativeTaskEvents:[event]}
  let response=page
  const inbox=new CollaborationInbox(f.store,{async request(){return response}})
  const first=await inbox.snapshot(namespace)
  assert.equal(first.deliveries.length,1);assert.equal(integer(first.document.deliveryCursor),0n)
  assert.equal(first.document.snapshotProgress.cursor,'page-2')
  response={...page,watermarkEventSeq:11n,hasMore:false,nextCursor:'',nativeTaskEvents:[]}
  await assert.rejects(inbox.snapshot(namespace),{code:'loop-host/conflict'})
  assert.equal(integer((await f.store.load(namespace)).deliveryCursor),0n)
  response={...page,hasMore:false,nextCursor:'',nativeTaskEvents:[{...event,eventId:'different',targetBindingId:'wrong'}]}
  await assert.rejects(inbox.snapshot(namespace),{code:'loop-host/backend-invalid'})
  response={...page,hasMore:false,nextCursor:'',nativeTaskEvents:[]}
  const last=await inbox.snapshot(namespace)
  assert.equal(integer(last.document.deliveryCursor),10n);assert.equal(last.document.snapshotRequired,false)
  assert.equal(last.document.snapshotProgress,undefined)
  assert.ok(last.document.events['snapshot-event'])
})
test('management succession follows accepted Human sequence and never revives a closed older source',()=>{
  const document={actions:{},intents:{}}
  const add=(id,sequence)=>{
    document.intents[id]={ref:id,state:'activated',userIntentId:'server-'+id,sessionId:'session',bindingRevision:'5',acceptedSequence:sequence,targets:[{targetId:'human',intendedActions:['dispatch']}]}
    document.actions[id]={kind:'dispatch',phase:'completed',intentRef:id,receipt:{receipt:{taskId:'task'}}}
  }
  add('old',1n);add('new',2n)
  assert.equal(managementForTask(document,'task','session','5').intentRef,'new')
  document.actions.end={kind:'end-management',phase:'completed',intentRef:'new',receipt:{receipt:{taskId:'task'}}}
  assert.equal(managementForTask(document,'task','session','5').state,'closed')
  assert.equal(managementForTask(document,'task','session','5','old'),null)
  add('ambiguous',2n)
  assert.equal(managementForTask(document,'task','session','5'),null)
  add('accepted-later',3n)
  assert.equal(managementForTask(document,'task','session','5').intentRef,'accepted-later')
  assert.equal(managementForTask(document,'task','different-session','5'),null)
})
test('discussion reply reservations have a durable eight-message budget with exact retries',()=>{
  const source={}
  for(let i=0;i<8;i++)reserveReply(source,{clientMessageId:'reply-'+i,payloadDigest:'sha256:'+'a'.repeat(64)})
  reserveReply(source,{clientMessageId:'reply-0',payloadDigest:'sha256:'+'a'.repeat(64)})
  assert.throws(()=>reserveReply(source,{clientMessageId:'reply-0',payloadDigest:'sha256:'+'b'.repeat(64)}),{code:'loop-host/conflict'})
  assert.throws(()=>reserveReply(source,{clientMessageId:'ninth',payloadDigest:'sha256:'+'a'.repeat(64)}),{code:'loop-host/limit'})
})
test('lost subscription mutation retains original scope and management source across an alias change',async t=>{
  const f=await fixture(t)
  await f.store.update(f.namespace,state=>{state.binding.protocolCapabilities={messageSubscriptions:1n}})
  let mutations=0,lookups=0
  const requests=[]
  const api={async request(_area,_method,path,body){
    if(path.endsWith('/list-subscriptions')){lookups++;return {resolvedScopeId:lookups===1?'scope-original':'scope-rebound',subscriptions:[],hasMore:false}}
    requests.push(stringifyWire(body))
    if(++mutations===1)throw new LoopError('loop-host/backend-unavailable','lost subscription response',0,true)
    return {subscriptionId:'subscription',target:'#discussion',currentTarget:'#discussion',scopeId:'scope-original',mode:'push',revision:1n}
  }}
  const source={sessionId:'session',messageId:'accepted-message',sequence:1n,textDigest:'sha256:'+'a'.repeat(64)}
  const input={action:'set-subscription',arguments:{target:'#discussion',mode:'push'},managementSource:source}
  const run=async input=>subscriptionAction(api,f.store,f.namespace,await f.store.load(f.namespace),input,()=>{})
  await assert.rejects(run(input))
  await assert.rejects(run({...input,arguments:{...input.arguments,mode:'pull'}}),{code:'loop-host/result-unknown'})
  const result=await run(input)
  assert.equal(result.subscriptionId,'subscription')
  assert.equal(lookups,1);assert.equal(requests[0],requests[1])
  const state=await f.store.load(f.namespace)
  assert.equal(state.managementSources.subscription.messageId,'accepted-message')
  assert.equal(state.managementSources.subscription.scopeId,'scope-original')
  assert.equal(state.snapshotRequired,true)
  await assert.rejects(run({...input,managementSource:undefined}),{code:'loop-host/invalid-request'})
})

test('bounded action history retains management authority, closure and every uncertain outcome',async t=>{
  const f=await fixture(t)
  await f.store.update(f.namespace,state=>{
    for(let i=0;i<508;i++)state.actions['comment-'+i]={kind:'followup',intentRef:'intent',phase:'completed',updatedAt:new Date(i*1000).toISOString(),receipt:{receipt:{taskId:'task'}}}
    state.actions.dispatch={kind:'dispatch',intentRef:'intent',phase:'completed',updatedAt:new Date(0).toISOString(),receipt:{receipt:{taskId:'task'}}}
    state.actions.closure={kind:'end-management',intentRef:'intent',phase:'completed',updatedAt:new Date(0).toISOString(),receipt:{receipt:{taskId:'task'}}}
    state.actions.uncertain={kind:'notify',intentRef:'intent',phase:'unknown',updatedAt:new Date(0).toISOString()}
    state.actions.inflight={kind:'notify',intentRef:'intent',phase:'dispatching',updatedAt:new Date(0).toISOString()}
  })
  await f.ledger.record(f.namespace,'notify',f.request,'intent')
  const state=await f.store.load(f.namespace)
  assert.equal(Object.keys(state.actions).length,512)
  for(const id of ['dispatch','closure','uncertain','inflight','request'])assert.ok(state.actions[id],id)
  assert.equal(state.actions['comment-0'],undefined)
  await f.store.update(f.namespace,state=>{
    state.actions={}
    for(let i=0;i<512;i++)state.actions['unknown-'+i]={kind:'notify',phase:'unknown'}
  })
  await assert.rejects(f.ledger.record(f.namespace,'notify',{...f.request,clientRequestId:'overflow'},'intent'),{code:'loop-host/queue-full'})
  assert.equal(f.calls.length,1,'uncertain actions are never discarded to admit more work')
})

test('subscription pagination rejects stalled, overflowing and foreign event windows without changing durable progress',async t=>{
  const f=await fixture(t),selected={subscriptionId:'subscription',revision:1,scopeId:'scope',mode:'pull',target:'#task'}
  for(const result of [
    {events:[],nextAfterEventSeq:0,watermarkEventSeq:2,hasMore:true},
    {events:[],nextAfterEventSeq:3,watermarkEventSeq:2,hasMore:false},
    {events:[],nextAfterEventSeq:1,watermarkEventSeq:2,hasMore:false},
    {events:[],nextAfterEventSeq:1,watermarkEventSeq:1},
    {events:[{eventId:'event',eventSeq:2,subscriptionId:'foreign',scopeId:'scope'}],nextAfterEventSeq:2,watermarkEventSeq:2,hasMore:false},
    {events:[],nextAfterEventSeq:0,watermarkEventSeq:2,hasMore:false,deliveryGap:{retainedFromEventSeq:5}},
  ]){
    const inbox=new CollaborationInbox(f.store,{request:async()=>result})
    await assert.rejects(inbox.readUpdates(f.namespace,selected,8),{code:'loop-host/backend-invalid'})
    assert.equal((await f.store.load(f.namespace)).subscriptionProgress?.subscription,undefined)
  }
  const head=9007199254740997n
  await new CollaborationInbox(f.store,{request:async()=>({events:[],nextAfterEventSeq:head,watermarkEventSeq:head,hasMore:false})}).readUpdates(f.namespace,selected,8)
  assert.equal(integer((await f.store.load(f.namespace)).subscriptionProgress.subscription.after),head)
})
