import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtemp, readFile, rm, stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {Context} from '@deepseek-ai/cordis'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import {HostCredentialStore, serviceURL} from '../backend/credentials.ts'
import {TokenManager, LoopHTTP} from '../backend/http.ts'
import {beginHostLogin} from '../backend/oauth.ts'
import {createHash} from 'node:crypto'
import {ActionClient} from '../backend/actions.ts'

async function fixture(t, handler = (_req, res) => res.end('{}')) {
  const root = await mkdtemp(tmpdir() + '/loop-ts-backend-')
  const contexts = []
  const server = createServer(handler)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(async () => {
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
    for (const ctx of contexts) await ctx.fiber.dispose()
    await rm(root, {recursive: true, force: true})
  })
  async function store(workspace = 'workspace', installation = 'installation') {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(LocalCredentialProvider, {dshHome: root, watch: false})
    return new HostCredentialStore(ctx.get('credentials'), base, workspace, installation)
  }
  const credentials = await store()
  const value = {version: 1, principal_id: 'principal', workspace_id: 'workspace', client_id: 'client',
    token_endpoint: base + '/token', resource: base + '/api/v1/workspaces/workspace/external/agent',
    grant_id: 'grant', scope: 'loop.host offline_access', access_token: 'access-synthetic', refresh_token: 'refresh-synthetic',
    access_expires_at: new Date(Date.now() + 3600_000).toISOString()}
  return {root, base, store, credentials, value, provider: contexts[0].get('credentials')}
}
test('every action uses its own invocation endpoint and live server decision', async t => {
  const {NativeHostActions}=await import('../backend/adapter.ts')
  const {LoopHostRuntime}=await import('../host-runtime.mjs')
  const {BindingStore}=await import('../binding-store.mjs')
  const names=new Set(['task.list','channel.list','message.history','project.list','drive.list','dashboard.list','app.catalog',
    'skill.catalog','workflow.get','schedule.list','memory.get','machine.list','future.unknown-action'])
  if(process.env.LOOP_SOURCE_ROOT){
    const catalog=JSON.parse(await readFile(process.env.LOOP_SOURCE_ROOT+'/internal/actioncontract/default_actions.json','utf8'))
    for(const action of catalog)names.add(action.id)
  }
  let grant=true
  const calls=[]
  const f=await fixture(t, async(req,res)=>{
    const id=req.url.match(/^\/api\/v1\/workspaces\/workspace\/external\/agent\/actions\/([^/]+)\/invocations$/u)?.[1]
    if(!id || req.method!=='POST'){res.writeHead(403).end();return}
    let body='';for await(const chunk of req)body+=chunk
    calls.push({id,args:JSON.parse(body)})
    res.writeHead(grant?200:403,{'Content-Type':'application/json'}).end(JSON.stringify(grant?
      {data:{id}}:{error:{code:'resource_not_granted',message:'Decision from Loop'}}))
  })
  await f.credentials.publish({...f.value,scope:'offline_access'})
  const adapter=new NativeHostActions({stateHome:f.root+'/host',serviceBaseUrl:f.base,loopWorkspaceId:'workspace',
    installationId:'installation',pageOrigin:f.base,syncProfile:'test',accountPrincipal:'principal'},{provider:f.provider})
  t.after(()=>adapter.dispose())
  const store=new BindingStore({root:f.root+'/routes',installationId:'installation',defaultServiceBaseUrl:f.base})
  const workspace={id:'local',path:f.root,sessionIds:['session']}
  const actions=Object.fromEntries(['agentSchema','agentCatalog','agentAction'].map(name=>[name,(input,signal)=>adapter.request(name,input,signal)]))
  const runtime=new LoopHostRuntime({store,actions,accountPrincipal:'principal',workspaces:{get:()=>workspace,list:()=>[workspace]},
    sessions:{get:()=>({header:{createdAt:1}})}})
  runtime.serviceBaseUrl=f.base
  runtime.loopWorkspaceId='workspace'
  for(const id of names){
    const input={target:'requested-by-user'}
    const command={verb:'call',name:id,input:JSON.stringify(input)}
    grant=true
    assert.equal((await runtime.agentCommand('session',command)).failed,false,id)
    grant=false
    await assert.rejects(runtime.agentCommand('session',command),{code:'resource_not_granted',status:403})
    assert.deepEqual(calls.splice(0),[{id,args:input},{id,args:input}])
  }
  t.diagnostic(names.size+' action IDs exercised against allow and deny responses')
})

test('project binding uses server access decisions independent of role labels and service failures', async t => {
  const {SyncControl} = await import('../backend/sync-control.ts')
  const {HostAPI} = await import('../backend/host-api.ts')
  let status = 200
  const f = await fixture(t, (req, res) => {
    assert.ok(req.url.endsWith('/actions/project.get/invocations'))
    res.writeHead(status).end(JSON.stringify(status === 200 ? {data:{}} : {error:{code:'project_error',message:'Project check returned ' + status}}))
  })
  const credential = await f.credentials.publish(f.value)
  const project = {id:'project', name:'Example', workspaceId:'workspace', viewerRole:'edit'}
  const grant = {grantId:'grant', clientId:'client', resource:f.value.resource, agent:{agentId:'agent',displayName:'Agent'}}
  const pages = {async request(method, path) {
    if (path === '/api/v1/me') return {id:'principal',name:'User'}
    if (path.endsWith('/super-agent-grants')) return {grants:[grant]}
    if (path.endsWith('/workspaces')) return [{id:'workspace',name:'Workspace'}]
    if (path.includes('/projects?')) return {projects:[project]}
    return {project}
  }}
  const sync = new SyncControl(new HostAPI(new TokenManager(f.credentials, credential)), {
    installation:'installation', server:f.base, stateHome:f.root, syncHome:f.root, profile:'test',
  }, pages)
  const input = {workspace:{workspaceId:'local'}, agentId:'agent', projectId:'project'}
  assert.equal((await sync.projectCatalog()).projects[0].role, 'edit')
  await sync.prepareProject(input)
  await sync.refreshMetadata({...input, projectName:'Updated', workspaceName:'Workspace'})
  project.viewerRole = 'custom_role'
  assert.equal((await sync.projectCatalog()).projects[0].role, 'custom_role')
  await sync.refreshMetadata({...input, projectName:'Updated', workspaceName:'Workspace'})
  status = 503
  await assert.rejects(sync.prepareProject(input), {code:'project_error',status:503})
  await assert.rejects(sync.workspaceStatus(input), {code:'project_error',status:503})
  status = 403
  await assert.rejects(sync.prepareProject(input), {code:'loop-host/waiting-for-access',status:403})
  assert.equal((await sync.workspaceStatus(input)).state, 'waiting_for_access')
  status = 404
  assert.equal((await sync.workspaceStatus(input)).state, 'target_unavailable')
  status = 401
  assert.equal((await sync.workspaceStatus(input)).state, 'needs_auth')
})

