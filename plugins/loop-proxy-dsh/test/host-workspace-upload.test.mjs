import assert from 'node:assert/strict'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import test from 'node:test'
import {BindingStore} from '../binding-store.mjs'
import {LoopHostRuntime} from '../host-runtime.mjs'
import {validateSyncProjects} from '../host-protocol.mjs'

const server = 'https://loop.example.test'
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'loop-local-upload-'))
  t.after(() => rm(root, {recursive: true, force: true}))
  const store = new BindingStore({root: join(root, 'host'), installationId: 'shared-home', defaultServiceBaseUrl: server})
  await store.setGlobalServer(server)
  await store.setActiveAccount('human', server)
  await store.setLoopWorkspaceForServer(server, 'loop-workspace')
  const workspace = {id: 'local-workspace', title: 'My work', path: root, sessionIds: ['old-session', 'new-session']}
  const sessions = new Map([
    ['old-session', {id: 'old-session', header: {createdAt: 1}}],
    ['new-session', {id: 'new-session', header: {createdAt: Date.now()}}],
  ])
  const prepared = [], uploaded = []
  const actions = {
    currentLoopWorkspaceId: () => 'loop-workspace',
    currentSyncProfile: () => 'local-upload',
    setAccountPrincipal() {},
    async setServiceBaseUrl() {},
    async projectSyncCatalog(input) {
      assert.equal(input.localWorkspaces, true)
      return {state: 'active', accountPrincipal: 'human', accountName: 'Human', workspaceId: 'loop-workspace', workspaceName: 'Loop', agent: {agentId: 'super-agent', displayName: 'Super Agent'}, projects: []}
    },
    async prepareProjectSync(input) {
      prepared.push(input)
      assert.equal(input.localWorkspace, true)
      assert.equal(input.projectId, undefined)
      return {binding: {placementKind: 'channel_session', loopServiceBaseUrl: server, loopWorkspaceId: 'loop-workspace', loopWorkspaceName: 'Loop', projectId: '', projectName: '', defaultChannelId: 'private-channel', agentId: 'super-agent', agentName: 'Super Agent', accountName: 'Human', webUrl: server + '/channel'}}
    },
    async setSync(input) { uploaded.push(input); return {state: 'on', pending: 0, historyPartial: false} },
    async syncStatus() { return {state: 'on', pending: 0, historyPartial: false} },
  }
  const runtime = new LoopHostRuntime({store, actions, workspaces: {list: () => [workspace], get: id => id === workspace.id ? workspace : undefined}, sessions: {get: id => sessions.get(id)}, accountPrincipal: 'human', defaultServiceBaseUrl: server})
  await runtime.waitForActions()
  await runtime.syncProjects({}, undefined, {background: true})
  return {root, store, workspace, sessions, prepared, uploaded, actions, runtime}
}

test('Human dispatch pins verified Loop identity and defaults writes to read-only', async t => {
  const {actions, runtime, prepared} = await fixture(t)
  const before = prepared.length
  const calls = []
  actions.humanAction = async request => {
    calls.push(request)
    if (request.requireReadOnly) return {error: {code: 'forbidden'}}
    return {data: {accepted: true}}
  }
  const request = {principal: 'human', connection: 'business', verb: 'call', name: 'project.archive', input: '{"projectId":"prj_one"}'}
  assert.equal((await runtime.humanCommand('old-session', request, undefined, () => false)).failed, true)
  assert.equal((await runtime.humanCommand('old-session', request, undefined, () => true)).failed, false)
  assert.equal(prepared.length, before)
  assert.deepEqual(calls, [true, false].map(requireReadOnly => ({
    workspaceId: 'local-workspace', sessionId: 'old-session', loopWorkspaceId: 'loop-workspace',
    accountPrincipal: 'human', connection: 'business', name: 'project.archive',
    arguments: {projectId: 'prj_one'}, requireReadOnly,
  })))
  await assert.rejects(runtime.humanCommand('old-session', {...request, connection: 'agent'}, undefined, () => true))
  assert.equal(calls.length, 2)
})

