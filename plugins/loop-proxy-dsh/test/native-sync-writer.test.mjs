import test from 'node:test'
import assert from 'node:assert/strict'
import {setTimeout as delay} from 'node:timers/promises'
import {NativeSyncWriter} from '../backend/sync-writer.ts'
const config={profile:'first',queueLimit:10,shutdownTimeoutMs:1000,clientSessionLabel:'Harness'}
const waitFor=async predicate=>{for(let i=0;i<100;i++){if(predicate())return;await delay(10)}throw new Error('condition not reached')}

test('startup resumes admitted durable outboxes without a new message',async()=>{
  let uploads=0,captures=0
  const writer=new NativeSyncWriter(config,async()=>{captures++;throw new Error('must not capture')},()=>{},async()=>[{sessionId:'saved-session',async flush(){uploads++}}])
  writer.start();await waitFor(()=>uploads===1)
  assert.equal(captures,0)
  await writer.shutdown()
})
test('recovery cannot revive a fenced session and switches to the latest profile',async()=>{
  let release,profiles=[],uploads=[]
  const gate=new Promise(resolve=>release=resolve)
  const writer=new NativeSyncWriter(config,async()=>{throw new Error('no capture')},()=>{},async profile=>{
    profiles.push(profile)
    if(profile==='first')await gate
    return [{sessionId:'saved-session',async flush(){uploads.push(profile)}}]
  })
  writer.start();await waitFor(()=>profiles.length===1)
  writer.setActiveProfile('second')
  await writer.fenceSessions(['saved-session']);release()
  await waitFor(()=>profiles.length===2 && uploads.length===1)
  assert.deepEqual(uploads,['second'])
  await writer.shutdown()
})

test('native writer pins every accepted event to its profile and drains durable capture at shutdown',async()=>{
  const captured=[]
  const writer=new NativeSyncWriter(config,async(profile,session)=>({async recordObserved(event){await delay(5);captured.push({profile,session,event});return true},async flush(){}}))
  writer.enqueue('one',{id:1});writer.setActiveProfile('second');writer.enqueue('two',{id:2})
  await writer.shutdown()
  assert.equal(writer.totalQueued,0)
  assert.deepEqual(captured.sort((a,b)=>a.session.localeCompare(b.session)),[{profile:'first',session:'one',event:{id:1}},{profile:'second',session:'two',event:{id:2}}])
  assert.throws(()=>writer.enqueue('one',{}),/stopped/)
})

test('one blocked session does not delay durable capture in another session',async()=>{
  let release
  const gate=new Promise(resolve=>{release=resolve}),captured=[]
  const writer=new NativeSyncWriter(config,async(_profile,session)=>({async recordObserved(){if(session==='blocked')await gate;captured.push(session);return true},async flush(){}}))
  writer.enqueue('blocked',{});writer.enqueue('free',{})
  await waitFor(()=>captured.includes('free'))
  assert.ok(!captured.includes('blocked'))
  release();await writer.shutdown();assert.equal(captured.length,2)
})

test('fencing cancels upload and awaits in-flight capture before workspace cleanup',async()=>{
  let uploading=false,aborted=false
  const writer=new NativeSyncWriter(config,async()=>({async recordObserved(){return true},async flush(signal){uploading=true;await delay(10000,undefined,{signal}).catch(()=>{aborted=true})}}))
  writer.enqueue('session',{});await waitFor(()=>uploading)
  await writer.fenceSessions(['session'])
  assert.equal(aborted,true);assert.equal(writer.totalQueued,0)
  await writer.shutdown()
})

test('failed durable capture remains queued and shutdown reports it rather than claiming success',async()=>{
  const writer=new NativeSyncWriter(config,async()=>({async recordObserved(){throw new Error('disk unavailable')},async flush(){assert.fail('undurable event uploaded')}}))
  writer.enqueue('session',{})
  await delay(20)
  assert.equal(writer.totalQueued,1)
  await assert.rejects(writer.shutdown(),/all accepted events/)
})

test('network retries reuse durable outbox without capturing an event twice',async()=>{
  let captures=0,uploads=0
  const writer=new NativeSyncWriter(config,async()=>({async recordObserved(){captures++;return true},async flush(){if(++uploads===1)throw new Error('offline')}}))
  writer.enqueue('session',{})
  await waitFor(()=>uploads===2)
  assert.equal(captures,1)
  await writer.shutdown()
})

test('new events stay durable while an upload is backing off',async()=>{
  let captures=0, uploads=0
  const writer=new NativeSyncWriter(config,async()=>({
    async recordObserved(){captures++;return true},
    async flush(){if(++uploads===1)throw new Error('temporarily unavailable')},
  }))
  writer.enqueue('session',{seq:1})
  await waitFor(()=>uploads===1)
  writer.enqueue('session',{seq:2})
  writer.enqueue('session',{seq:3})
  await waitFor(()=>captures===3)
  assert.equal(uploads,1)
  await waitFor(()=>uploads===2)
  await writer.shutdown()
})


test('capture during an in-flight upload schedules another flush without an external hint',async()=>{
  let release,uploads=0,captures=0
  const gate=new Promise(resolve=>{release=resolve})
  const writer=new NativeSyncWriter(config,async()=>({async recordObserved(){captures++;return true},async flush(){if(++uploads===1)await gate}}))
  writer.enqueue('session',{id:1});await waitFor(()=>uploads===1)
  writer.enqueue('session',{id:2});await waitFor(()=>captures===2)
  release();await waitFor(()=>uploads===2)
  await writer.shutdown()
})

test('account-wide fencing rejects late recovery while permitting new authorized captures',async()=>{
  let release,recovering=false,uploads=0,captures=0
  const gate=new Promise(resolve=>release=resolve)
  const writer=new NativeSyncWriter(config,async()=>({async recordObserved(){captures++;return true},async flush(){uploads++}}),()=>{},async()=>{
    recovering=true;await gate
    return [{sessionId:'previous-account',async flush(){assert.fail('late recovery revived a disconnected account')}}]
  })
  writer.start();await waitFor(()=>recovering)
  await writer.fenceAll();release();await delay(20)
  writer.enqueue('new-session',{});await waitFor(()=>uploads===1)
  assert.equal(captures,1)
  await writer.shutdown()
})

test('fencing clears transient upload status for the retired generation',async()=>{
  const statuses=[];let failed=false
  const writer=new NativeSyncWriter(config,async()=>({
    async recordObserved(){return true},
    async flush(){if(!failed){failed=true;throw new Error('offline')}},
  }),(_session,status)=>statuses.push(status))
  writer.enqueue('session',{})
  await waitFor(()=>statuses.includes('failed'))
  await writer.fenceSessions(['session'])
  assert.equal(statuses.at(-1),'idle')
  await writer.shutdown()
})
