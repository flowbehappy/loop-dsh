import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp,rm,readFile,writeFile,stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {SyncOutbox,connectionBindingKey} from '../backend/sync.ts'
import {integer,parseWire,stringifyWire} from '../backend/codec.ts'

const credential={client_id:'client',resource:'https://loop.example/api/v1/workspaces/workspace/external/agent',host_source:'deepseek_harness'}
const placement={kind:'channel_session',targetId:'channel'}
const event=i=>({sourceEventId:'event-'+i,sourceItemId:'item-'+i,kind:'assistant_message',state:'completed',provenance:'host_observed',content:'hello '+i})
async function fixture(t,override=()=>undefined){
  const root=await mkdtemp(tmpdir()+'/loop-ts-sync-');t.after(()=>rm(root,{recursive:true,force:true}))
  const calls=[]
  const receipts=new Map()
  const api={async request(area,method,path,body,signal,options){
    calls.push({area,method,path,body:parseWire(stringifyWire(body)),options})
    const changed=await override({area,method,path,body,signal,options,receipts})
    if(changed!==undefined)return changed
    if(path==='/sessions')return {syncSessionId:'sync-session',externalSessionId:'session',workspaceId:'workspace',placement,participants:[{kind:'agent',verified:true,principalId:'agent'}],syncState:'active',resumeSourceSequence:0n}
    if(path.endsWith('/sync-state'))return {syncState:body.state,resumeSourceSequence:body.boundarySourceSequence}
    const response=body.events.map(item=>{
      const old=receipts.get(item.sourceEventId)
      if(old){assert.equal(integer(old.sequence),integer(item.sourceSequence));return {...old,duplicate:true}}
      const next={sourceEventId:item.sourceEventId,eventId:'accepted-'+item.sourceEventId,sequence:item.sourceSequence,createdAt:'2026-11-17T00:00:00Z'}
      receipts.set(item.sourceEventId,next);return next
    })
    return {receipts:response,syncState:'active',resumeSourceSequence:0n,cursor:'cursor'}
  }}
  const outbox=new SyncOutbox(root,'profile','session',credential,api)
  return {root,outbox,api,calls,receipts,reopen:()=>new SyncOutbox(root,'profile','session',credential,api)}
}

test('sync commits before acknowledgment, resumes after restart and batches stable source identities',async t=>{
  const f=await fixture(t)
  await f.outbox.ensureSession(placement,'workspace','agent')
  await f.outbox.record(Array.from({length:105},(_,i)=>event(i)))
  assert.equal((await f.reopen().snapshot()).pending.length,105)
  await f.reopen().flush()
  assert.deepEqual(f.calls.filter(call=>call.path.endsWith('/events')).map(call=>call.body.events.length),[50,50,5])
  const state=await f.reopen().snapshot()
  assert.equal(state.pending.length,0)
  assert.equal(integer(state.nextSequence),106n)
  assert.equal(integer(state.lastReceipt.sourceSequence),105n)
  assert.equal(f.receipts.size,105)
  assert.ok(f.calls.every(call=>call.options.lossless))
})
test('restart discovery admits only matching active remote sessions with durable work',async t=>{
  const f=await fixture(t)
  await f.outbox.ensureSession(placement,'workspace','agent')
  await f.outbox.record([event(1)])
  const pending=new SyncOutbox(f.root,'profile','unadmitted',credential,f.api)
  await pending.record([event(1)])
  const resumed=await SyncOutbox.resumable(f.root,'profile',credential,f.api)
  assert.deepEqual(resumed.map(outbox=>outbox.sessionId),['session'])
  assert.deepEqual(await SyncOutbox.resumable(f.root,'profile',{...credential,client_id:'another-account'},f.api),[])
  await resumed[0].flush()
  assert.deepEqual(await SyncOutbox.resumable(f.root,'profile',credential,f.api),[])
})
test('restart checks the saved destination for queued project uploads', async t => {
  const old = {kind:'project_session',targetId:'project',channelId:'channel'}
  const f = await fixture(t, ({path}) => path === '/sessions' ? {
    syncSessionId:'remote',workspaceId:'workspace',placement:old,
    participants:[{kind:'agent',principalId:'agent',verified:true}],
  } : undefined)
  await f.outbox.ensureSession(old,'workspace','agent')
  await f.outbox.record([event(1)])
  const recover = check => SyncOutbox.resumable(f.root,'profile',credential,f.api,check)
  assert.deepEqual(await recover(), [])
  assert.deepEqual(await recover(async () => false), [])
  assert.equal((await recover(async (...route) => {
    assert.deepEqual(route,['session','project','channel'])
    return true
  })).length, 1)
  assert.equal((await f.outbox.snapshot()).pending.length, 1)
})