test('history counts only messages and identified authors on the returned page', async t => {
  const {actions, runtime} = await fixture(t)
  const messages = ['a','a','b'].map(memberId => ({author:{memberId,displayName:'Same name'}}))
  actions.humanAction = async () => ({data:{data:{messages,hasMore:true}}})
  const command = {principal:'human',connection:'business',verb:'call',name:'message.history',input:'{"target":"#eng"}'}
  const read = async () => JSON.parse((await runtime.humanCommand('old-session',command,undefined,()=>true)).output)
  assert.deepEqual((await read()).historyScope,{viewer:'human',messagesOnPage:3,distinctAuthorsOnPage:2})
  messages.push({author:{displayName:'Same name'}})
  assert.deepEqual((await read()).historyScope,{viewer:'human',messagesOnPage:4})
})

test('login discovers local workspaces; both stored and new sessions upload with no Project choice', async t => {
  const value = await fixture(t)
  assert.equal(value.prepared.length, 1)
  assert.equal(value.prepared[0].workspace.displayTitle, 'My work')
  for (const id of value.workspace.sessionIds) {
    const target = await value.runtime.sessionSyncTarget(id)
    assert.equal(target.pendingContext.defaultChannelId, 'private-channel')
    assert.equal(target.pendingContext.projectId, '')
  }
  assert.equal(value.uploaded.length, 2)
  assert.ok(value.uploaded.every(input => input.confirmedSourceSequence === 0))
})

test('legacy repair RPC remains accepted with a server revision', () => {
  const request = {reconcileWorkspaceBinding:true,expectedServerRevision:'rev_1'}
  assert.deepEqual(validateSyncProjects(request), request)
  assert.deepEqual(validateSyncProjects({}), {})
  for (const bad of [{expectedServerRevision:'rev_1'}, {reconcileWorkspaceBinding:true}, {...request,confirm:true}, {...request,reconcileWorkspaceBinding:false}]) {
    assert.throws(() => validateSyncProjects(bad))
  }
})

test('background sync repairs the original channel and fences old Sessions, including never-captured history', async t => {
  const {runtime, store, workspace, actions, prepared, sessions} = await fixture(t)
  const binding = () => store.getBinding('human', workspace.id, workspace.path, server)
  const original = await binding()
  await runtime.sessionSyncTarget('old-session')
  const calls = []
  let invalidated = [], owned = false
  runtime.addSessionInvalidationListener(ids => { invalidated = ids })
  actions.reconcileWorkspaceBinding = async input => {
    calls.push(input.confirm)
    assert.deepEqual(input.expectedTarget, {loopServiceBaseUrl:server,loopWorkspaceId:'loop-workspace',agentId:'super-agent',placementKind:'channel_session',defaultChannelId:'private-channel',projectId:''})
    assert.equal(input.workspace.workspaceId, workspace.id)
    assert.equal(input.accountPrincipal, 'human')
    if (!input.confirm) return owned ? {changed:false} : {needsConfirmation:true,expectedRecord:'fingerprint'}
    assert.equal(input.expectedRecord, 'fingerprint')
    assert.notEqual((await binding()).revision, original.revision)
    assert.deepEqual(new Set(invalidated), new Set(workspace.sessionIds))
    owned = true
    return {changed:true}
  }
  const baseline = prepared.length
  // The existing lifecycle callback alone must migrate the binding.
  await runtime.backgroundProjectSync()
  const repaired = await binding()
  assert.notEqual(repaired.revision, original.revision)
  assert.equal(repaired.defaultChannelId, original.defaultChannelId)
  assert.equal(repaired.repairPending, undefined)
  assert.equal(prepared.length, baseline, 'an existing binding must never be prepared again')
  assert.equal(await runtime.sessionSyncTarget('old-session'), null)
  assert.equal(await runtime.sessionSyncTarget('new-session'), null)
  const fresh = 'fresh-session'
  workspace.sessionIds.push(fresh)
  sessions.set(fresh, {id:fresh, header:{createdAt:Date.now()+1}})
  assert.equal((await runtime.sessionSyncTarget(fresh)).pendingContext.defaultChannelId, 'private-channel')
  const revision = (await binding()).revision
  assert.equal((await runtime.syncProjects({})).updated, 0)
  assert.equal((await binding()).revision, revision)
  assert.deepEqual(calls, [false,true,false])
})