test('binding recovery verifies the original channel, restores actions and fences prior upload consent',async t=>{
  const {NativeHostActions}=await import('../backend/adapter.ts')
  const {DurableJSON}=await import('../backend/storage.ts')
  let channel='channel', agent='agent', business=0, ensures=0
  const f=await fixture(t,async(req,res)=>{
    if(req.url.endsWith('/external-host/session'))return res.end(JSON.stringify({principalId:'principal',workspaceId:'workspace',grantId:'grant'}))
    if(req.url.endsWith('/grant'))return res.end(JSON.stringify({userId:'principal',workspaceId:'workspace',agentId:agent}))
    if(req.url.endsWith('/workspace-bindings')){
      let body='';for await(const chunk of req)body+=chunk
      assert.equal(JSON.parse(body).externalWorkspaceId,createHash('sha256').update('installation\0local').digest('hex'))
      ensures++;return res.end(JSON.stringify({channelId:channel}))
    }
    if(req.url.endsWith('/actions/channel.members/invocations')){
      let body='';for await(const chunk of req)body+=chunk
      assert.deepEqual(JSON.parse(body),{channelId:'channel'})
      return res.end(JSON.stringify({data:{members:[{agentId:'participant'}]}}))
    }
    if(req.url.endsWith('/actions/channel.members'))return res.end(JSON.stringify({id:'channel.members'}))
    if(req.url.includes('/actions')){business++;return res.end(JSON.stringify(req.url.includes('?')?{actions:[{id:'task.get'}]}:{id:'task.get'}))}
    res.writeHead(404).end()
  })
  const config={stateHome:f.root+'/host',serviceBaseUrl:f.base,loopWorkspaceId:'workspace',installationId:'installation',pageOrigin:f.base,syncProfile:'test',accountPrincipal:'principal'}
  const adapter=new NativeHostActions(config,{provider:f.provider,syncHome:f.root+'/sync'})
  t.after(()=>adapter.dispose())
  await f.credentials.publish(f.value)
  const key=createHash('sha256').update(['installation','principal','local',f.base,'workspace'].join('\0')).digest('hex')
  const file=new DurableJSON(config.stateHome+'/bindings/'+key+'.json')
  const target={placementKind:'channel_session',loopServiceBaseUrl:f.base,loopWorkspaceId:'workspace',defaultChannelId:'channel',projectId:'',agentId:'agent'}
  const legacy={target,clientId:'',grantId:'old-setup-grant'} // Go prepareProjectSync deliberately did not persist the client.
  const discovery={workspaceId:'local',sessionId:'session',name:'task.get'}
  const reconcile=(extra={})=>adapter.request('reconcileWorkspaceBinding',{workspace:{workspaceId:'local'},expectedTarget:target,agentId:'agent',accountPrincipal:'principal',confirm:false,...extra})
  await assert.rejects(reconcile(),/binding is missing/)
  await file.write(legacy)
  for(const action of ['agentCatalog','agentSchema','agentAction'])await adapter.request(action,discovery)
  assert.equal(business,3)
  assert.deepEqual(JSON.parse(JSON.stringify(await file.read())),legacy)
  for(const invalid of [{clientId:'foreign'},{clientId:'client'},{revocation:{startedAt:'pending'}},{target:{...target,loopWorkspaceId:'other'}},{target:{...target,loopServiceBaseUrl:'https://other.example'}},{target:{...target,defaultChannelId:'other'}}]){
    const record={...legacy,...invalid};await file.write(record)
    await assert.rejects(reconcile(),{code:'loop-host/conflict'})
    assert.deepEqual(JSON.parse(JSON.stringify(await file.read())),record)
  }
  await file.write(legacy)
  const accountKey=createHash('sha256').update(['installation','principal','workspace',f.base,'workspace'].join('\0')).digest('hex')
  const tombstone=new DurableJSON(config.stateHome+'/bindings/'+accountKey+'.json')
  await tombstone.write({accountDisconnect:true,revocation:{startedAt:'pending'}})
  await assert.rejects(reconcile(),/disconnect is pending/)
  await tombstone.remove(()=>true)
  assert.equal(ensures,0)
  const probe=await reconcile();assert.equal(probe.needsConfirmation,true)
  const commit=()=>reconcile({confirm:true,expectedRecord:probe.expectedRecord})
  await file.write({...legacy,grantId:''});await assert.rejects(commit(),{code:'loop-host/conflict'})
  await file.write(legacy);agent='different';await assert.rejects(commit(),{code:'loop-host/conflict'})
  agent='agent';channel='different';await assert.rejects(commit(),{code:'loop-host/conflict'})
  assert.equal((await file.read()).grantId,legacy.grantId)
  channel='channel';assert.deepEqual(await commit(),{changed:true})
  assert.equal((await file.read()).clientId,'client');assert.equal((await file.read()).grantId,'grant')
  const ensureCount = ensures
  assert.deepEqual(await reconcile(),{changed:false,owned:true})
  assert.equal(ensures,ensureCount,'healthy bindings do not call the remote ensure operation')
  assert.deepEqual(await adapter.request('agentCatalog',discovery),{actions:['task.get']})
  assert.equal((await adapter.request('agentSchema',discovery)).id,'task.get');assert.equal(business,5)
  for(const record of [undefined, {...legacy,clientId:'old-client'}, {...legacy,grantId:'grant'}]){
    if(record)await file.write(record)
    else await file.remove(()=>true)
    await assert.rejects(reconcile({expectedGrantId:'stale-grant'}),/confirmed Loop connection changed/)
    const probe=await reconcile({expectedGrantId:'grant'})
    assert.equal(probe.needsConfirmation,true)
    await reconcile({expectedGrantId:'grant',confirm:true,expectedRecord:probe.expectedRecord})
    assert.equal((await file.read()).target.defaultChannelId,'channel')
    assert.deepEqual(await reconcile(),{changed:false,owned:true})
  }

  // One real Host and native adapter share the fixture through the normal
  // command and settings entry points. Only the remote Loop API is simulated.
  const {BindingStore}=await import('../binding-store.mjs')
  const {LoopHostRuntime}=await import('../host-runtime.mjs')
  const store=new BindingStore({root:f.root+'/routes',installationId:'installation',defaultServiceBaseUrl:f.base})
  await store.setGlobalServer(f.base)
  await store.setActiveAccount('principal',f.base)
  await store.setLoopWorkspaceForServer(f.base,'workspace')
  const local={id:'local',path:f.root,title:'Local',sessionIds:['persisted']}
  const saved=await store.putBinding('principal',{workspaceId:'local',workspacePath:f.root,workspaceTitle:'Local',
    target:{...target,projectName:'',loopWorkspaceName:'Workspace',agentName:'Agent',accountName:'Human',webUrl:f.base+'/channel'},expectedRevision:null})
  await store.captureSession('principal',{workspaceId:'local',sessionId:'persisted',sessionCreatedAt:Date.now(),binding:saved})
  const actions=Object.fromEntries(['checkWorkspaceBinding','reconcileWorkspaceBinding','prepareProjectSync','projectSyncCatalog','agentSchema','agentCatalog','agentAction']
    .map(name=>[name,(input,signal)=>adapter.request(name,input,signal)]))
  actions.currentLoopWorkspaceId=()=>'workspace'
  const runtime=new LoopHostRuntime({store,actions,accountPrincipal:'principal',defaultServiceBaseUrl:f.base,
    workspaces:{list:()=>[local],get:()=>local},sessions:{get:()=>({id:'persisted',header:{createdAt:1}})}})
  await runtime.waitForActions()
  await runtime.backgroundProjectSync()
  await file.write({...legacy,clientId:'previous-client'})
  const command=()=>runtime.agentCommand('persisted',{verb:'schema',name:'channel.members'})
  // Business discovery does not repair or require the legacy upload owner.
  assert.equal((await command()).failed,false)
  assert.equal((await file.read()).clientId,'previous-client')
  // A lifecycle sync also repairs a missing native record without a dialog.
  await file.remove(()=>true)
  const automatic=await runtime.syncProjects({},undefined,{background:true})
  assert.equal(automatic.state,'ready')
  assert.equal(automatic.updated,1)
  assert.equal((await file.read()).target.defaultChannelId,'channel')
  const members=await runtime.agentCommand('persisted',{verb:'call',name:'channel.members',input:'{"channelId":"channel"}'})
  assert.equal(members.failed,false)
  assert.match(members.output,/participant/)
  assert.equal(await runtime.withSessionContext('persisted',undefined,ctx=>ctx.defaultChannelId),'channel')
  assert.equal(await runtime.sessionSyncTarget('persisted'),null)

})
function memoryProvider() {
  let record
  let reads = 0
  let commits = 0
  let mutations = Promise.resolve()
  const readGates = new Map()
  const commitGates = new Map()
  return {
    get reads() { return reads },
    get commits() { return commits },
    pauseRead(index) {
      let entered, release
      const ready = new Promise(resolve => { entered = resolve })
      const gate = new Promise(resolve => { release = resolve })
      readGates.set(index, {entered, gate})
      return {ready, release}
    },
    pauseCommit(index) {
      let entered, release
      const ready = new Promise(resolve => { entered = resolve })
      const gate = new Promise(resolve => { release = resolve })
      commitGates.set(index, {entered, gate})
      return {ready, release}
    },
    async readRecord() {
      const index = ++reads
      const snapshot = record
      const gate = readGates.get(index)
      if (gate) {
        gate.entered()
        await gate.gate
      }
      return snapshot
    },
    async modifyRecord(_key, mutate) {
      const operation = mutations.then(async () => {
        const next = await mutate(record)
        if (next !== undefined) {
          const gate = commitGates.get(++commits)
          if (gate) {
            gate.entered()
            await gate.gate
          }
          record = next
        }
        return record
      })
      mutations = operation.catch(() => {})
      return operation
    },
  }
}
async function waitUntil(predicate) {
  for (let index = 0; index < 200; index += 1) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('condition not reached')
}
const tokenResponse = {access_token: 'access-rotated', refresh_token: 'refresh-rotated', token_type: 'Bearer', expires_in: 3600}
function client(store, credential) { return new LoopHTTP(new TokenManager(store, credential), credential.resource) }

test('official DSH provider: restart, owner-only permissions, isolation and logout generation fence', async t => {
  const f = await fixture(t)
  const first = await f.credentials.publish(f.value)
  assert.equal((await stat(f.root + '/.credentials.yaml')).mode & 0o777, 0o600)
  const reopened = await f.store()
  assert.deepEqual(await reopened.read(), first)
  assert.equal(await (await f.store('other')).read(), undefined)
  assert.equal(await (await f.store('workspace', 'other')).read(), undefined)
  const second = await reopened.publish({...f.value, principal_id: 'second'})
  await f.credentials.logout(first.generation)
  assert.equal((await f.credentials.read()).generation, second.generation)
  await assert.rejects(new TokenManager(f.credentials, first).credential(), {code: 'loop-host/needs-auth'})
  await f.credentials.logout(second.generation)
  assert.equal(await (await f.store()).read(), undefined)
})

test('concurrent refresh across independent official providers rotates exactly once', async t => {
  let rotations = 0
  const f = await fixture(t, async (req, res) => {
    assert.equal(req.url, '/token')
    let body = ''; for await (const chunk of req) body += chunk
    assert.equal(new URLSearchParams(body).get('refresh_token'), 'refresh-synthetic')
    rotations++
    await new Promise(resolve => setTimeout(resolve, 40))
    res.end(JSON.stringify(tokenResponse))
  })
  const initial = await f.credentials.publish({...f.value, access_expires_at: new Date(0).toISOString()})
  const second = await f.store()
  const results = await Promise.all(Array.from({length: 12}, (_, i) => new TokenManager(i % 2 ? second : f.credentials, initial).credential()))
  assert.equal(rotations, 1)
  assert.ok(results.every(c => c.access_token === 'access-rotated' && !c.refresh_state))
})

test('unknown refresh response survives restart and never replays rotating token', async t => {
  let calls = 0
  const f = await fixture(t, (req) => { calls++; req.socket.destroy() })
  const initial = await f.credentials.publish({...f.value, access_expires_at: new Date(0).toISOString()})
  await assert.rejects(new TokenManager(f.credentials, initial).credential(), {code: 'loop-host/needs-auth'})
  const reopened = await f.store()
  await assert.rejects(new TokenManager(reopened, initial).credential(), {code: 'loop-host/needs-auth'})
  assert.equal(calls, 1)
})

test('cancelling a turn after refresh was sent preserves the rotated login for other callers and restart', async t => {
  let entered, release, calls = 0
  const ready = new Promise(resolve => entered = resolve), gate = new Promise(resolve => release = resolve)
  t.after(() => release())
  const f = await fixture(t, async (req, res) => {
    for await (const _ of req) {}
    calls++; entered(); await gate; res.end(JSON.stringify(tokenResponse))
  })
  const initial = await f.credentials.publish({...f.value, access_expires_at: new Date(0).toISOString()})
  const control = new AbortController()
  const first = new TokenManager(f.credentials, initial).credential(control.signal)
  const cancelled = assert.rejects(first, {code:'loop-host/cancelled'})
  await ready; control.abort()
  const secondStore = await f.store()
  const second = new TokenManager(secondStore, initial).credential()
  release(); await cancelled
  assert.equal((await second).access_token, tokenResponse.access_token)
  assert.equal((await new TokenManager(await f.store(), initial).credential()).refresh_state, undefined)
  assert.equal(calls, 1)
})