test('pending capture has no upload authority and only exact unexpired context can adopt it',async t=>{
  const f=await fixture(t),context={accountPrincipal:'human',loopWorkspaceId:'workspace',agentId:'agent',projectId:'',defaultChannelId:'channel'}
  const pending=SyncOutbox.pending(f.root,'profile','session',context)
  const observed={sourceEventId:'dsh:session:v1:7',sourceThreadId:'session',sourceItemId:'message',kind:'human_message',state:'completed',provenance:'host_observed',content:'pending'}
  assert.equal(await pending.recordObserved(observed),true)
  assert.equal((await pending.snapshot()).pending.length,1)
  await assert.rejects(pending.flush())
  await assert.rejects(f.outbox.snapshot(),{code:'loop-host/invalid-state'})
  const wrong=new SyncOutbox(f.root,'profile','session',credential,f.api,{...context,accountPrincipal:'other'})
  await assert.rejects(wrong.snapshot(),{code:'loop-host/invalid-state'})
  const admitted=new SyncOutbox(f.root,'profile','session',credential,f.api,context)
  await admitted.ensureSession(placement,'workspace','agent')
  await admitted.flush()
  assert.equal(f.receipts.size,1)
  await assert.rejects(pending.recordObserved({...observed,sourceEventId:'dsh:session:v1:8'}),{code:'loop-host/invalid-state'})
})

test('lost upload response and failed receipt persistence retry the same event IDs and sequences',async t=>{
  const f=await fixture(t)
  await f.outbox.ensureSession(placement,'workspace','agent')
  await f.outbox.record([event(1),event(2)])
  const original=f.api.request.bind(f.api)
  let lose=true
  f.api.request=async(...args)=>{const result=await original(...args);if(lose&&args[2].endsWith('/events')){lose=false;throw new Error('synthetic lost response')}return result}
  await assert.rejects(f.outbox.flush(),/lost response/)
  assert.equal((await f.reopen().snapshot()).pending.length,2)
  assert.equal(f.receipts.size,2)
  const next=f.reopen(),write=next.store.write.bind(next.store)
  next.store.write=async value=>{if(value.pending.length===0)throw new Error('synthetic disk failure');await write(value)}
  await assert.rejects(next.flush(),/disk failure/)
  await f.reopen().flush()
  assert.equal((await f.reopen().snapshot()).pending.length,0)
  assert.equal(f.receipts.size,2)
  const batches=f.calls.filter(call=>call.path.endsWith('/events')).map(call=>stringifyWire(call.body))
  assert.equal(new Set(batches).size,1)
})

test('existing v1 int64 sequence remains exact above the JavaScript integer limit',async t=>{
  const f=await fixture(t)
  await f.outbox.store.write({version:1,bindingKey:connectionBindingKey(credential),externalSessionId:'session',syncSessionId:'sync-session',nextSequence:9007199254740993n,pending:[]})
  await f.outbox.record([event(1)])
  assert.match(await readFile(f.outbox.store.path,'utf8'),/"sourceSequence":9007199254740993/)
  await f.outbox.flush()
  assert.equal(integer(f.calls[0].body.events[0].sourceSequence),9007199254740993n)
  assert.equal(integer((await f.outbox.snapshot()).nextSequence),9007199254740994n)
})