test('ordinary sync keeps a pending fence after lost confirmation and releases only on proven ownership', async t => {
  const {runtime, store, workspace, actions, sessions} = await fixture(t)
  const binding = () => store.getBinding('human', workspace.id, workspace.path, server)
  let step = 0
  actions.reconcileWorkspaceBinding = async ({confirm}) => {
    if (confirm) { step++; throw new Error('lost response') }
    return step === 0 ? {needsConfirmation:true,expectedRecord:'fingerprint'} : {changed:false,owned:step === 2}
  }
  assert.equal((await runtime.syncProjects({})).state, 'partial')
  const fenced = await binding()
  assert.equal(fenced.repairPending, true)
  const during = 'during-repair'
  workspace.sessionIds.push(during)
  sessions.set(during, {id:during,header:{createdAt:Date.now()}})
  assert.equal(await runtime.sessionSyncTarget(during), null)
  assert.equal((await runtime.syncProjects({})).state, 'partial')
  assert.equal((await binding()).repairPending, true)
  step = 2
  assert.equal((await runtime.syncProjects({})).updated, 1)
  assert.equal((await binding()).revision, fenced.revision)
  assert.equal((await binding()).repairPending, undefined)
  assert.equal(await runtime.sessionSyncTarget(during), null)
})

test('automatic repair rejects target changes and pending unbind before native probing', async t => {
  const {runtime, store, workspace, actions} = await fixture(t)
  const original = await store.getBinding('human', workspace.id, workspace.path, server)
  let probes = 0
  actions.reconcileWorkspaceBinding = async () => { probes++; return {changed:false} }
  const catalog = actions.projectSyncCatalog
  actions.projectSyncCatalog = async input => ({...await catalog(input), agent:{agentId:'other', displayName:'Other'}})
  assert.equal((await runtime.syncProjects({})).state, 'partial')
  actions.projectSyncCatalog = catalog
  await store.beginUnbinding('human', workspace.id, workspace.path, original.revision, server)
  assert.equal((await runtime.syncProjects({})).state, 'partial')
  assert.equal(probes, 0)
  assert.equal((await store.getBinding('human', workspace.id, workspace.path, server)).revision, original.revision)
})

test('the legacy RPC neither admits unrelated workspaces nor accepts a stale connection revision', async t => {
  const {runtime, workspace, actions, prepared} = await fixture(t)
  runtime.workspaces.list = () => [workspace, {id:'unmapped', path:'/unmapped', title:'Other', sessionIds:[]}]
  let probes = 0
  actions.reconcileWorkspaceBinding = async () => { probes++; return {changed:false,owned:true} }
  const request = {reconcileWorkspaceBinding:true, expectedServerRevision:runtime.serverRevision}
  await assert.rejects(runtime.syncProjects({...request, expectedServerRevision:'stale'}), {code:'loop-host/conflict'})
  assert.equal(probes, 0)
  const result = await runtime.syncProjects(request)
  assert.equal(result.state, 'ready')
  assert.equal(result.skipped, 2)
  assert.equal(probes, 1)
  assert.equal(prepared.length, 1)
})

test('local rename and directory change keep the channel and Session association', async t => {
  const value = await fixture(t)
  await value.runtime.sessionSyncTarget('old-session')
  value.workspace.title = 'Renamed locally'
  value.workspace.path = join(value.root, 'moved')
  await value.runtime.syncProjects({}, undefined, {background: true})
  const target = await value.runtime.sessionSyncTarget('old-session')
  assert.equal(target.pendingContext.defaultChannelId, 'private-channel')
  assert.equal(value.prepared.length, 1)
})

test('hover reads only local state and never creates bindings or opens authorization', async t => {
  const value = await fixture(t)
  value.actions.syncStatus = async () => { throw new Error('offline') }
  value.runtime.setSessionUploadStatus('old-session', 'failed')
  assert.equal((await value.runtime.syncStatus({workspaceId: value.workspace.id, sessionId: 'old-session'})).state, 'error')
  value.runtime.setSessionUploadStatus('old-session', 'uploading')
  assert.equal((await value.runtime.syncStatus({workspaceId: value.workspace.id, sessionId: 'old-session'})).state, 'pending')
  assert.equal(value.uploaded.length, 0)
  assert.equal(value.prepared.length, 1)
})