test('cancellation between refresh claim and send does not poison the credential', async t => {
  let calls = 0
  const f = await fixture(t, (_req, res) => {calls++; res.end(JSON.stringify(tokenResponse))})
  const initial = await f.credentials.publish({...f.value, access_expires_at:new Date(0).toISOString()})
  const control = new AbortController(), modify = f.credentials.modify.bind(f.credentials)
  let mutations = 0
  f.credentials.modify = async mutate => {
    const result = await modify(mutate)
    if (++mutations === 1) control.abort()
    return result
  }
  await assert.rejects(new TokenManager(f.credentials, initial).credential(control.signal), {code:'loop-host/cancelled'})
  assert.equal(calls, 0)
  assert.equal((await f.credentials.read()).refresh_state, undefined)
  assert.equal((await new TokenManager(await f.store(), initial).credential()).access_token, tokenResponse.access_token)
  assert.equal(calls, 1)
})

test('connection refusal during offline wake can retry the same login after network recovery and restart', async t => {
  let calls = 0
  const f = await fixture(t, (_req, res) => {calls++; res.end(JSON.stringify(tokenResponse))})
  const unused = createServer(); unused.listen(0, '127.0.0.1'); await once(unused, 'listening')
  const offlineURL = `http://127.0.0.1:${unused.address().port}/token`
  await new Promise(resolve => unused.close(resolve))
  const initial = await f.credentials.publish({...f.value, access_expires_at:new Date(0).toISOString()})
  await assert.rejects(new TokenManager(f.credentials, initial, {fetch:(_url, init)=>fetch(offlineURL, init)}).credential(), {code:'loop-host/backend-unavailable'})
  assert.deepEqual(await f.credentials.read(), initial)
  assert.equal((await new TokenManager(await f.store(), initial).credential()).access_token, tokenResponse.access_token)
  assert.equal(calls, 1)
})

test('only proven pre-send failures are retryable; resets and mixed connection errors retain uncertainty', async t => {
  const f = await fixture(t)
  const cause = code => Object.assign(new Error('synthetic network failure'), {code})
  for (const [error, retryable] of [
    ...['ENOTFOUND','EAI_AGAIN','ENETUNREACH','EHOSTUNREACH','UND_ERR_CONNECT_TIMEOUT'].map(code=>[new TypeError('fetch failed',{cause:cause(code)}),true]),
    [new TypeError('fetch failed',{cause:new AggregateError([cause('ECONNREFUSED'),cause('ENETUNREACH')])}),true],
    ...['ECONNRESET','ETIMEDOUT','UND_ERR_SOCKET','UND_ERR_HEADERS_TIMEOUT'].map(code=>[new TypeError('fetch failed',{cause:cause(code)}),false]),
    [new TypeError('fetch failed',{cause:new AggregateError([cause('ECONNREFUSED'),cause('ECONNRESET')])}),false],
  ]) {
    let calls = 0
    const initial = await f.credentials.publish({...f.value, access_expires_at:new Date(0).toISOString()})
    const manager = new TokenManager(f.credentials, initial, {fetch:async()=>{calls++; throw error}})
    await assert.rejects(manager.credential(), {code:retryable?'loop-host/backend-unavailable':'loop-host/needs-auth'})
    assert.equal((await f.credentials.read()).refresh_state, retryable?undefined:'unknown')
    if (!retryable) {await assert.rejects(manager.credential(), {code:'loop-host/needs-auth'}); assert.equal(calls,1)}
  }
})

test('a sleep-sized clock jump while another caller owns refresh is transient, not a logout', async t => {
  const f = await fixture(t, (_req,res)=>res.end(JSON.stringify(tokenResponse)))
  let now = Date.now(), entered, release
  const ready = new Promise(resolve=>entered=resolve), gate = new Promise(resolve=>release=resolve)
  t.after(()=>release())
  const initial = await f.credentials.publish({...f.value, access_expires_at:new Date(0).toISOString()})
  const modify = f.credentials.modify.bind(f.credentials)
  let mutations = 0
  f.credentials.modify = async mutate => {
    const result = await modify(mutate)
    if (++mutations === 1) {entered(); await gate}
    return result
  }
  const first = new TokenManager(f.credentials, initial, {now:()=>now}).credential()
  await ready; now += 30 * 60_000
  await assert.rejects(new TokenManager(await f.store(), initial, {now:()=>now}).credential(), {code:'loop-host/backend-unavailable'})
  release(); await first
  assert.equal((await new TokenManager(await f.store(), initial, {now:()=>now}).credential()).access_token, tokenResponse.access_token)
})

test('successful rotation followed by persistence failure leaves pre-published uncertainty', async t => {
  let calls = 0
  const f = await fixture(t, (_req, res) => { calls++; res.end(JSON.stringify(tokenResponse)) })
  const initial = await f.credentials.publish({...f.value, access_expires_at: new Date(0).toISOString()})
  const original = f.credentials.modify.bind(f.credentials)
  let mutations = 0
  f.credentials.modify = mutate => original(async current => {
    const value = await mutate(current)
    if (++mutations === 2) throw new Error('synthetic disk failure')
    return value
  })
  await assert.rejects(new TokenManager(f.credentials, initial).credential(), /synthetic disk failure/)
  const reopened = await f.store()
  const recovered = await reopened.read()
  assert.equal(recovered.refresh_state, 'unknown')
  await assert.rejects(new TokenManager(reopened, initial, {now: () => Date.now() + 30_000}).credential(), {code:'loop-host/backend-unavailable'})
  assert.equal(calls, 1)
})

test('public action protocol: pagination, schema, mutation receipt and injected authentication', async t => {
  const requests = []
  const f = await fixture(t, async (req, res) => {
    requests.push(req.url)
    assert.equal(req.headers.authorization, 'Bearer access-synthetic')
    const url = new URL(req.url, 'http://test')
    if (url.pathname.endsWith('/invocations')) {
      let body = ''; for await (const part of req) body += part
      assert.deepEqual(JSON.parse(body), {text: 'hello'})
      res.end(JSON.stringify({data: {id: 'task'}, receipt: {id: 'receipt'}}))
    } else if (url.pathname.endsWith('/actions')) {
      res.end(JSON.stringify(url.searchParams.has('cursor') ? {actions: [{id: 'task.read'}]} : {actions: [{id: 'task.create'}], hasMore: true, nextCursor: 'page2'}))
    } else res.end(JSON.stringify({id: 'task.create', inputSchema: {type: 'object'}}))
  })
  const credential = await f.credentials.publish(f.value)
  const actions = new ActionClient(client(f.credentials, credential))
  assert.deepEqual((await actions.actions()).map(a => a.id), ['task.create', 'task.read'])
  assert.equal((await actions.describe('task.create')).inputSchema.type, 'object')
  assert.equal((await actions.invoke('task.create', {text: 'hello'})).receipt.id, 'receipt')
  assert.equal(requests.length, 4)
})

test('forbidden and uncertain mutations are not retried; error secrets are redacted', async t => {
  let calls = 0
  const f = await fixture(t, (req, res) => {
    calls++
    if (req.url.endsWith('/lost')) return req.socket.destroy()
    res.writeHead(403).end(JSON.stringify({error: {code: 'forbidden', message:'access-synthetic refresh-synthetic'}}))
  })
  const http = client(f.credentials, await f.credentials.publish(f.value))
  await assert.rejects(http.request('POST', '/denied', {}), e => e.status === 403 && !e.message.includes('synthetic'))
  await assert.rejects(http.request('POST', '/lost', {}), e => e.outcomeUnknown === true)
  assert.equal(calls, 2)
})

test('action validation reports field diagnostics and redacts credentials', async t => {
  const f = await fixture(t, (_req, res) => res.writeHead(400).end(JSON.stringify({error: {
    code:'validation', message:'Invalid field.', details:{violations:[
      {path:'/args', message:'Unknown fields: kbId.'}, {path:'', message:'access-synthetic'},
    ]},
  }})))
  const http = client(f.credentials, await f.credentials.publish(f.value))
  await assert.rejects(http.request('POST', '/invalid', {}), error =>
    error.code === 'validation' && error.message.includes('/args Unknown fields: kbId.') &&
    error.message.includes('[redacted]') && !error.message.includes('access-synthetic'))
})

test('redirects, encoded traversal, oversized responses and cancelled requests are rejected', async t => {
  let calls = 0
  const f = await fixture(t, (req, res) => {
    calls++
    if (req.url.endsWith('/large')) return res.end(JSON.stringify({text: 'x'.repeat(65536)}))
    res.writeHead(302, {location: '/stolen'}).end()
  })
  const http = client(f.credentials, await f.credentials.publish(f.value))
  await assert.rejects(http.request('GET', '/redirect'), {code: 'loop-host/backend-unavailable'})
  for (const path of ['/../escape', '/%2e%2e/escape', '//foreign', '/x#fragment']) {
    await assert.rejects(http.request('GET', path), {code: 'loop-host/invalid-request'})
  }
  await assert.rejects(http.request('GET', '/large'), {code: 'loop-host/backend-invalid'})
  await assert.rejects(http.request('GET', '/cancelled', undefined, AbortSignal.abort()), {code: 'loop-host/cancelled'})
  assert.equal(calls, 2)
})

test('catalog loops fail with a finite request budget', async t => {
  let calls = 0
  const f = await fixture(t, (_req, res) => {calls++; res.end(JSON.stringify({actions: [], hasMore: true, nextCursor:'same'}))})
  const actions = new ActionClient(client(f.credentials, await f.credentials.publish(f.value)))
  await assert.rejects(actions.actions(), /cursor did not advance/)
  assert.equal(calls, 2)
})