test('incomplete or misordered receipts never discard durable events',async t=>{
  const f=await fixture(t,call=>call.path.endsWith('/events')?{receipts:[{sourceEventId:'wrong',eventId:'wrong'}]}:undefined)
  await f.outbox.ensureSession(placement,'workspace','agent');await f.outbox.record([event(1)])
  await assert.rejects(f.outbox.flush(),/misordered/)
  const state=await f.reopen().snapshot();assert.equal(state.pending.length,1);assert.equal(state.lastUploadFailed,true)
})

test('connection replacement cannot adopt old queued events, even for the same user',async t=>{
  const f=await fixture(t);await f.outbox.record([event(1)])
  const replacement=new SyncOutbox(f.root,'profile','session',{...credential,client_id:'new-client'},f.api)
  await assert.rejects(replacement.snapshot(),/another connection/)
  await assert.rejects(replacement.record([event(2)]),/another connection/)
  await assert.rejects(replacement.flush(),/another connection/)
  assert.equal(f.calls.length,0)
})

test('offline stop drops unacknowledged events and resume applies the server fence first',async t=>{
  const f=await fixture(t)
  await f.outbox.ensureSession(placement,'workspace','agent');await f.outbox.record([event(1),event(2)])
  const stopped=await f.outbox.stop();assert.equal(stopped.syncState,'stopped');assert.equal(stopped.pending.length,0)
  assert.equal(integer(stopped.resumeSourceSequence),2n)
  await assert.rejects(f.outbox.record([event(3)]),/stopped/)
  await assert.rejects(f.outbox.flush(),/stopped/)
  const active=await f.outbox.resume(1n);assert.equal(active.syncState,'active')
  assert.equal(integer(f.calls.at(-1).body.boundarySourceSequence),2n)
  await f.outbox.record([event(4)]);assert.equal(integer((await f.outbox.snapshot()).pending[0].sourceSequence),3n)
})

test('session identity checks reject a wrong Agent without overwriting the queue',async t=>{
  const f=await fixture(t)
  await f.outbox.record([event(1)])
  await assert.rejects(f.outbox.ensureSession(placement,'workspace','other-agent'),/identity or placement/)
  assert.equal((await f.outbox.snapshot()).pending.length,1)
  assert.equal((await f.outbox.snapshot()).syncSessionId,'')
})

test('visible content is UTF-8 bounded and queued event deduplication refuses changed payloads',async t=>{
  const f=await fixture(t),item={...event(1),content:'中'.repeat(20000)}
  await f.outbox.record([item,item])
  const state=await f.outbox.snapshot();assert.equal(state.pending.length,1)
  assert.ok(Buffer.byteLength(state.pending[0].content)<=32768)
  assert.ok(!state.pending[0].content.includes('\ufffd'))
  await assert.rejects(f.outbox.record([{...event(1),content:'different'}]),/different content/)
})

test('DSH telemetry keeps the source ledger sequence across gaps, replay and restart',async t=>{
  const f=await fixture(t)
  const observed=sequence=>({...event(sequence),sourceEventId:`dsh:session:v1:${sequence}`,sourceThreadId:'session',kind:'agent_message'})
  assert.equal(await f.outbox.recordObserved(observed(7)),false)
  await f.outbox.ensureSession(placement,'workspace','agent')
  await f.outbox.recordObserved(observed(19));await f.outbox.recordObserved(observed(7));await f.outbox.recordObserved(observed(19))
  assert.deepEqual((await f.reopen().snapshot()).pending.map(item=>integer(item.sourceSequence)),[7n,19n])
  assert.equal(integer((await f.reopen().snapshot()).nextSequence),20n)
  await f.outbox.flush()
  await f.reopen().recordObserved(observed(7));await f.reopen().flush()
  assert.equal(f.receipts.size,2)
  await f.outbox.stop();assert.equal(await f.reopen().recordObserved(observed(30)),false)
})

