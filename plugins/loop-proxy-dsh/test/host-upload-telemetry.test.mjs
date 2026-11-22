import {NativeSyncWriter} from '../backend/sync-writer.ts'
import {appendFileSync} from 'node:fs'
import assert from 'node:assert/strict'
import {cp, mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import test from 'node:test'

async function until(predicate) {
  const deadline = Date.now() + 6000
  while (!await predicate()) {
    if (Date.now() > deadline) throw new Error('upload did not settle')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
function sourceEvent(seq, content) {
  return {seq,type:'user/message',time:1700000000000+seq,data:{id:`item-${seq}`,source:{kind:'user'},content:[{type:'text',text:content}]}}
}

test('explicit history opt-in replays pre-login and disabled-period history with stable event IDs', async t => {
  const root = await mkdtemp(join(tmpdir(),'loop-telemetry-e2e-'))
  t.after(() => rm(root,{recursive:true,force:true}))
  await cp(new URL('../../loop-dsh/lib/',import.meta.url),join(root,'lib'),{recursive:true})
  await symlink(resolve(import.meta.dirname,'../node_modules'),join(root,'node_modules'),'dir')
  await writeFile(join(root,'package.json'),' {"type":"module"} ')
  const log = join(root,'events.jsonl')
  const {apply} = await import(pathToFileURL(join(root,'lib/index.js')).href)
  let online = false, reads = 0, coldReads = 0, disposed = 0
  const listeners = new Map(), cleanup = [], statuses = []
  const events = [sourceEvent(1,'Before login')]
  const live = {id:'live',header:{version:'4',createdAt:1},get seq() { return events.at(-1).seq+1 },snapshotEvents(from,to) { reads++;return events.filter(event=>event.seq>=from&&event.seq<to) }}
  const service = {
    syncCapturePolicy: () => ({loggedIn: true, uploadDisconnectedHistory: true}),
    async sessionSyncTarget() { return online ? {profile:'test',pendingContext:{accountPrincipal:'human',loopWorkspaceId:'loop',agentId:'agent',projectId:'',defaultChannelId:'channel'}} : null },
    setSessionUploadStatus(id,status) { statuses.push([id,status]) },
  }
  const ctx = {
    logger:{warn() {}},
    get: name => name === 'loopNativeSyncWriterFactory' ? recordingWriter(log) : name === 'loopHostService' ? service : undefined,
    on(name,callback) { const values=listeners.get(name)??[]; values.push(callback); listeners.set(name,values) },
    effect(mount) { cleanup.push(mount()) },
    waterfall(_name,record) { return record },
    sessions:{get:id=>id==='live'?live:undefined,list:()=>[live]},
    workspaceRegistry:{list:()=>[{sessionIds:['live','cold']}]},
    sessionQuery:{async observeSession() { coldReads++;return {header:{id:'cold',version:'4'},cursor:1,inheritedEventCount:0,events:[sourceEvent(1,'Stored history')],[Symbol.dispose]() { disposed++ }} }},
  }
  const config = {workspaceRoot:root,profile:'test',queueLimit:100,ackTimeoutMs:1000,shutdownTimeoutMs:5000}
  const stop = async () => {
    for (const dispose of cleanup.splice(0).reverse()) await dispose?.()
    listeners.clear()
  }
  apply(ctx,config)
  try {
    assert.equal(reads,0)
    assert.equal(coldReads,0)
    await until(()=>statuses.some(([,status])=>status==='failed'))
    assert.equal(reads,0,'no log snapshots before upload admission')
    events.push(sourceEvent(2,'Typed while disconnected'))
    for (const callback of listeners.get('session/event')) callback(live,{type:'user/message'})
    assert.equal(reads,0,'front-end event never reads the log')
    online=true
    const records = async () => (await readFile(log,'utf8').catch(()=>'' )).trim().split('\n').filter(Boolean).map(JSON.parse)
    await until(async()=> (await records()).filter(item=>item.event).length===3)
    const received=(await records()).map(item=>item.event.content).sort()
    assert.deepEqual(received,['Before login','Stored history','Typed while disconnected'])
    assert.ok(coldReads>0)
    assert.equal(disposed,coldReads,'read-only history leases are released')
    for (const callback of listeners.get('session/event')) callback(live,{type:'turn/end'})
    await new Promise(resolve=>setTimeout(resolve,40))
    assert.equal((await records()).length,3,'later flush does not re-enqueue the history')
    const before = (await records()).map(item=>item.event)
    await stop()
    events.push(sourceEvent(3,'Typed while plugin disabled'))
    await new Promise(resolve=>setTimeout(resolve,40))
    assert.equal((await records()).length,3,'disabled plugin does not capture new messages')
    apply(ctx,config)
    await until(async()=> (await records()).length===7)
    const replayed = (await records()).slice(3).map(item=>item.event)
    assert.deepEqual(replayed.map(event=>event.content).sort(),[
      'Before login','Stored history','Typed while disconnected','Typed while plugin disabled',
    ])
    for (const event of before) {
      assert.equal(replayed.find(item=>item.content===event.content).sourceEventId,event.sourceEventId,
        'history keeps the existing server deduplication identity')
      assert.ok(event.sourceEventId)
    }
  } finally { await stop() }
})

for (const pause of ['admission', 'cold read', 'initial profile lookup', 'sign-out during cold read']) test(`changing connection during ${pause} discards stale capture and replays to the new profile`, async t => {
  const root = await mkdtemp(join(tmpdir(),'loop-telemetry-switch-'))
  t.after(() => rm(root,{recursive:true,force:true}))
  await cp(new URL('../../loop-dsh/lib/',import.meta.url),join(root,'lib'),{recursive:true})
  await symlink(resolve(import.meta.dirname,'../node_modules'),join(root,'node_modules'),'dir')
  await writeFile(join(root,'package.json'),'{"type":"module"}')
  const log = join(root,'events.jsonl')
  const {apply} = await import(pathToFileURL(join(root,'lib/index.js')).href)
  let profile = 'first', changeProfile, invalidateSessions, releaseRead, admissions = 0, reads = 0, disposed = 0
  const blockedRead = new Promise(resolve => { releaseRead = resolve })
  const cleanup = [], statuses = []
  const target = () => profile === '' ? null : ({profile,pendingContext:{accountPrincipal:profile,loopWorkspaceId:'loop',agentId:'agent',projectId:'',defaultChannelId:profile+'-channel'}})
  const service = {
    syncCapturePolicy: () => ({loggedIn: true, uploadDisconnectedHistory: true}),
    async sessionSyncTarget() {
      const selected = target()
      if (++admissions === 1 && pause === 'admission') await blockedRead
      return selected
    },
    async currentSyncProfile() {
      const selected = profile
      if (pause === 'initial profile lookup') await blockedRead
      return selected
    },
    addServerProfileListener(listener) { changeProfile = listener; return () => {} },
    addSessionInvalidationListener(listener) { invalidateSessions = listener; return () => {} },
    setSessionUploadStatus(id,status) { statuses.push([id,status]) },
  }
  const ctx = {
    logger:{warn() {}}, get:name=>name==='loopNativeSyncWriterFactory'?recordingWriter(log):name==='loopHostService'?service:undefined,
    on() {}, effect(mount) { cleanup.push(mount()) }, waterfall(_name,record) { return record },
    sessions:{get:()=>undefined,list:()=>[]}, workspaceRegistry:{list:()=>[{sessionIds:['cold']}]},
    sessionQuery:{async observeSession() {
      reads++
      if (reads === 1 && pause !== 'admission') await blockedRead
      return {header:{id:'cold',version:'4'},cursor:1,inheritedEventCount:0,events:[sourceEvent(1,'Stored history')],[Symbol.dispose]() { disposed++ }}
    }},
  }
  apply(ctx,{workspaceRoot:root,profile:'first',queueLimit:100,ackTimeoutMs:1000,shutdownTimeoutMs:5000})
  try {
    await until(()=> pause === 'admission' ? admissions === 1 : reads === 1)
    const records = async () => (await readFile(log,'utf8').catch(()=>'' )).trim().split('\n').filter(Boolean).map(JSON.parse)
    if (pause.startsWith('sign-out')) {
      profile = ''
      await invalidateSessions(['cold'])
      releaseRead()
      await until(()=>statuses.some(([,status])=>status==='failed'))
      assert.deepEqual(await records(), [], 'sign-out must fence an already admitted cold read')
    }
    profile = 'second'
    changeProfile(profile)
    releaseRead()
    await until(async()=> (await records()).some(item=>item.profile==='second'))
    const received = await records()
    assert.deepEqual(received.map(item=>[item.profile,item.pendingContext.accountPrincipal,item.event.content]),[['second','second','Stored history']])
    assert.equal(disposed,reads,'both stale and fresh cold observations are released')
    assert.ok(statuses.some(([,status])=>status==='queued'))
  } finally { releaseRead(); for (const dispose of cleanup.reverse()) await dispose?.() }
  const drained = (await readFile(log,'utf8')).trim().split('\n').filter(Boolean).map(JSON.parse)
  assert.deepEqual(drained.map(item=>item.profile), ['second'], 'shutdown must not reveal a stale queued write to the old account')
})

function recordingWriter(log) {
  return config => new NativeSyncWriter(config, async (profile, externalSessionId, pendingContext) => ({
    async recordObserved(event) {
      appendFileSync(log, JSON.stringify({profile, externalSessionId, pendingContext, event}) + "\n")
      return true
    },
    async flush() {},
  }))
}