test('connection URLs cannot contain credentials or nonlocal plaintext transports', () => {
  for (const url of ['http://example.com', 'https://u:p@example.com', 'https://example.com/?token=x', 'file:///tmp/file']) assert.throws(() => serviceURL(url))
  assert.equal(serviceURL('http://loop.work.localhost:3302/'), 'http://loop.work.localhost:3302')
})

test('a website served at the OAuth discovery address gives a server-address error before login', async () => {
  const calls = []
  const login = beginHostLogin({server:'https://team.example.test',installation:'test',pageOrigin:'dsh-app://app',
    accessToken:'synthetic',fetch:async (url, init) => {
      calls.push(url)
      assert.equal(new Headers(init.headers).has('Authorization'), false)
      return new Response('<html></html>', {headers:{'Content-Type':'text/html; charset=utf-8'}})
    }})
  await assert.rejects(login, {code:'loop-host/login-discovery'})
  assert.deepEqual(calls,['https://team.example.test/.well-known/oauth-authorization-server/api/v1/auth/oauth'])
})

async function oauthFixture(t, changes = {}) {
  let f, registration, authorization, exchanges = 0
  f = await fixture(t, async (req, res) => {
    res.setHeader('Content-Type', 'application/json')
    if (req.url.startsWith('/.well-known/')) return res.end(JSON.stringify({issuer: f.base + '/api/v1/auth/oauth',
      authorization_endpoint: f.base + '/authorize', registration_endpoint: f.base + '/register', token_endpoint: f.base + '/token', ...changes.metadata}))
    let raw = ''; for await (const chunk of req) raw += chunk
    if (req.url === '/register') {
      registration = JSON.parse(raw)
      return res.end(JSON.stringify({...registration, client_id: 'client'}))
    }
    assert.equal(req.url, '/token')
    exchanges++
    const form = new URLSearchParams(raw)
    assert.equal(form.get('code'), 'synthetic-code')
    assert.equal(form.get('redirect_uri'), registration.redirect_uris[0])
    assert.equal(createHash('sha256').update(form.get('code_verifier')).digest('base64url'), authorization.searchParams.get('code_challenge'))
    res.end(JSON.stringify({...tokenResponse, scope: 'loop.host offline_access', workspace_id:'workspace', principal_id:'principal', grant_id:'grant', ...changes.token}))
  })
  return {...f, exchanges: () => exchanges, begin: async () => {
    const login = await beginHostLogin({provider: f.provider, server: f.base, installation:'installation', pageOrigin:'http://127.0.0.1:4333'})
    authorization = new URL(login.authorizationURL)
    t.after(() => login.cancel())
    const callback = new URL(authorization.searchParams.get('redirect_uri'))
    callback.search = new URLSearchParams({state: authorization.searchParams.get('state'), workspace_id:'workspace', code:'synthetic-code',
      page_launch:'synthetic-page-assertion', page_origin:'http://127.0.0.1:4333', page_launch_expires_in:'60'})
    return {login, callback}
  }}
}

test('headless OAuth journey: discovery, DCR, PKCE, callback, token publication and restart', async t => {
  const f = await oauthFixture(t)
  const {login, callback} = await f.begin()
  const wrong = new URL(callback); wrong.searchParams.set('state', 'wrong')
  assert.equal((await fetch(wrong)).status, 400)
  assert.equal(f.exchanges(), 0)
  assert.equal((await fetch(callback)).status, 200)
  const {credential, pageLaunch} = await login.result
  assert.equal(pageLaunch.assertion, 'synthetic-page-assertion')
  assert.equal(credential.access_token, 'access-rotated')
  assert.equal(credential.workspace_id, 'workspace')
  assert.equal(f.exchanges(), 1)
  assert.deepEqual(await (await f.store()).read(), credential)
  await assert.rejects(fetch(callback))
})

test('cancelled OAuth closes the callback listener and publishes no credential', async t => {
  const f = await oauthFixture(t)
  const {login, callback} = await f.begin()
  login.cancel()
  await assert.rejects(login.result, {code:'loop-host/cancelled'})
  await assert.rejects(fetch(callback))
  assert.equal(await (await f.store()).read(), undefined)
  assert.equal(f.exchanges(), 0)
})

test('OAuth rejects wrong token authority without publishing or retrying', async t => {
  const f = await oauthFixture(t, {token: {workspace_id:'other'}})
  const {login, callback} = await f.begin()
  await fetch(callback)
  await assert.rejects(login.result, {code:'loop-host/backend-invalid'})
  assert.equal(await (await f.store()).read(), undefined)
  assert.equal(f.exchanges(), 1)
})

test('OAuth rejects external token endpoints before registering a client', async t => {
  const f = await oauthFixture(t, {metadata: {token_endpoint:'https://example.com/token'}})
  await assert.rejects(f.begin(), /another server/)
  assert.equal(f.exchanges(), 0)
})

test('separate Node processes share the official provider refresh lock', async t => {
  const {spawn} = await import('node:child_process')
  let calls = 0
  const f = await fixture(t, async (_req, res) => {
    calls++
    await new Promise(resolve => setTimeout(resolve, 100))
    res.end(JSON.stringify(tokenResponse))
  })
  await f.credentials.publish({...f.value, access_expires_at: new Date(0).toISOString()})
  const children = Array.from({length: 4}, () => spawn(process.execPath, [new URL('./fixtures/native-refresh-child.mjs', import.meta.url).pathname, f.root, f.base], {stdio: ['ignore','pipe','pipe']}))
  t.after(() => children.forEach(child => { if (child.exitCode === null) child.kill() }))
  await Promise.all(children.map(async child => {
    let output = '', error = ''
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { error += chunk })
    const [code] = await once(child, 'exit')
    assert.equal(code, 0, error)
    assert.equal(output, 'ok\n')
  }))
  assert.equal(calls, 1)
})

test('logout during refresh wins final persistence and old managers cannot revive it', async t => {
  let release, entered
  const seen = new Promise(resolve => {entered = resolve})
  const gate = new Promise(resolve => {release = resolve})
  const f = await fixture(t, async (_req, res) => {
    entered()
    await gate
    res.end(JSON.stringify(tokenResponse))
  })
  const initial = await f.credentials.publish({...f.value, access_expires_at:new Date(0).toISOString()})
  const manager = new TokenManager(f.credentials, initial)
  const refreshing = manager.credential()
  await seen
  const loggingOut = f.credentials.logout(initial.generation)
  release()
  await Promise.all([refreshing, loggingOut])
  assert.equal(await (await f.store()).read(), undefined)
  await assert.rejects(manager.credential(), {code:'loop-host/needs-auth'})
})

test('invalid mutation response is outcome-unknown and is never retried', async t => {
  let calls = 0
  const f = await fixture(t, (_req, res) => {calls++; res.end('{broken')})
  await assert.rejects(client(f.credentials, await f.credentials.publish(f.value)).request('POST','/mutation',{}), error => error.outcomeUnknown)
  assert.equal(calls, 1)
})

test('runtime suppresses late account results and disposal aborts active HTTP work', async t => {
  const {LoopBackend} = await import('../backend/runtime.ts')
  let entered, release
  let seen = new Promise(resolve => {entered = resolve})
  let gate = new Promise(resolve => {release = resolve})
  const f = await fixture(t, async (_req, res) => {entered(); await gate; res.end(JSON.stringify({actions:[{id:'task.read'}]}))})
  const initial = await f.credentials.publish(f.value)
  const runtime = new LoopBackend({provider:f.provider, server:f.base, installation:'installation', pageOrigin:'http://127.0.0.1:4333'})
  t.after(() => runtime.dispose())
  const context = {accountPrincipal:'principal', workspaceId:'workspace', sessionId:'session'}
  const pending = runtime.catalog(context)
  await seen
  await f.credentials.publish({...f.value, principal_id:'replacement'})
  release()
  await assert.rejects(pending, {code:'loop-host/needs-auth'})
  await assert.rejects(runtime.catalog(context), {code:'loop-host/needs-auth'})
  await runtime.dispose()
  assert.throws(() => runtime.catalog(context), {code:'loop-host/unavailable'})
  assert.equal(runtime.dispose(), runtime.dispose())
  assert.notEqual((await f.credentials.read()).generation, initial.generation)

  const runtime2 = new LoopBackend({provider:f.provider, server:f.base, installation:'installation', pageOrigin:'http://127.0.0.1:4333'})
  t.after(() => runtime2.dispose())
  seen = new Promise(resolve => {entered = resolve})
  gate = new Promise(resolve => {release = resolve})
  const active = runtime2.catalog({...context, accountPrincipal:'replacement'})
  await seen
  const failed = assert.rejects(active)
  await runtime2.dispose()
  await failed
  release()
})

test('runtime owns concurrent login challenges and stops every callback listener', async t => {
  const {LoopBackend} = await import('../backend/runtime.ts')
  const f = await oauthFixture(t)
  const runtime = new LoopBackend({provider:f.provider, server:f.base, installation:'installation', pageOrigin:'http://127.0.0.1:4333'})
  t.after(() => runtime.dispose())
  const [first, second] = await Promise.all([runtime.beginLogin(), runtime.beginLogin()])
  await assert.rejects(runtime.completeLogin(first.challengeId), {code:'loop-host/cancelled'})
  const firstCallback = new URL(first.authorizationURL).searchParams.get('redirect_uri')
  await assert.rejects(fetch(firstCallback))
  const waiting = runtime.completeLogin(second.challengeId)
  const rejected = assert.rejects(waiting, {code:'loop-host/cancelled'})
  await runtime.dispose()
  await rejected
  await assert.rejects(fetch(new URL(second.authorizationURL).searchParams.get('redirect_uri')))
  assert.equal(await f.credentials.read(), undefined)
})

