import assert from 'node:assert/strict'
import test from 'node:test'
import {createLoopHostActions, normalizePageOrigin, normalizeServiceBaseURL} from '../host-actions-core.mjs'

function fixture(options = {}) {
  const adapters = [], calls = []
  const actions = createLoopHostActions({serviceBaseUrl:'https://first.example',loopWorkspaceId:'wsp_first',syncProfile:'loop-test'}, {
    ...options,
    createHelper(config) {
      const events = new Set(), catalogs = new Set()
      const adapter = {
        config, accountPrincipal:'human-first', disposed:false,
        addEventListener(fn) { events.add(fn); return () => events.delete(fn) },
        addSkillCatalogEventListener(fn) { catalogs.add(fn); return () => catalogs.delete(fn) },
        async request(action, input, signal) {
          calls.push({action,input,signal})
          if (signal?.aborted) throw signal.reason
          if (options.error) throw options.error
          return {state:'connected'}
        },
        emit(event) { for (const fn of events) fn(event) },
        emitCatalog(event) { for (const fn of catalogs) fn(event) },
        async dispose() { adapter.disposed = true },
      }
      adapters.push(adapter)
      return adapter
    },
  })
  return {actions,adapters,calls}
}

test('Host facade requires an explicit native adapter', () => {
  assert.throws(() => createLoopHostActions({}), /native Loop Host adapter/)
})

test('service and page origins reject credentials, public HTTP and path-bearing origins', () => {
  for (const url of ['http://public.example','https://user:password@example.test','https://loop.test?token=secret']) {
    assert.throws(() => normalizeServiceBaseURL(url))
  }
  assert.equal(normalizeServiceBaseURL('http://loop.localhost:1234/'), 'http://loop.localhost:1234')
  assert.equal(normalizePageOrigin('dsh-app://app/'), 'dsh-app://app')
  assert.equal(normalizePageOrigin('dsh-app://app'), 'dsh-app://app')
  assert.throws(() => normalizePageOrigin('dsh-app://app/path'))
  assert.throws(() => normalizePageOrigin('https://loop.test/path'))
})

test('native facade preserves errors and cancellation without broadening a request', async t => {
  const denied = Object.assign(new Error('resource permission denied'), {code:'loop-host/forbidden'})
  const f=fixture({error:denied});t.after(()=>f.actions.dispose())
  const input={sessionId:'session',name:'project.get',arguments:{projectId:'exact'}}
  await assert.rejects(f.actions.agentAction(input), error => error === denied)
  assert.deepEqual(f.calls[0],{action:'agentAction',input,signal:undefined})
  const cancelled=AbortSignal.abort(new Error('cancelled'))
  await assert.rejects(f.actions.agentAction(input,cancelled), error => error === cancelled.reason)
})

test('server and workspace cutover clears the principal and isolates old catalog events', async t => {
  const f=fixture();t.after(()=>f.actions.dispose())
  const events=[],catalogs=[]
  f.actions.addCollaborationEventListener(event=>events.push(event))
  f.actions.addSkillCatalogEventListener(event=>catalogs.push(event))
  await f.actions.setServiceBaseUrl('https://second.example','wsp_second')
  assert.equal(f.adapters[0].disposed,true)
  assert.equal(f.actions.currentAccountPrincipal(),'')
  assert.equal(f.actions.currentLoopWorkspaceId(),'wsp_second')
  assert.notEqual(f.actions.currentSyncProfile(),'loop-test')
  f.adapters[0].emit('stale');f.adapters[0].emitCatalog('stale')
  f.adapters[1].emit('new');f.adapters[1].emitCatalog('new')
  assert.deepEqual(events,['new']);assert.deepEqual(catalogs,['new'])
  await f.actions.setServiceBaseUrl('https://second.example','wsp_second')
  assert.equal(f.adapters.length,2)
  await assert.rejects(f.actions.setServiceBaseUrl('https://second.example','../escape'),{code:'loop-host/invalid-request'})
})

test('page launch uses the authenticated native adapter and never probes a separate login', async t => {
  const f=fixture({fetch:()=>assert.fail('unexpected anonymous probe')});t.after(()=>f.actions.dispose())
  await f.actions.openGlobalPage()
  assert.deepEqual(f.calls,[{action:'openGlobalPage',input:{},signal:undefined}])
})

test('explicit page probe preserves a deployment prefix and forbids redirects', async t => {
  const seen=[]
  const f=fixture({fetch:async(url,options)=>{seen.push({url:String(url),options});return new Response('',{status:200})}})
  t.after(()=>f.actions.dispose())
  const page=await f.actions.probeGlobalPage('https://loop.test/deployment')
  assert.equal(seen[0].url,'https://loop.test/deployment/api/v1/public/config')
  assert.equal(seen[0].options.redirect,'error')
  assert.equal(new URLSearchParams(new URL(page.url).hash.slice(1)).get('next'),'/deployment/workspaces')
})
