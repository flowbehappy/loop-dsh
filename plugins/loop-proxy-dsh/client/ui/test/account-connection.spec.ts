// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest'
import {AccountConnectionController} from '../account-connection-controller.ts'
import {createSnapshotStore} from '../store.ts'
import {INITIAL_GLOBAL_PAGE_STATE, type LoopGlobalPageController} from '../global-page-controller.ts'
import {INITIAL_MODEL_STATE, type LoopModelController} from '../model-controller.ts'
import type {LoopHostClient} from '../types.ts'

const identity = {workspaceId:'wsp_a',principalId:'usr_a',authEpoch:'epoch-a'}
function harness(connect = vi.fn()) {
 const page = {store:createSnapshotStore({...INITIAL_GLOBAL_PAGE_STATE,serverUrl:'https://loop.test',serverRevision:'rev_a',loopWorkspaceId:'wsp_a'}),
  sharedData:{store:createSnapshotStore<{identity:typeof identity|null}>({identity:null})},
  openAuthorization:vi.fn(()=>true), reconnect:vi.fn(async()=>{}),openModule:vi.fn(async()=>{})}
 const models = {store:createSnapshotStore(INITIAL_MODEL_STATE),open:vi.fn(async()=>{}),actions:{select:vi.fn()},ensureSelection:vi.fn()}
 const controller = new AccountConnectionController({connectAccount:connect} as unknown as LoopHostClient,
  page as unknown as LoopGlobalPageController, models as unknown as LoopModelController,()=> 'en', page.openAuthorization)
 return {page,models,controller,connect}
}
afterEach(()=>vi.useRealTimers())
const flush = async()=>{for(let i=0;i<8;i++) await Promise.resolve()}

it('waits for login, opens one consent and automatically saves an available Loop model',async()=>{
 vi.useFakeTimers()
 const h=harness(vi.fn().mockResolvedValueOnce({ok:true,value:{state:'needs_auth',challenge:{id:'challenge-a',loginUrl:'https://loop.test/oauth/host/authorize',expiresAt:'2099-01-01'}}})
  .mockResolvedValue({ok:true,value:{state:'connected',accountPrincipal:'usr_a'}}))
 h.controller.start();expect(h.connect).toHaveBeenCalledOnce()
 h.page.sharedData.store.set({identity});await flush()
 expect(h.page.openAuthorization).toHaveBeenCalledTimes(1)
 await vi.advanceTimersByTimeAsync(800)
 expect(h.connect).toHaveBeenLastCalledWith({expectedServerRevision:'rev_a',locale:'en'},expect.any(AbortSignal))
 const choice={kind:'loop',providerId:'loop-a',modelId:'model-a'} as const
 h.models.store.set({...INITIAL_MODEL_STATE,readiness:{kind:'selection-required',scopeKey:'scope',choices:[choice]}} as never)
 expect(h.models.ensureSelection).toHaveBeenCalled()
 h.models.store.set({...h.models.store.getSnapshot()})
 expect(h.models.actions.select).not.toHaveBeenCalled()
 h.models.store.set({...INITIAL_MODEL_STATE,readiness:{kind:'loop-ready'}} as never)
 expect(h.controller.store.getSnapshot().phase).toBe('ready');h.controller.dispose()
})

it('preserves an already valid model selection and reports no available models honestly',async()=>{
 for (const kind of ['external-ready','no-models'] as const) {
  const h=harness(vi.fn().mockResolvedValue({ok:true,value:{state:'connected',accountPrincipal:'usr_a'}}))
  h.page.sharedData.store.set({identity});h.controller.start();await flush()
  h.models.store.set({...INITIAL_MODEL_STATE,readiness:{kind}} as never)
  expect(h.models.actions.select).not.toHaveBeenCalled()
  expect(h.controller.store.getSnapshot().phase).toBe('ready')
  h.controller.dispose()
 }
})

it('ignores an old response after the configured server changes',async()=>{
 let resolve!:(value:unknown)=>void
 const h=harness(vi.fn(()=>new Promise(r=>{resolve=r})))
 h.page.sharedData.store.set({identity});h.controller.start()
 h.page.store.set({...h.page.store.getSnapshot(),serverRevision:'rev_other'})
 resolve({ok:true,value:{state:'needs_auth',challenge:{id:'old',loginUrl:'https://loop.test/oauth/host/authorize'}}});await flush()
 expect(h.page.openAuthorization).not.toHaveBeenCalled()
 expect(h.controller.store.getSnapshot().error?.code).toBe('loop-host/conflict')
 h.controller.dispose()
})

it('cancellation is visible and a retry starts a fresh request',async()=>{
 const h=harness(vi.fn().mockResolvedValueOnce({ok:false,error:{code:'loop-host/needs-auth',message:'Cancelled'}}).mockResolvedValue({ok:true,value:{state:'connected',accountPrincipal:'usr_a'}}))
 h.page.sharedData.store.set({identity});h.controller.start();await flush()
 expect(h.controller.store.getSnapshot().phase).toBe('error')
 h.controller.start();await flush();expect(h.connect).toHaveBeenCalledTimes(2)
 h.controller.dispose()
})