test('official Cordis plugin lifecycle cancels pending login when the plugin is disabled', async t => {
  const {Loader} = await import('@deepseek-ai/cordis-plugin-loader')
  const plugin = await import('../backend/plugin.ts')
  const f = await oauthFixture(t)
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  ctx.provide('credentials', f.provider)
  const fiber = ctx.plugin(Loader.prototype.unwrapExports(plugin), {server:f.base, installation:'installation', pageOrigin:'http://127.0.0.1:4333'})
  await fiber
  const runtime = ctx.get('loopNativeBackend')
  const login = await runtime.beginLogin()
  const completing = assert.rejects(runtime.completeLogin(login.challengeId), {code:'loop-host/cancelled'})
  await fiber.dispose()
  await completing
  assert.throws(() => runtime.catalog({accountPrincipal:'principal',workspaceId:'workspace',sessionId:'session'}), {code:'loop-host/unavailable'})
  await assert.rejects(fetch(new URL(login.authorizationURL).searchParams.get('redirect_uri')))
})

test('cancellation during provider publication removes only that login generation', async t => {
  const f = await fixture(t)
  const controller = new AbortController()
  const provider = {
    readRecord: f.provider.readRecord.bind(f.provider),
    async modifyRecord(key, mutate) {
      const saved = await f.provider.modifyRecord(key, mutate)
      controller.abort()
      return saved
    },
  }
  const store = new HostCredentialStore(provider, f.base, 'workspace', 'installation')
  await assert.rejects(store.publish(f.value, controller.signal), {code:'loop-host/cancelled'})
  assert.equal(await (await f.store()).read(), undefined)
})

test('refresh cannot change principal, workspace, grant or scope', async t => {
  for (const change of [{principal_id:'other'}, {workspace_id:'other'}, {grant_id:'other'}, {scope:'admin'}]) {
    await t.test(Object.keys(change)[0], async t => {
      const f = await fixture(t, (_req, res) => res.end(JSON.stringify({...tokenResponse, ...change})))
      const initial = await f.credentials.publish({...f.value, access_expires_at:new Date(0).toISOString()})
      await assert.rejects(new TokenManager(f.credentials, initial).credential(), {code:'loop-host/backend-invalid'})
      assert.equal((await (await f.store()).read()).refresh_state, 'unknown')
    })
  }
})


test('pending exact-grant disconnect fences refresh and replacement login',async t=>{
  const f=await fixture(t,async(_req,res)=>{res.writeHead(500);res.end()})
  const credential=await f.credentials.publish(f.value)
  await f.credentials.modify(async current=>({...current,disconnect:{input:{operationId:'operation'}}}))
  await assert.rejects(new TokenManager(f.credentials,credential).credential(),{code:'loop-host/needs-auth'})
  await assert.rejects(f.credentials.publish(f.value),{code:'loop-host/conflict'})
  assert.equal((await f.credentials.read()).generation,credential.generation)
})

test('ordinary logout cannot erase a confirmed disconnect tombstone',async t=>{
  const f=await fixture(t)
  const credential=await f.credentials.publish(f.value)
  const receipt={operationId:'operation',status:'completed',installationId:'installation',workspaceId:'workspace',completedAt:new Date().toISOString()}
  await f.credentials.modify(async current=>({...current,disconnect:{input:{operationId:'operation'},receipt}}))
  await assert.rejects(f.credentials.logout(credential.generation),{code:'loop-host/conflict'})
  assert.deepEqual((await f.credentials.read()).disconnect.receipt,receipt)
  await assert.rejects(f.credentials.logout(credential.generation,{disconnectOperationId:'another-operation'}),{code:'loop-host/conflict'})
  assert.deepEqual((await f.credentials.read()).disconnect.receipt,receipt)
  await f.credentials.logout(credential.generation,{disconnectOperationId:'operation'})
  assert.equal(await (await f.store()).read(),undefined)
})

test('model revoke racing full account disconnect preserves the tombstone for retry',async t=>{
  const {LoopBackend}=await import('../backend/runtime.ts')
  let releaseDelete,deleteStarted
  let releaseStatus,statusStarted
  const deleteGate=new Promise(resolve=>releaseDelete=resolve)
  const statusGate=new Promise(resolve=>releaseStatus=resolve)
  const deleteSeen=new Promise(resolve=>deleteStarted=resolve)
  const statusSeen=new Promise(resolve=>statusStarted=resolve)
  let confirmed=false,executions=0
  const f=await fixture(t,async(req,res)=>{
    const path=new URL(req.url,'http://test').pathname
    if(req.method==='DELETE'&&path.endsWith('/connection')){
      deleteStarted();await deleteGate;res.writeHead(204).end();return
    }
    if(req.method==='POST'&&path.endsWith('/disconnect-operations')){
      const body=JSON.parse(await new Promise(resolve=>{let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>resolve(raw))}))
      res.end(JSON.stringify({operationId:body.operationId,browserUrl:f.base+'/confirm-disconnect',expiresAt:new Date(Date.now()+60000).toISOString()}));return
    }
    if(path.includes('/disconnect-operations/')){
      if(path.endsWith('/reissue-completion')){
        const operation=(await f.credentials.read()).disconnect.input
        res.end(JSON.stringify({operationId:operation.operationId,receipt:{operationId:operation.operationId,status:'completed',installationId:'installation',workspaceId:'workspace',completedAt:new Date().toISOString()}}));return
      }
      if(req.method==='GET'&&!confirmed){
        statusStarted();await statusGate;res.writeHead(500).end();return
      }
      const operation=(await f.credentials.read())?.disconnect?.input
      res.end(JSON.stringify({operationId:operation?.operationId,status:'confirmed'}));return
    }
    res.writeHead(404).end()
  })
  const credential=await f.credentials.publish({...f.value,host_callback_uri:'http://127.0.0.1:4321/callback'})
  const runtime=new LoopBackend({provider:f.provider,server:f.base,installation:'installation',pageOrigin:'http://127.0.0.1:4333'})
  t.after(()=>runtime.dispose())
  const context={accountPrincipal:'principal',workspaceId:'workspace',sessionId:'session'}
  const model=runtime.disconnectModelConnection(context,credential.grant_id)
  await deleteSeen
  const account=runtime.disconnectAccount('workspace')
  releaseDelete()
  await assert.rejects(model,{code:'loop-host/conflict'})
  await statusSeen
  assert.ok((await f.credentials.read()).disconnect)
  releaseStatus()
  await assert.rejects(account,{code:'loop-host/disconnect-failed'})
  assert.ok((await f.credentials.read()).disconnect.receipt===undefined,'the operation must remain frozen after a transport failure')
  confirmed=true
  await runtime.disconnectAccount('workspace')
  assert.equal(await (await f.store()).read(),undefined)
  executions++
  assert.equal(executions,1)
})

test('model revoke clears its principal without replacing or closing a later account',async t=>{
  const {NativeHostActions}=await import('../backend/adapter.ts')
  const f=await fixture(t,async(req,res)=>{
    if(req.method==='DELETE'&&req.url.endsWith('/connection'))return res.writeHead(204).end()
    res.writeHead(404).end()
  })
  const principals=[]
  let remembered='principal'
  let worksiteStops=0
  const adapter=new NativeHostActions({
    stateHome:f.root+'/host',serviceBaseUrl:f.base,loopWorkspaceId:'workspace',installationId:'installation',
    pageOrigin:'http://127.0.0.1:4333',syncProfile:'test',accountPrincipal:'principal',
  },{provider:f.provider})
  adapter.onAccountPrincipal=async principal=>{
    if(remembered&&principal&&remembered!==principal)throw new Error('account changed without a sign-out boundary')
    principals.push(principal);remembered=principal
  }
  t.after(()=>adapter.dispose())
  const worksiteStop=adapter.backend.worksiteStop.bind(adapter.backend)
  adapter.backend.worksiteStop=async()=>{worksiteStops++;return worksiteStop()}
  const first=await f.credentials.publish(f.value)
  const removed=await adapter.request('disconnectModelConnection',{connectionId:first.grant_id,accountPrincipal:'principal'})
  assert.equal(removed.state,'needs_auth')
  assert.equal(adapter.accountPrincipal,'')
  assert.deepEqual(principals,[''])
  assert.equal(worksiteStops,0)
  await f.credentials.publish({...f.value,principal_id:'principal-b',grant_id:'grant-b'})
  adapter.backend.accountStatus=async()=>({state:'signed_in',accountPrincipal:'principal-b',workspaceId:'workspace',grantId:'grant-b'})
  let revoked=''
  adapter.backend.disconnectAccount=async()=>{revoked=adapter.accountPrincipal}
  assert.equal((await adapter.request('connectAccount',{})).state,'connected')
  assert.equal(adapter.accountPrincipal,'principal-b')
  await adapter.request('disconnectAccount',{})
  assert.equal(revoked,'principal-b')
  assert.equal(adapter.accountPrincipal,'')
  assert.deepEqual(principals,['','principal-b',''])
})

test('model revoke rejects an overlapping login and remains retryable after consent completes',async t=>{
  const {NativeHostActions}=await import('../backend/adapter.ts')
  const f=await fixture(t,async(req,res)=>{
    if(req.method==='DELETE'&&req.url.endsWith('/connection'))return res.writeHead(204).end()
    res.writeHead(404).end()
  })
  let release,started
  const gate=new Promise(resolve=>release=resolve),seen=new Promise(resolve=>started=resolve)
  const adapter=new NativeHostActions({
    stateHome:f.root+'/host',serviceBaseUrl:f.base,loopWorkspaceId:'',installationId:'installation',
    pageOrigin:'http://127.0.0.1:4333',syncProfile:'test',
  },{provider:f.provider})
  t.after(()=>adapter.dispose())
  adapter.backend.accountStatus=async()=>({state:'signed_out'})
  adapter.backend.beginLogin=async()=>({challengeId:'challenge',authorizationURL:f.base+'/authorize'})
  adapter.backend.completeLogin=async()=>{started();await gate;return {accountPrincipal:'principal-b',workspaceId:'workspace',grantId:'grant-b'}}
  assert.equal((await adapter.request('connectAccount',{})).state,'needs_auth')
  await seen
  await assert.rejects(adapter.request('disconnectModelConnection',{connectionId:'grant-b'}),{code:'loop-host/conflict'})
  await f.credentials.publish({...f.value,principal_id:'principal-b',grant_id:'grant-b'})
  release()
  for(let i=0;i<100&&adapter.accountPrincipal!=='principal-b';i++)await new Promise(resolve=>setTimeout(resolve,5))
  assert.equal(adapter.accountPrincipal,'principal-b')
  assert.equal((await adapter.request('disconnectModelConnection',{connectionId:'grant-b'})).state,'needs_auth')
  assert.equal(adapter.accountPrincipal,'')
})