test('a successful retry clears stale error state and reads the real remaining queue', async t => {
  const value = await fixture(t)
  await value.runtime.sessionSyncTarget('old-session')
  value.runtime.setSessionUploadStatus('old-session', 'failed')
  assert.equal((await value.runtime.syncStatus({workspaceId: value.workspace.id, sessionId: 'old-session'})).state, 'error')
  value.actions.syncStatus = async () => ({state: 'on', pending: 2, historyPartial: false})
  value.runtime.setSessionUploadStatus('old-session', 'uploaded')
  assert.deepEqual(await value.runtime.syncStatus({workspaceId: value.workspace.id, sessionId: 'old-session'}), {state: 'on', pending: 2, historyPartial: false})
  value.actions.syncStatus = async () => ({state: 'on', pending: 0, historyPartial: false})
  assert.equal((await value.runtime.syncStatus({workspaceId: value.workspace.id, sessionId: 'old-session'})).state, 'on')
  value.runtime.setSessionUploadStatus('old-session', 'failed')
  value.runtime.setSessionUploadStatus('old-session', 'idle')
  assert.equal((await value.runtime.syncStatus({workspaceId: value.workspace.id, sessionId: 'old-session'})).state, 'on')
})

test('manual retry clears its failed cache only after success and reports the real queue', async t => {
  const value = await fixture(t)
  const request = {workspaceId: value.workspace.id, sessionId: 'old-session'}
  await value.runtime.sessionSyncTarget(request.sessionId)
  value.runtime.setSessionUploadStatus(request.sessionId, 'failed')
  assert.equal((await value.runtime.syncStatus(request)).state, 'error')
  value.actions.retrySync = async () => ({state: 'on', pending: 2, historyPartial: false})
  value.actions.syncStatus = async () => ({state: 'pending', pending: 2, historyPartial: false, health: 'pending'})
  assert.deepEqual(await value.runtime.retrySync(request), {state: 'on', pending: 2, historyPartial: false})
  assert.deepEqual(await value.runtime.syncStatus(request), {state: 'pending', pending: 2, historyPartial: false, health: 'pending'})
})


test('background authorization failure leaves local workspaces usable without opening login', async t => {
  const value = await fixture(t)
  value.actions.projectSyncCatalog = async input => {
    assert.equal(input.background, true)
    return {state: 'needs_auth', reason: 'Login is required'}
  }
  const result = await value.runtime.syncProjects({}, undefined, {background: true})
  assert.equal(result.state, 'needs_auth')
  assert.equal(result.challenge, undefined)
  assert.equal(value.workspace.title, 'My work')
  assert.equal(value.workspace.sessionIds.length, 2)
  assert.equal(value.uploaded.length, 0)
})

test('failed Session admission retries on recovery without another user message', async t => {
  const value = await fixture(t)
  let online = false
  let admissions = 0
  value.actions.setSync = async () => {
    admissions++
    if (!online) throw new Error('offline')
    return {state: 'on', pending: 0, historyPartial: false}
  }
  await value.runtime.sessionSyncTarget('old-session')
  online = true
  await value.runtime.sessionSyncTarget('old-session')
  await value.runtime.sessionSyncTarget('old-session')
  assert.equal(admissions, 2)
})

test('repeated authenticated status does not restart history upload or Session admission', async t => {
  const value = await fixture(t)
  await value.runtime.sessionSyncTarget('old-session')
  let profiles = 0
  value.runtime.addServerProfileListener(() => { profiles++ })
  // Every successful helper status/catalog response observes the same account.
  for (let index = 0; index < 3; index++) {
    await value.runtime.setAccountPrincipal('human')
    await value.runtime.syncProjects({}, undefined, {background: true})
    await value.runtime.sessionSyncTarget('old-session')
  }
  assert.equal(profiles, 0, 'do not reset telemetry capture to the start of history')
  assert.equal(value.uploaded.length, 1, 'keep the existing Session admission')
})