test('confirmed disconnect removes only its own outbox and lets another connection reuse the Session',async t=>{
  const {cleanupDisconnectedState}=await import('../backend/disconnect-cleanup.ts')
  const {DurableJSON}=await import('../backend/storage.ts')
  const f=await fixture(t)
  const owner={...credential,principal_id:'owner',workspace_id:'workspace',grant_id:'grant',disconnect:{receipt:{status:'completed'}}}
  const options={stateHome:f.root+'/host',syncHome:f.root,profile:'profile',server:'https://loop.example'}
  const own=new DurableJSON(options.stateHome+'/bindings/'+'a'.repeat(64)+'.json')
  const other=new DurableJSON(options.stateHome+'/bindings/'+'b'.repeat(64)+'.json')
  const binding={grantId:'grant',target:{loopServiceBaseUrl:options.server,loopWorkspaceId:'workspace'}}
  await own.transaction(async(_,save)=>save(binding))
  await other.transaction(async(_,save)=>save({...binding,grantId:'another-grant'}))
  await f.outbox.ensureSession(placement,'workspace','agent')
  await f.outbox.recordObserved({...event(1),sourceThreadId:"session",sourceEventId:"session:1",kind:"agent_message"})
  await f.outbox.stop()
  const replacement={...credential,client_id:'replacement-client',principal_id:'replacement',workspace_id:'workspace',grant_id:'replacement-grant'}
  const replacementApi={async request(area,method,path,body,signal,options){
    if(path==='/sessions')return {syncSessionId:'sync-'+body.externalSessionId,externalSessionId:body.externalSessionId,workspaceId:'workspace',placement,participants:[{kind:'agent',verified:true,principalId:'agent'}],syncState:'active',resumeSourceSequence:0n}
    return f.api.request(area,method,path,body,signal,options)
  }}
  const otherOutbox=new SyncOutbox(f.root,'profile','other-session',replacement,replacementApi)
  await otherOutbox.ensureSession(placement,'workspace','agent')
  await otherOutbox.record([event(2)])
  await assert.rejects(cleanupDisconnectedState(options,{...owner,disconnect:undefined}),{code:'loop-host/conflict'})
  await cleanupDisconnectedState(options,owner)
  assert.equal(await own.read(),undefined);assert.equal((await other.read()).grantId,'another-grant')
  await assert.rejects(stat(f.outbox.store.path),{code:'ENOENT'})
  assert.equal((await otherOutbox.snapshot()).pending.length,1,'another connection keeps its own queue')
  await cleanupDisconnectedState(options,owner)
  assert.equal((await other.read()).grantId,'another-grant')
  assert.equal((await otherOutbox.snapshot()).pending.length,1)
  const reused=new SyncOutbox(f.root,'profile','session',replacement,replacementApi)
  const fresh=await reused.snapshot()
  assert.equal(fresh.syncSessionId,'');assert.equal(fresh.pending.length,0)
  await reused.ensureSession(placement,'workspace','agent')
  await reused.record([event(3)])
  await reused.flush()
  assert.equal((await reused.snapshot()).pending.length,0)
  assert.ok(!f.receipts.has('event-1'),'the disconnected account history is not rebound')
  assert.ok(f.receipts.has('event-3'))
})

test('explicit sync consent archives only an orphan stopped empty outbox and preserves its bytes',async t=>{
  const f=await fixture(t),replacement={...credential,client_id:'replacement-client',principal_id:'replacement',grant_id:'replacement-grant'}
  await f.outbox.ensureSession(placement,'workspace','agent')
  await f.outbox.recordObserved({...event(1),sourceThreadId:'session',sourceEventId:'session:1',kind:'agent_message'})
  await f.outbox.stop()
  const original=JSON.parse(await readFile(f.outbox.store.path,'utf8'))
  assert.ok(Array.isArray(original.pending)&&original.pending.length===0)
  await assert.rejects(new SyncOutbox(f.root,'profile','session',replacement,f.api).snapshot(),/another connection/)
  const archive=await SyncOutbox.archiveLegacy(f.root,'profile','session',replacement)
  assert.ok(archive)
  await assert.rejects(stat(f.outbox.store.path),{code:'ENOENT'})
  assert.equal((await stat(archive)).mode&0o077,0)
  const archivedBytes=await readFile(archive)
  const archived=JSON.parse(await readFile(archive,'utf8'))
  assert.equal(archived.bindingKey,original.bindingKey)
  assert.equal(archived.syncState,'stopped')
  assert.deepEqual(archived.pending,[])
  await f.outbox.store.write(original)
  assert.equal(await SyncOutbox.archiveLegacy(f.root,'profile','session',replacement),archive)
  await assert.rejects(stat(f.outbox.store.path),{code:'ENOENT'})
  await f.outbox.store.write(original)
  await writeFile(archive,JSON.stringify({...archived,conflict:true}))
  await assert.rejects(SyncOutbox.archiveLegacy(f.root,'profile','session',replacement),/different data/)
  assert.equal((await f.outbox.store.read()).bindingKey,original.bindingKey)
  await writeFile(archive,archivedBytes)
  assert.equal(await SyncOutbox.archiveLegacy(f.root,'profile','session',replacement),archive)
  await assert.rejects(stat(f.outbox.store.path),{code:'ENOENT'})
  const reused=new SyncOutbox(f.root,'profile','session',replacement,f.api)
  const fresh=await reused.snapshot()
  assert.equal(fresh.bindingKey,connectionBindingKey(replacement))
  assert.equal(fresh.pending.length,0)
  assert.equal(fresh.syncSessionId,'')
})