test('model revocation owns the lifecycle before its first credential read',async t=>{
  const {NativeHostActions}=await import('../backend/adapter.ts')
  const provider=memoryProvider()
  const f=await fixture(t,async(req,res)=>{
    if(req.method==='POST'&&req.url.endsWith('/session'))return res.end(JSON.stringify({principalId:'principal-b',workspaceId:'workspace',grantId:'grant-b',accountName:'B'}))
    if(req.method==='DELETE'&&req.url.endsWith('/connection'))return res.writeHead(204).end()
    res.writeHead(404).end()
  })
  const store=new HostCredentialStore(provider,f.base,'workspace','installation')
  const first=await store.publish(f.value)
  const principals=[]
  const adapter=new NativeHostActions({
    stateHome:f.root+'/host',serviceBaseUrl:f.base,loopWorkspaceId:'workspace',installationId:'installation',
    pageOrigin:'http://127.0.0.1:4333',syncProfile:'test',accountPrincipal:'principal',
  },{provider})
  adapter.onAccountPrincipal=principal=>{principals.push(principal)}
  t.after(()=>adapter.dispose())
  const blocked=provider.pauseRead(1)
  const model=adapter.request('disconnectModelConnection',{connectionId:first.grant_id,accountPrincipal:'principal'})
  await blocked.ready
  await store.publish({...f.value,principal_id:'principal-b',grant_id:'grant-b'})
  await assert.rejects(adapter.request('connectAccount',{}),{code:'loop-host/conflict'})
  assert.deepEqual(principals,[])
  blocked.release()
  await assert.rejects(model,error=>["loop-host/conflict","loop-host/needs-auth"].includes(error.code))
})

test('full disconnect claims before adapter credential read and still runs remote cleanup',async t=>{
  const {NativeHostActions}=await import('../backend/adapter.ts')
  const provider=memoryProvider()
  let releaseDelete,deleteStarted
  const deleteGate=new Promise(resolve=>releaseDelete=resolve),deleteSeen=new Promise(resolve=>deleteStarted=resolve)
  let remoteCreates=0
  const f=await fixture(t,async(req,res)=>{
    const path=new URL(req.url,'http://test').pathname
    if(req.method==='DELETE'&&path.endsWith('/connection')){
      deleteStarted();await deleteGate;res.writeHead(204).end();return
    }
    if(req.method==='POST'&&path.endsWith('/disconnect-operations')){
      remoteCreates++
      const body=JSON.parse(await new Promise(resolve=>{let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>resolve(raw))}))
      res.end(JSON.stringify({operationId:body.operationId,browserUrl:f.base+'/confirm-disconnect',expiresAt:new Date(Date.now()+60000).toISOString()}));return
    }
    if(path.includes('/disconnect-operations/')){
      if(req.method==='GET'&&remoteCreates===0)return res.writeHead(404).end()
      const operation=(await store.read()).disconnect.input
      if(path.endsWith('/reissue-completion')){
        res.end(JSON.stringify({operationId:operation.operationId,receipt:{operationId:operation.operationId,status:'completed',installationId:'installation',workspaceId:'workspace',completedAt:new Date().toISOString()}}));return
      }
      res.end(JSON.stringify({operationId:operation.operationId,status:'confirmed'}));return
    }
    res.writeHead(404).end()
  })
  const store=new HostCredentialStore(provider,f.base,'workspace','installation')
  const credential=await store.publish({...f.value,host_callback_uri:'http://127.0.0.1:4321/callback'})
  const adapter=new NativeHostActions({
    stateHome:f.root+'/host',serviceBaseUrl:f.base,loopWorkspaceId:'workspace',installationId:'installation',
    pageOrigin:'http://127.0.0.1:4333',syncProfile:'test',accountPrincipal:'principal',
  },{provider})
  t.after(()=>adapter.dispose())
  const blocked=provider.pauseRead(3)
  const model=adapter.request('disconnectModelConnection',{connectionId:credential.grant_id,accountPrincipal:'principal'})
  await deleteSeen
  const full=adapter.request('disconnectAccount',{accountPrincipal:'principal'})
  await blocked.ready
  releaseDelete()
  await assert.rejects(model,{code:'loop-host/conflict'})
  blocked.release()
  await full
  assert.equal(remoteCreates,1)
  assert.equal(await store.read(),undefined)
  assert.equal(adapter.accountPrincipal,'')
})

test('same-tick full disconnect requests share one owner and one remote operation',async t=>{
  const {NativeHostActions}=await import('../backend/adapter.ts')
  const provider=memoryProvider()
  let creates=0,created=false
  let releaseCreate,createStarted
  const createGate=new Promise(resolve=>releaseCreate=resolve),createSeen=new Promise(resolve=>createStarted=resolve)
  const f=await fixture(t,async(req,res)=>{
    const path=new URL(req.url,'http://test').pathname
    if(req.method==='POST'&&path.endsWith('/disconnect-operations')){
      creates++;createStarted();await createGate;created=true
      const body=JSON.parse(await new Promise(resolve=>{let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>resolve(raw))}))
      res.end(JSON.stringify({operationId:body.operationId,browserUrl:f.base+'/confirm-disconnect',expiresAt:new Date(Date.now()+60000).toISOString()}));return
    }
    if(path.includes('/disconnect-operations/')){
      if(req.method==='GET'&&!created)return res.writeHead(404).end()
      const operation=(await store.read()).disconnect.input
      if(path.endsWith('/reissue-completion')){
        res.end(JSON.stringify({operationId:operation.operationId,receipt:{operationId:operation.operationId,status:'completed',installationId:'installation',workspaceId:'workspace',completedAt:new Date().toISOString()}}));return
      }
      res.end(JSON.stringify({operationId:operation.operationId,status:'confirmed'}));return
    }
    res.writeHead(404).end()
  })
  const store=new HostCredentialStore(provider,f.base,'workspace','installation')
  await store.publish({...f.value,host_callback_uri:'http://127.0.0.1:4321/callback'})
  const adapter=new NativeHostActions({
    stateHome:f.root+'/host',serviceBaseUrl:f.base,loopWorkspaceId:'workspace',installationId:'installation',
    pageOrigin:'http://127.0.0.1:4333',syncProfile:'test',accountPrincipal:'principal',
  },{provider})
  t.after(()=>adapter.dispose())
  const first=adapter.request('disconnectAccount',{accountPrincipal:'principal'})
  const second=adapter.request('disconnectAccount',{accountPrincipal:'principal'})
  await createSeen
  const controller=new AbortController();controller.abort()
  const abortedDuplicate=adapter.request('disconnectAccount',{accountPrincipal:'principal'},controller.signal)
  await assert.rejects(adapter.request('connectAccount',{}),{code:'loop-host/conflict'})
  releaseCreate()
  const results=await Promise.all([first,second,abortedDuplicate])
  assert.deepEqual(results,[{},{},{}])
  assert.equal(creates,1)
  assert.equal(await store.read(),undefined)
  assert.equal(adapter.accountPrincipal,'')
})

test('rejected full disconnect releases its shared owner and concurrent retry succeeds once',async t=>{
  const {NativeHostActions}=await import('../backend/adapter.ts')
  const provider=memoryProvider()
  let recover=false,creates=0,created=false
  const f=await fixture(t,async(req,res)=>{
    const path=new URL(req.url,'http://test').pathname
    if(req.method==='POST'&&path.endsWith('/disconnect-operations')){
      creates++
      if(!recover)return res.writeHead(500).end()
      created=true
      const body=JSON.parse(await new Promise(resolve=>{let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>resolve(raw))}))
      res.end(JSON.stringify({operationId:body.operationId,browserUrl:f.base+'/confirm-disconnect',expiresAt:new Date(Date.now()+60000).toISOString()}));return
    }
    if(path.includes('/disconnect-operations/')){
      if(req.method==='GET'&&!created)return res.writeHead(404).end()
      const operation=(await store.read()).disconnect.input
      if(path.endsWith('/reissue-completion')){
        res.end(JSON.stringify({operationId:operation.operationId,receipt:{operationId:operation.operationId,status:'completed',installationId:'installation',workspaceId:'workspace',completedAt:new Date().toISOString()}}));return
      }
      res.end(JSON.stringify({operationId:operation.operationId,status:'confirmed'}));return
    }
    res.writeHead(404).end()
  })
  const store=new HostCredentialStore(provider,f.base,'workspace','installation')
  await store.publish({...f.value,host_callback_uri:'http://127.0.0.1:4321/callback'})
  const adapter=new NativeHostActions({
    stateHome:f.root+'/host',serviceBaseUrl:f.base,loopWorkspaceId:'workspace',installationId:'installation',
    pageOrigin:'http://127.0.0.1:4333',syncProfile:'test',accountPrincipal:'principal',
  },{provider})
  t.after(()=>adapter.dispose())
  const failed=await Promise.allSettled(Array.from({length:3},()=>adapter.request('disconnectAccount',{accountPrincipal:'principal'})))
  assert.ok(failed.every(result=>result.status==='rejected'&&result.reason.code==='loop-host/disconnect-failed'))
  assert.equal(creates,1)
  assert.ok((await store.read()).disconnect)
  recover=true
  const retried=await Promise.all(Array.from({length:3},()=>adapter.request('disconnectAccount',{accountPrincipal:'principal'})))
  assert.deepEqual(retried,[{},{},{}])
  assert.equal(creates,2)
  assert.equal(await store.read(),undefined)
  assert.equal(adapter.accountPrincipal,'')
})