test('explicit reconnect of the same account retries upload authorization', async t => {
  const value = await fixture(t)
  await value.runtime.sessionSyncTarget('old-session')
  value.actions.connectAccount = async () => ({state: 'connected', accountPrincipal: 'human', workspaceId: 'loop-workspace'})
  let profiles = 0
  value.runtime.addServerProfileListener(() => { profiles++ })
  await value.runtime.connectAccount({expectedServerRevision: value.runtime.serverRevision})
  await value.runtime.syncProjects({}, undefined, {background: true})
  await value.runtime.sessionSyncTarget('old-session')
  assert.equal(profiles, 1)
  assert.equal(value.uploaded.length, 2)
})

test('logged out hover does not reuse failure or upload state from the previous account', async t => {
  const value = await fixture(t)
  value.runtime.setSessionUploadStatus('old-session', 'failed')
  await value.runtime.setAccountPrincipal('')
  assert.equal((await value.runtime.syncStatus({workspaceId: value.workspace.id, sessionId: 'old-session'})).state, 'off')
})

test('account sign-out freezes every local workspace and survives a pending browser confirmation', async t => {
  const value = await fixture(t)
  await value.runtime.sessionSyncTarget('old-session')
  let confirmed = false, calls = 0
  let invalidated = []
  value.runtime.addSessionInvalidationListener(ids => { invalidated = ids })
  assert.equal(value.runtime.syncCapturePolicy().loggedIn, true)
  value.actions.disconnectAccount = async input => {
    calls++
    assert.equal(input.accountPrincipal, 'human')
    assert.equal(value.runtime.syncCapturePolicy().loggedIn, false, 'stop collecting while sign-out awaits confirmation')
    assert.deepEqual(new Set(invalidated), new Set(['old-session', 'new-session']), 'also fence live events that have not acquired a stored binding')
    assert.equal(await value.runtime.sessionSyncTarget('old-session'), null)
    if (!confirmed) throw Object.assign(new Error('confirmation required'), {
      code: 'loop-host/disconnect-auth-required',
      challenge: {id:'operation',loginUrl:'https://loop.example.test/external-host/disconnect#challenge=confirm',expiresAt:new Date(Date.now()+60000).toISOString()},
    })
  }
  const pending = await value.runtime.disconnectAccount({})
  assert.equal(pending.state, 'needs_confirmation')
  await value.runtime.setAccountPrincipal('human')
  assert.equal(value.runtime.syncCapturePolicy().loggedIn, false, 'an identity refresh cannot unfreeze a pending sign-out')
  assert.equal((await value.runtime.projectSyncSettings({})).disconnectPending, true)
  assert.equal(await value.store.getActiveAccount(server), 'human', 'keep the exact account until revocation is confirmed')
  const prepared = value.prepared.length
  await value.runtime.syncProjects({}, undefined, {background:true})
  assert.equal(value.prepared.length, prepared)
  const restarted = new LoopHostRuntime({store:value.store,actions:value.actions,workspaces:{list:()=>[value.workspace],get:()=>value.workspace},sessions:{get:id=>value.sessions.get(id)},defaultServiceBaseUrl:server})
  await restarted.waitForActions()
  assert.equal(restarted.syncCapturePolicy().loggedIn, false, 'a pending sign-out remains frozen after restart')
  assert.equal(await restarted.sessionSyncTarget('old-session'), null)
  confirmed = true
  assert.equal((await restarted.disconnectAccount({})).state, 'signed_out')
  assert.equal(calls, 2)
  assert.equal(await value.store.getActiveAccount(server), '')
  assert.equal(await value.store.getBinding('human',value.workspace.id,value.workspace.path,server), null)
  assert.equal(value.sessions.size, 2, 'local Harness chats are retained')
  assert.equal((await restarted.projectSyncSettings({})).canDisconnect, false)
})

test('an offline sign-out remains frozen and retryable without starting another login', async t => {
  const value = await fixture(t)
  value.actions.disconnectAccount = async () => { throw Object.assign(new Error('offline'), {code:'loop-host/backend-unavailable'}) }
  await assert.rejects(value.runtime.disconnectAccount({}), /offline/)
  assert.equal((await value.runtime.projectSyncSettings({})).disconnectPending, true)
  assert.equal(await value.runtime.captureSession(value.workspace.id,'new-session'), null)
  assert.equal(await value.runtime.sessionSyncTarget('old-session'), null)
  value.actions.disconnectAccount = async () => ({})
  await value.runtime.disconnectAccount({})
  assert.equal(await value.store.getActiveAccount(server), '')
})