test('legacy sync archive refuses active pending or unknown outboxes',async t=>{
  const f=await fixture(t),replacement={...credential,client_id:'replacement-client',principal_id:'replacement'}
  const states=[
    {syncState:'active',pending:[]},
    {syncState:'stopped',pending:[{sourceSequence:1n}]},
    {syncState:'paused',pending:[]},
  ]
  for(const state of states){
    await f.outbox.store.write({version:1,bindingKey:connectionBindingKey(credential),externalSessionId:'session',syncSessionId:'sync-session',
      nextSequence:2n,pending:[],...state})
    assert.equal(await SyncOutbox.archiveLegacy(f.root,'profile','session',replacement),undefined)
    assert.ok(await f.outbox.store.read())
  }
})

test('new sync consent archives a legacy orphan before creating the current connection outbox',async t=>{
  const {SyncControl}=await import('../backend/sync-control.ts')
  const f=await fixture(t),replacement={...credential,client_id:'replacement-client',principal_id:'replacement',grant_id:'replacement-grant'}
  await f.outbox.ensureSession(placement,'workspace','agent')
  await f.outbox.stop()
  const api={tokens:{credential:async()=>replacement}}
  const control=new SyncControl(api,{stateHome:f.root+'/host',syncHome:f.root,profile:'profile',installation:'installation',server:'https://loop.example'})
  control.validateContext=async()=>({agentId:'agent',projectId:'',defaultChannelId:'channel'})
  control.principal=async()=>({principal:{agentId:'agent'}})
  control.outbox=async()=>({
    snapshot:async()=>({nextSequence:1n,pending:[],syncSessionId:'',syncState:'active'}),
    ensureSession:async()=>{},
    resume:async()=>{},
    stop:async()=>{},
  })
  control.status=async()=>({state:'on',pending:0,historyPartial:false})
  assert.deepEqual(await control.set({sessionId:'session',enabled:true,context:{agentId:'agent',projectId:'',defaultChannelId:'channel'},confirmedSourceSequence:0}),{state:'on',pending:0,historyPartial:false})
  await assert.rejects(stat(f.outbox.store.path),{code:'ENOENT'})
})

// Existing Host status/retry calls use the saved session route without Agent ID.
test('sync context derives omitted Agent identity from the authenticated binding',async()=>{
  const {SyncControl}=await import('../backend/sync-control.ts')
  const control=new SyncControl({}, {})
  const target={agentId:'agent',projectId:'project',defaultChannelId:'channel'}
  control.binding=async()=>target
  const input={workspaceId:'local',context:{projectId:'project',defaultChannelId:'channel'}}
  assert.equal(await control.validateContext(input),target)
  assert.equal(await control.validateContext({...input,context:{...input.context,agentId:'agent'}}),target)
  for(const change of [{agentId:'other'},{defaultChannelId:'other'},{projectId:'other'}])await assert.rejects(control.validateContext({...input,context:{...input.context,...change}}),{code:'loop-host/conflict'})
  control.binding=async()=>undefined
  await assert.rejects(control.validateContext(input),{code:'loop-host/conflict'})
})