test('full disconnect recovers the exact credential when model logout commits after guard',async t=>{
  const {NativeHostActions}=await import('../backend/adapter.ts')
  const provider=memoryProvider()
  let creates=0,created=false
  const f=await fixture(t,async(req,res)=>{
    const path=new URL(req.url,'http://test').pathname
    if(req.method==='DELETE'&&path.endsWith('/connection'))return res.writeHead(204).end()
    if(req.method==='POST'&&path.endsWith('/disconnect-operations')){
      creates++;created=true
      const body=JSON.parse(await new Promise(resolve=>{let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>resolve(raw))}))
      res.end(JSON.stringify({operationId:body.operationId,browserUrl:f.base+'/confirm-disconnect',expiresAt:new Date(Date.now()+60000).toISOString()}));return
    }
    if(path.includes('/disconnect-operations/')){
      if(req.method==='GET'&&!created)return res.writeHead(404).end()
      const operation=(await store.read()).disconnect.input
      if(path.endsWith('/reissue-completion')){
        res.end(JSON.stringify({operationId:operation.operationId,receipt:{operationId:operation.operationId,status:'completed',installationId:'installation',workspaceId:'workspace',completedAt:new Date().toISOString()}}));return
      }
      res.end(JSON.stringify({operationId:operation.operationId,status:'confirmed'}));return
    }
    res.writeHead(404).end()
  })
  const store=new HostCredentialStore(provider,f.base,'workspace','installation')
  const credential=await store.publish({...f.value,host_callback_uri:'http://127.0.0.1:4321/callback'})
  const adapter=new NativeHostActions({
    stateHome:f.root+'/host',serviceBaseUrl:f.base,loopWorkspaceId:'workspace',installationId:'installation',
    pageOrigin:'http://127.0.0.1:4333',syncProfile:'test',accountPrincipal:'principal',
  },{provider})
  t.after(()=>adapter.dispose())
  const commit=provider.pauseCommit(provider.commits+1)
  const model=adapter.request('disconnectModelConnection',{connectionId:credential.grant_id,accountPrincipal:'principal'})
  await commit.ready
  assert.equal((await store.read()).generation,credential.generation,'the provider callback has returned but has not committed logout')
  const full=adapter.request('disconnectAccount',{accountPrincipal:'principal'})
  await assert.rejects(adapter.request('connectAccount',{}),{code:'loop-host/conflict'})
  assert.equal(creates,0)
  commit.release()
  await assert.rejects(model,{code:'loop-host/conflict'})
  await full
  assert.equal(creates,1)
  assert.equal(await store.read(),undefined)
  assert.equal(adapter.accountPrincipal,'')
})

test('model revoke commit-then-error retains only disconnect recovery across a fresh runtime',async t=>{
  const {LoopBackend}=await import('../backend/runtime.ts')
  let creates=0,created=false,failAck=true,activeStore
  const f=await fixture(t,async(req,res)=>{
    const path=new URL(req.url,'http://test').pathname
    if(req.method==='DELETE'&&path.endsWith('/connection'))return res.writeHead(204).end()
    if(req.method==='POST'&&path.endsWith('/disconnect-operations')){
      creates++;created=true
      const body=JSON.parse(await new Promise(resolve=>{let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>resolve(raw))}))
      assert.deepEqual(body.grantIds,['grant'])
      res.end(JSON.stringify({operationId:body.operationId,browserUrl:f.base+'/confirm-disconnect',expiresAt:new Date(Date.now()+60000).toISOString()}));return
    }
    if(path.includes('/disconnect-operations/')){
      if(req.method==='GET'&&!created)return res.writeHead(404).end()
      const operation=(await activeStore.read()).disconnect.input
      if(path.endsWith('/reissue-completion')){
        res.end(JSON.stringify({operationId:operation.operationId,receipt:{operationId:operation.operationId,status:'completed',installationId:'installation',workspaceId:'workspace',completedAt:new Date().toISOString()}}));return
      }
      res.end(JSON.stringify({operationId:operation.operationId,status:'confirmed'}));return
    }
    res.writeHead(404).end()
  })
  activeStore=f.credentials
  await f.credentials.publish({...f.value,host_callback_uri:'http://127.0.0.1:4321/callback'})
  const provider={readRecord:key=>f.provider.readRecord(key),async modifyRecord(key,mutate){
    const result=await f.provider.modifyRecord(key,mutate)
    if(failAck&&result?.payload?.disconnectRecovery){failAck=false;throw new Error('committed but acknowledgement lost')}
    return result
  }}
  const options={provider,server:f.base,installation:'installation',pageOrigin:'http://127.0.0.1:4333'}
  const first=new LoopBackend(options)
  await assert.rejects(first.disconnectModelConnection({workspaceId:'workspace',accountPrincipal:'principal',sessionId:'s'},'grant'),/acknowledgement lost/)
  await first.dispose()
  const reopened=await f.store();activeStore=reopened
  assert.equal(await reopened.read(),undefined,'normal token reads cannot use revoked credentials')
  assert.equal((await reopened.readForDisconnect()).grant_id,'grant')
  const fresh=new LoopBackend({...options,provider:reopened.provider});t.after(()=>fresh.dispose())
  assert.equal((await fresh.accountStatus('workspace')).state,'signed_out')
  await fresh.disconnectAccount('workspace')
  assert.equal(creates,1,'restart still performs the full remote revoke')
  assert.equal(await reopened.readForDisconnect(),undefined)
  await fresh.disconnectAccount('workspace');assert.equal(creates,1)
})

test('new login replaces revoked recovery without restoring old authority',async t=>{
  const f=await fixture(t)
  const old=await f.credentials.publish(f.value)
  assert.equal(await f.credentials.revokeModel(old.generation,()=>true),true)
  assert.equal(await f.credentials.read(),undefined)
  await assert.rejects(new TokenManager(f.credentials,old).credential(),{code:'loop-host/needs-auth'})
  const next=await f.credentials.publish({...f.value,principal_id:'another-account',grant_id:'another-grant'})
  assert.equal((await f.credentials.readForDisconnect()).generation,next.generation)
  assert.equal(await f.credentials.revokeModel(old.generation,()=>true),false)
  assert.equal((await f.credentials.read()).generation,next.generation)
})

test('last workspace unbind claims full disconnect before account or credential reads',async t=>{
  const {NativeHostActions}=await import('../backend/adapter.ts')
  const provider=memoryProvider()
  let releaseDelete,deleteStarted
  const deleteGate=new Promise(resolve=>releaseDelete=resolve),deleteSeen=new Promise(resolve=>deleteStarted=resolve)
  let creates=0,created=false
  const f=await fixture(t,async(req,res)=>{
    const path=new URL(req.url,'http://test').pathname
    if(req.method==='DELETE'&&path.endsWith('/connection')){deleteStarted();await deleteGate;res.writeHead(204).end();return}
    if(req.method==='POST'&&path.endsWith('/disconnect-operations')){
      creates++;created=true
      const body=JSON.parse(await new Promise(resolve=>{let raw='';req.on('data',chunk=>raw+=chunk);req.on('end',()=>resolve(raw))}))
      res.end(JSON.stringify({operationId:body.operationId,browserUrl:f.base+'/confirm-disconnect',expiresAt:new Date(Date.now()+60000).toISOString()}));return
    }
    if(path.includes('/disconnect-operations/')){
      if(req.method==='GET'&&!created)return res.writeHead(404).end()
      const operation=(await store.read()).disconnect.input
      if(path.endsWith('/reissue-completion')){
        res.end(JSON.stringify({operationId:operation.operationId,receipt:{operationId:operation.operationId,status:'completed',installationId:'installation',workspaceId:'workspace',completedAt:new Date().toISOString()}}));return
      }
      res.end(JSON.stringify({operationId:operation.operationId,status:'confirmed'}));return
    }
    res.writeHead(404).end()
  })
  const store=new HostCredentialStore(provider,f.base,'workspace','installation')
  const credential=await store.publish({...f.value,host_callback_uri:'http://127.0.0.1:4321/callback'})
  const adapter=new NativeHostActions({
    stateHome:f.root+'/host',serviceBaseUrl:f.base,loopWorkspaceId:'workspace',installationId:'installation',
    pageOrigin:'http://127.0.0.1:4333',syncProfile:'test',accountPrincipal:'principal',
  },{provider})
  t.after(()=>adapter.dispose())
  let accountStatuses=0
  const accountStatus=adapter.backend.accountStatus.bind(adapter.backend)
  adapter.backend.accountStatus=async(...args)=>{accountStatuses++;return accountStatus(...args)}
  const credentialRead=provider.pauseRead(3)
  const model=adapter.request('disconnectModelConnection',{connectionId:credential.grant_id,accountPrincipal:'principal'})
  await deleteSeen
  const unbind=adapter.request('unbind',{workspace:{workspaceId:'host-workspace'},hasRemainingBindings:false,sessionIds:[]})
  await assert.rejects(adapter.request('connectAccount',{}),{code:'loop-host/conflict'})
  assert.equal(accountStatuses,0)
  releaseDelete()
  await assert.rejects(model,{code:'loop-host/conflict'})
  await credentialRead.ready
  credentialRead.release()
  assert.deepEqual(await unbind,{})
  assert.equal(accountStatuses,0)
  assert.equal(creates,1)
  assert.equal(await store.read(),undefined)
  assert.equal(adapter.accountPrincipal,'')
})