test('account disconnect does not remove another server or another account bindings', async t => {
  const value = await fixture(t)
  const target = await value.store.getBinding('human',value.workspace.id,value.workspace.path,server)
  for (const [account, service] of [['human','https://second.loop.test'],['other',server]]) {
    await value.store.putBinding(account,{workspaceId:value.workspace.id,workspacePath:value.workspace.path,workspaceTitle:'other',expectedRevision:null,target:{...target,loopServiceBaseUrl:service}})
  }
  value.actions.disconnectAccount = async () => ({})
  await value.runtime.disconnectAccount({})
  assert.ok(await value.store.getBinding('human',value.workspace.id,value.workspace.path,'https://second.loop.test'))
  assert.ok(await value.store.getBinding('other',value.workspace.id,value.workspace.path,server))
})

test('a crash after remote completion clears the active account on restart without revoking twice', async t => {
  const value = await fixture(t)
  let revocations=0
  value.actions.disconnectAccount=async()=>{revocations++}
  const setActive=value.store.setActiveAccount.bind(value.store)
  value.store.setActiveAccount=async principal=>{if(principal==='')throw new Error('disk temporarily unavailable');return setActive(principal,server)}
  await assert.rejects(value.runtime.disconnectAccount({}), /disk temporarily unavailable/)
  value.store.setActiveAccount=setActive
  const restarted = new LoopHostRuntime({store:value.store,actions:value.actions,workspaces:{list:()=>[value.workspace],get:()=>value.workspace},sessions:{get:id=>value.sessions.get(id)},defaultServiceBaseUrl:server})
  await restarted.waitForActions()
  assert.equal(await value.store.getActiveAccount(server),'')
  assert.equal(restarted.accountPrincipal,'')
  assert.equal((await restarted.disconnectAccount({})).state,'signed_out')
  assert.equal(revocations,1)
  await restarted.setAccountPrincipal('other')
  // Account changes schedule background work. Drain that owner (including its
  // error persistence) before the fixture removes its private storage.
  await restarted.backgroundProjectSync()
  assert.equal(await value.store.getActiveAccount(server),'other')
  assert.equal(await value.store.getBinding('other',value.workspace.id,value.workspace.path,server),null)
})

test('confirmed reconnection restores the original Session action route without reusing upload consent', async t => {
  const {runtime, store, workspace, actions} = await fixture(t)
  const sessionId = 'old-session'
  const original = await store.getBinding('human', workspace.id, workspace.path, server)
  await runtime.sessionSyncTarget(sessionId)
  let owned = false
  actions.checkWorkspaceBinding = async () => {
    if (!owned) throw new Error('another connection')
    return original
  }
  actions.reconcileWorkspaceBinding = async input => {
    if (owned) return {changed:false, owned:true}
    if (input.expectedGrantId !== 'current-grant') throw new Error('confirmation required')
    if (!input.confirm) return {needsConfirmation:true, expectedRecord:'original'}
    assert.equal(input.expectedRecord, 'original')
    owned = true
    return {changed:true}
  }
  const channel = () => runtime.withSessionContext(sessionId, undefined, context => context.defaultChannelId)
  await assert.rejects(channel(), /another connection/)
  assert.equal((await runtime.syncProjects({})).state, 'partial')
  const request = {reconcileWorkspaceBinding:true, expectedServerRevision:runtime.serverRevision, expectedGrantId:'current-grant'}
  assert.equal((await runtime.syncProjects(request)).updated, 1)
  assert.equal(await channel(), original.defaultChannelId)
  assert.equal(await runtime.sessionSyncTarget(sessionId), null)
  assert.equal((await runtime.syncProjects(request)).updated, 0)
  assert.equal((await store.getSession('human', workspace.id, sessionId)).bindingRevision, original.revision)
  actions.checkWorkspaceBinding = async () => ({...original, defaultChannelId:'different'})
  await assert.rejects(channel(), /cannot be verified/)
  assert.ok((await store.beginAccountDisconnect('human', server, original.loopWorkspaceId)).includes(sessionId))
  await assert.rejects(channel())
})