it('waits for page reconnection before treating an aborted old model read as a failure',async()=>{
 const h=harness(vi.fn().mockResolvedValue({ok:true,value:{state:'connected',accountPrincipal:'usr_a'}}))
 h.page.reconnect.mockImplementation(async()=>{
  h.models.store.set({...INITIAL_MODEL_STATE,error:{code:'loop/transport',message:''},readiness:{kind:'catalog-unavailable',error:{code:'loop/transport',message:''}}})
  expect(h.controller.store.getSnapshot().phase).not.toBe('error')
 })
 h.models.open.mockImplementation(async()=>{
  h.models.store.set({...INITIAL_MODEL_STATE,readiness:{kind:'loop-ready'}} as never)
 })
 h.page.sharedData.store.set({identity});h.controller.start();await flush()
 expect(h.controller.store.getSnapshot().phase).toBe('ready')
 h.controller.dispose()
})

it('lets the native default catalog reset settle and bounds retries when the catalog stays offline',async()=>{
 vi.useFakeTimers()
 for (const recovers of [true,false]) {
  const h=harness(vi.fn().mockResolvedValue({ok:true,value:{state:'connected',accountPrincipal:'usr_a'}}))
  h.page.sharedData.store.set({identity});h.controller.start();await flush()
  h.models.store.set({...INITIAL_MODEL_STATE,readiness:{kind:'catalog-unavailable',error:{code:'loop/transport',message:''}}})
  expect(h.controller.store.getSnapshot().phase).toBe('ready')
  if (recovers) h.models.open.mockImplementation(async()=>{
   h.models.store.set({...INITIAL_MODEL_STATE,readiness:{kind:'loop-ready'}} as never)
  })
  await vi.advanceTimersByTimeAsync(2000)
  expect(h.controller.store.getSnapshot().phase).toBe('ready')
  expect(h.models.open.mock.calls.length).toBeLessThanOrEqual(4)
  h.controller.dispose()
 }
})

it('requires an explicit recovery click and never repeats it when polling authorization', async()=>{
 vi.useFakeTimers()
 const h=harness(vi.fn()
  .mockResolvedValueOnce({ok:false,error:{code:'loop-host/credential-unavailable',message:''}})
  .mockResolvedValue({ok:true,value:{state:'needs_auth',challenge:{id:'new',loginUrl:'https://loop.test/oauth/host/authorize'}}}))
 h.page.sharedData.store.set({identity});h.controller.start();await flush()
 expect(h.connect.mock.calls[0][0].recoverCredentials).toBeUndefined()
 await vi.advanceTimersByTimeAsync(1600);expect(h.connect).toHaveBeenCalledTimes(1)
 h.controller.recover();await flush()
 expect(h.connect.mock.calls[1][0].recoverCredentials).toBe(true)
 await vi.advanceTimersByTimeAsync(800)
 expect(h.connect.mock.calls[2][0].recoverCredentials).toBeUndefined()
 h.controller.dispose()
})

it('aborts credential recovery and ignores its stale response when cancelled or account changes', async()=>{
 for (const changed of [false,true]) {
  let resolve!: (value:unknown)=>void
  const h=harness(vi.fn().mockResolvedValueOnce({ok:false,error:{code:'loop-host/credential-unavailable',message:''}})
   .mockImplementation(()=>new Promise(r=>{resolve=r})))
  h.page.sharedData.store.set({identity});h.controller.start();await flush();h.controller.recover()
  expect(h.controller.store.getSnapshot().phase).toBe('recovering')
  const signal=h.connect.mock.calls[1][1] as AbortSignal
  if(changed) h.page.store.set({...h.page.store.getSnapshot(),serverRevision:'rev_other'})
  else h.controller.cancelRecovery()
  expect(signal.aborted).toBe(true)
  resolve({ok:true,value:{state:'connected',accountPrincipal:'usr_a'}});await flush()
  expect(h.models.open).not.toHaveBeenCalled()
  expect(h.controller.store.getSnapshot().phase).toBe('error')
  h.controller.dispose()
 }
})

it('does not publish a late login response after sign-out', async () => {
 let finish!: (value: unknown) => void
 const h = harness(vi.fn(() => new Promise(resolve => { finish = resolve })))
 h.controller.start()
 h.controller.reset()
 finish({ok:true,value:{state:'connected',accountPrincipal:'usr_a'}})
 await flush()
 expect(h.page.reconnect).not.toHaveBeenCalled()
 expect(h.models.open).not.toHaveBeenCalled()
 expect(h.controller.store.getSnapshot()).toEqual({phase:'idle',error:null})
 h.controller.dispose()
})

it('finishes login while the page and model catalog are still loading', async () => {
 const h = harness(vi.fn().mockResolvedValue({ok:true,value:{state:'connected',accountPrincipal:'usr_a'}}))
 h.page.reconnect.mockImplementation(() => new Promise(() => {}))
 h.models.open.mockImplementation(() => new Promise(() => {}))
 h.controller.start(); await flush()
 expect(h.controller.store.getSnapshot()).toEqual({phase:'ready',error:null})
 expect(h.page.reconnect).toHaveBeenCalledOnce()
 expect(h.models.open).toHaveBeenCalledOnce()
 h.controller.dispose()
})