test('disconnect preserves a browser confirmation challenge across missing page authority and restart',async t=>{
  const {DisconnectService}=await import('../backend/disconnect.ts')
  const f=await fixture(t)
  await f.credentials.publish({...f.value,host_callback_uri:'http://127.0.0.1:4321/callback'})
  let operation,confirmed=false,creates=0,executions=0
  const fake=async(url,init)=>{
    const path=new URL(url).pathname
    if(path.endsWith('/disconnect-operations')&&init.method==='POST'){
      creates++;operation=JSON.parse(init.body)
      return Response.json({operationId:operation.operationId,browserUrl:f.base+'/confirm-disconnect',expiresAt:new Date(Date.now()+60000).toISOString()})
    }
    if(!operation)return Response.json({}, {status:404})
    if(path.endsWith('/reissue-completion'))return Response.json({completionCode:'synthetic-code'})
    if(path.endsWith('/execute')){
      executions++
      return Response.json({operationId:operation.operationId,receipt:{operationId:operation.operationId,status:'completed',installationId:'installation',workspaceId:'workspace',completedAt:new Date().toISOString()}})
    }
    return Response.json({operationId:operation.operationId,status:confirmed?'confirmed':'awaiting_confirmation'})
  }
  let challenge
  await assert.rejects(new DisconnectService(f.credentials,'installation','http://127.0.0.1:4333',fake).run(),error=>{
    assert.equal(error.code,'loop-host/disconnect-auth-required');challenge=error.challenge;return true
  })
  assert.equal(challenge.loginUrl,f.base+'/confirm-disconnect')
  assert.ok((await f.credentials.read()).disconnect)
  await assert.rejects(new DisconnectService(await f.store(),'installation','http://127.0.0.1:4333',fake).run(),error=>{
    assert.deepEqual(error.challenge,challenge);return true
  })
  confirmed=true
  await new DisconnectService(await f.store(),'installation','http://127.0.0.1:4333',fake).run()
  assert.equal(creates,1);assert.equal(executions,1);assert.equal(await (await f.store()).read(),undefined)
})

test('disconnect replaces only a server-expired operation and retains the exact frozen grant set',async t=>{
  const {DisconnectService}=await import('../backend/disconnect.ts')
  const f=await fixture(t)
  await f.credentials.publish({...f.value,host_callback_uri:'http://127.0.0.1:4321/callback'})
  await f.credentials.modify(async current=>({...current,disconnect:{created:true,input:{operationId:'expired',operationSecret:'old-secret',grantIds:['grant'],humanGrantIds:[],grantProofs:[{grantId:'grant',refreshToken:'refresh-synthetic'}],installationId:'installation',workspaceId:'workspace'}}}))
  let replacement
  const fake=async(url,init)=>{
    const path=new URL(url).pathname
    if(path.endsWith('/expired'))return Response.json({}, {status:410})
    if(init.method==='POST'&&path.endsWith('/disconnect-operations')){
      replacement=JSON.parse(init.body)
      return Response.json({operationId:replacement.operationId,browserUrl:f.base+'/confirm-disconnect',expiresAt:new Date(Date.now()+60000).toISOString()})
    }
    if(!replacement)return Response.json({}, {status:404})
    return Response.json({operationId:replacement.operationId,status:'awaiting_confirmation'})
  }
  await assert.rejects(new DisconnectService(f.credentials,'installation','http://127.0.0.1:4333',fake).run(),{code:'loop-host/disconnect-auth-required'})
  assert.notEqual(replacement.operationId,'expired')
  assert.deepEqual(replacement.grantIds,['grant'])
  assert.deepEqual(replacement.grantProofs,[{grantId:'grant',refreshToken:'refresh-synthetic'}])
  assert.equal((await f.credentials.read()).disconnect.input.operationId,replacement.operationId)
})

test('Home proof migration preserves the exact private Go proof and supports offline lookup without minting authority',async t=>{
  const {HostIdentity}=await import('../backend/host-identity.ts')
  const {mkdir,writeFile,readFile,chmod,symlink}=await import('node:fs/promises')
  const {join}=await import('node:path')
  const f=await fixture(t),root=join(f.root,'old-proofs')
  await mkdir(root,{mode:0o700})
  const path=join(root,createHash('sha256').update(f.base+'\0principal').digest('hex')+'.proof')
  const proof='legacy-home-proof-0123456789abcdef0123456789'
  await writeFile(path,proof,{mode:0o600})
  const api={tokens:{credential:async()=>({principal_id:'principal'})}}
  const identity=new HostIdentity(f.provider,api,'installation',f.base,root)
  assert.equal(await identity.proof(),proof)
  assert.equal(await readFile(path,'utf8'),proof,'rollback source is retained')
  assert.equal(await HostIdentity.loadProof(f.provider,f.base,'principal'),proof)
  assert.equal(await HostIdentity.loadProof(f.provider,f.base,'another'),undefined,'offline lookup cannot create a new proof')
  assert.equal(await HostIdentity.loadProof(f.provider,'https://other.example','principal'),undefined)
  const other=join(root,createHash('sha256').update(f.base+'\0unsafe').digest('hex')+'.proof')
  await symlink(path,other)
  await assert.rejects(HostIdentity.loadProof(f.provider,f.base,'unsafe',root),{code:'loop-host/invalid-state'})
  if(process.platform!=='win32'){
    await chmod(root,0o755)
    await assert.rejects(HostIdentity.loadProof(f.provider,f.base,'missing',root),{code:'loop-host/invalid-state'})
  }
})

test('disconnect retains its confirmed receipt until local cleanup succeeds after restart',async t=>{
  const {DisconnectService}=await import('../backend/disconnect.ts')
  const f=await fixture(t)
  const input={operationId:'confirmed-cleanup',installationId:'installation',workspaceId:'workspace'}
  const receipt={operationId:input.operationId,status:'completed',installationId:'installation',workspaceId:'workspace',completedAt:new Date().toISOString()}
  await f.credentials.publish({...f.value,disconnect:{input,receipt}})
  let attempts=0
  const cleanup=async credential=>{
    assert.deepEqual(credential.disconnect.receipt,receipt)
    if(++attempts===1)throw new Error('synthetic local disk failure')
  }
  const noNetwork=()=>{throw new Error('Completed revocation must not issue another network request')}
  await assert.rejects(new DisconnectService(f.credentials,'installation','http://127.0.0.1:4333',noNetwork,cleanup).run(),/disk failure/)
  assert.deepEqual((await f.credentials.read()).disconnect.receipt,receipt)
  await new DisconnectService(await f.store(),'installation','http://127.0.0.1:4333',noNetwork,cleanup).run()
  assert.equal(attempts,2);assert.equal(await (await f.store()).read(),undefined)
})

test('disconnect waits for a just-completed login locator and fences concurrent reconnects',async t=>{
  const {NativeHostActions}=await import('../backend/adapter.ts')
  const f=await fixture(t)
  const adapter=new NativeHostActions({stateHome:f.root+'/host',serviceBaseUrl:f.base,loopWorkspaceId:'',installationId:'installation',pageOrigin:'http://127.0.0.1:4333',syncProfile:'test'},{provider:f.provider})
  t.after(()=>adapter.dispose())
  let release,started=false,cancelled=false
  const pending=new Promise(resolve=>release=resolve),revoked=[]
  // The publication completed in the provider while the Host caller has not
  // yet finished recording the discovered workspace. Control only scheduling.
  await f.credentials.publish(f.value)
  adapter.backend.cancelLogin=()=>{cancelled=true}
  adapter.backend.disconnectAccount=async workspace=>{revoked.push(workspace)}
  adapter.challenge={id:'login',loginUrl:'https://loop.example/login',expiresAt:new Date().toISOString()}
  adapter.completion=(async()=>{started=true;await pending;adapter.workspace='workspace';adapter.accountPrincipal='principal'})()
  assert.ok(started)
  const disconnect=adapter.request('disconnectAccount',{})
  for(let i=0;i<20&&!cancelled;i++)await new Promise(resolve=>setTimeout(resolve,5))
  assert.ok(cancelled);assert.deepEqual(revoked,[])
  await assert.rejects(adapter.request('connectAccount',{}),{code:'loop-host/conflict'})
  release();await disconnect
  assert.deepEqual(revoked,['workspace']);assert.equal(adapter.accountPrincipal,'')
})


test('account status explains unknown refresh and does not replay the refresh token',async t=>{
  const {LoopBackend}=await import('../backend/runtime.ts')
  let calls=0
  const f=await fixture(t,req=>{calls++;req.socket.destroy()})
  await f.credentials.publish({...f.value,access_expires_at:new Date(0).toISOString()})
  const runtime=new LoopBackend({provider:f.provider,server:f.base,installation:'installation',pageOrigin:f.base});t.after(()=>runtime.dispose())
  for(let i=0;i<2;i++)assert.deepEqual(await runtime.accountStatus('workspace'),{state:'needs_auth',accountPrincipal:'principal',workspaceId:'workspace',reason:'refresh_outcome_unknown'})
  assert.equal(calls,1)
})

test('explicit personal call previews exact arguments through the public endpoint without invoking an Agent action',async t=>{
  const {NativeHostActions}=await import('../backend/adapter.ts')
  const {LoopHostRuntime}=await import('../host-runtime.mjs')
  const received=[],args={opaque:{target:'unchanged'},requestId:'same'}
  const f=await fixture(t,async(req,res)=>{
    assert.equal(req.method,'POST');assert.match(req.url,/\/actions\/future.publish\/delegation-preview$/)
    let raw='';for await(const b of req)raw+=b;received.push(JSON.parse(raw))
    res.end(JSON.stringify({action:'future.publish',resourceConstraints:['future:exact'],workspaceWide:false,write:true,manage:false}))
  })
  await f.credentials.publish({...f.value,scope:'offline_access'})
  const adapter=new NativeHostActions({stateHome:f.root+'/host',serviceBaseUrl:f.base,loopWorkspaceId:'workspace',installationId:'installation',pageOrigin:f.base,syncProfile:'test',accountPrincipal:'principal'},{provider:f.provider})
  t.after(()=>adapter.dispose())
  const host={withConnectionLease:(_s,fn)=>fn(),businessWorkspace:async()=>({workspace:{id:'local'}}),accountPrincipal:'principal',serviceBaseUrl:f.base,loopWorkspaceId:'workspace',actions:{agentSchema:(input,signal)=>adapter.request('agentSchema',input,signal)}}
  const command={principal:'human',connection:'business',verb:'call',name:'future.publish',input:JSON.stringify(args)}
  const result=await LoopHostRuntime.prototype.previewHumanCommand.call(host,'session',command)
  assert.deepEqual(received,[args]);assert.equal(result.delegation.action,command.name);assert.equal(result.owner.loopWorkspaceId,'workspace')
  await assert.rejects(LoopHostRuntime.prototype.previewHumanCommand.call(host,'session',{...command,connection:'apps'}),/connection explicitly/)
  assert.equal(received.length,1)
})
