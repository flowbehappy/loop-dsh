import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'

import type {ModelCatalog} from '@deepseek-ai/dsh-api-session-controller/types'
import type {HostObservable, StandardSourceBinding} from '@deepseek-ai/dsh-client-ui-slots'
import {
  loopModelPickerID,
  loopModelRouteFromDigest,
  loopModelRouteInput,
} from '../../../model-identity.mjs'
import {
  LoopModelController,
  modelReadinessScopeKey,
  resolveModelReadiness,
} from '../model-controller.ts'
import type {LoopHostClient, LoopModelStatus} from '../types.ts'

function route(workspaceId: string, connectionId: string): string {
  return loopModelRouteFromDigest(createHash('sha256')
    .update(loopModelRouteInput(workspaceId, connectionId))
    .digest('hex'))
}

function observable<T>(value: T): HostObservable<T> {
  return {
    getSnapshot: () => value,
    subscribe: () => () => {},
  }
}

function remote(overrides: Partial<LoopHostClient>): LoopHostClient {
  return {
    status: async () => { throw new Error('not used') },
    beginBind: async () => { throw new Error('not used') },
    completeBind: async () => { throw new Error('not used') },
    unbind: async () => { throw new Error('not used') },
    sessionContext: async () => { throw new Error('not used') },
    syncStatus: async () => { throw new Error('not used') },
    setSync: async () => { throw new Error('not used') },
    ...overrides,
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 80; index += 1) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  assert.fail('condition did not settle')
}

const model = {
  id: 'model-a',
  name: 'Model A',
  source: 'loop_proxy' as const,
  providerId: 'provider-a',
  providerName: 'Provider A',
  wireApi: 'openai-completions' as const,
}
const providerId = route('wsp_alpha', 'eag_alpha')
const pickerId = loopModelPickerID(model)
const status: LoopModelStatus = {
  state: 'active',
  accountPrincipal: 'hum_alpha',
  connections: [{
    connectionId: 'eag_alpha',
    workspaceId: 'wsp_alpha',
    providerName: 'Loop · Alpha',
    models: [model],
    status: 'active',
    updatedAt: '2026-11-09T00:00:00Z',
  }],
}
const catalog: ModelCatalog = {
  default: {provider: providerId, model: pickerId},
  routableProviders: [providerId],
  groups: [{id: providerId, name: 'Loop · Alpha', models: [{id: pickerId, name: 'Model A'}]}],
  failures: [],
}
const scope = {
  serverUrl: 'https://loop.synthetic.test/',
  serverRevision: 'rev-alpha',
  workspaceId: 'wsp_alpha',
  sharedWorkspaceId: null as string | null,
  sharedPrincipalId: null as string | null,
  authEpoch: null as string | null,
}
const requested = {
  sessionId: null,
  scope: 'new-session' as const,
  basis: 'default' as const,
  selection: catalog.default,
  projectionReady: true,
}

test('Host accountPrincipal stays ready without a shared management-page identity', async () => {
  const page = observable({
    serverUrl: scope.serverUrl,
    serverRevision: scope.serverRevision,
    loopWorkspaceId: scope.workspaceId,
  })
  const sharedData = observable({identity: null})
  const controller = new LoopModelController({
    remote: remote({modelStatus: async () => ({ok: true, value: status})}),
    loadModelCatalog: async () => ({ok: true, value: catalog}),
    scopeSources: {globalPage: page, sharedData},
  })
  controller.start(observable<StandardSourceBinding>({
    key: undefined,
    hooks: {},
    keyedHooks: {},
    props: {},
  }))
  await controller.open()
  await waitFor(() => controller.store.getSnapshot().readiness.kind === 'loop-ready')
  assert.deepEqual(controller.store.getSnapshot().readiness, {
    kind: 'loop-ready',
    scopeKey: modelReadinessScopeKey(scope, status),
    sessionId: null,
    selectionScope: 'new-session',
    selectionBasis: 'default',
    connectionId: 'eag_alpha',
    workspaceId: 'wsp_alpha',
    providerId,
    modelId: pickerId,
  })
})

test('a present shared identity must agree with the Host model account', async () => {
  const readiness = await resolveModelReadiness({
    status,
    catalog,
    requested,
    scope: {
      ...scope,
      sharedWorkspaceId: 'wsp_alpha',
      sharedPrincipalId: 'hum_other',
      authEpoch: 'epoch-other',
    },
    routeForConnection: async (workspaceId, connectionId) => route(workspaceId, connectionId),
    statusFailure: null,
  })
  assert.equal(readiness.kind, 'scope-required')
  if (readiness.kind !== 'scope-required') assert.fail('scope required')
  assert.equal(readiness.reason, 'account')
  assert.deepEqual(readiness.choices, [])
})

test('an existing exact external Key is ready without Loop configuration', async () => {
  const externalCatalog: ModelCatalog = {
    default: {provider: 'external-key', model: 'external-model'},
    routableProviders: ['external-key'],
    groups: [{
      id: 'external-key',
      name: 'External key',
      models: [{id: 'external-model', name: 'External model'}],
    }],
    failures: [],
  }
  const readiness = await resolveModelReadiness({
    status: null,
    catalog: externalCatalog,
    requested: {...requested, selection: externalCatalog.default},
    scope: {
      serverUrl: null,
      serverRevision: '',
      workspaceId: null,
      sharedWorkspaceId: null,
      sharedPrincipalId: null,
      authEpoch: null,
    },
    routeForConnection: async (workspaceId, connectionId) => route(workspaceId, connectionId),
    statusFailure: {code: 'loop-host/needs-auth', message: ''},
  })
  assert.equal(readiness.kind, 'external-ready')
})

test('model status settles before the provider catalog is read', async () => {
  let statusSettled = false
  let catalogCalls = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const controller = new LoopModelController({
    remote: remote({
      modelStatus: async () => {
        await gate
        statusSettled = true
        return {ok: true, value: status}
      },
    }),
    loadModelCatalog: async () => {
      catalogCalls += 1
      if (catalogCalls === 1) {
        return {
          ok: true,
          value: {
            ...catalog,
            default: {provider: 'external-unconfigured', model: 'missing'},
            routableProviders: [],
            groups: [],
          },
        }
      }
      assert.equal(statusSettled, true)
      return {ok: true, value: catalog}
    },
    scopeSources: {
      globalPage: observable({
        serverUrl: scope.serverUrl,
        serverRevision: scope.serverRevision,
        loopWorkspaceId: scope.workspaceId,
      }),
      sharedData: observable({identity: null}),
    },
  })
  const pending = controller.open()
  await waitFor(() => controller.store.getSnapshot().busy === 'read')
  release()
  await pending
  assert.equal(statusSettled, true)
  assert.equal(catalogCalls, 2)
})

test('an exact external Key becomes ready while Loop modelStatus is still pending', async () => {
  const externalCatalog: ModelCatalog = {
    default: {provider: 'external-key', model: 'external-model'},
    routableProviders: ['external-key'],
    groups: [{
      id: 'external-key',
      name: 'External key',
      models: [{id: 'external-model', name: 'External model'}],
    }],
    failures: [],
  }
  let releaseStatus!: () => void
  const statusGate = new Promise<void>(resolve => { releaseStatus = resolve })
  let statusCalls = 0
  let catalogCalls = 0
  const controller = new LoopModelController({
    remote: remote({
      modelStatus: async () => {
        statusCalls += 1
        await statusGate
        return {ok: false, error: {code: 'loop-host/timeout', message: ''}}
      },
    }),
    loadModelCatalog: async () => {
      catalogCalls += 1
      return {ok: true, value: externalCatalog}
    },
    scopeSources: {
      globalPage: observable({
        serverUrl: null,
        serverRevision: '',
        loopWorkspaceId: null,
      }),
      sharedData: observable({identity: null}),
    },
  })
  controller.start(observable<StandardSourceBinding>({
    key: undefined,
    hooks: {},
    keyedHooks: {},
    props: {},
  }))

  await controller.open()

  assert.equal(catalogCalls, 1)
  assert.equal(statusCalls, 1)
  assert.equal(controller.store.getSnapshot().readiness.kind, 'external-ready')
  releaseStatus()
  controller.dispose()
})

test('a late external catalog result after cancel cannot complete', async () => {
  let catalogStarted = false
  let releaseCatalog!: () => void
  const catalogGate = new Promise<void>(resolve => { releaseCatalog = resolve })
  const controller = new LoopModelController({
    remote: remote({
      modelStatus: async () => ({
        ok: false,
        error: {code: 'loop-host/needs-auth', message: ''},
      }),
    }),
    loadModelCatalog: async () => {
      catalogStarted = true
      await catalogGate
      return {
        ok: true,
        value: {
          default: {provider: 'external-key', model: 'external-model'},
          routableProviders: ['external-key'],
          groups: [{
            id: 'external-key',
            name: 'External key',
            models: [{id: 'external-model', name: 'External model'}],
          }],
          failures: [],
        },
      }
    },
  })
  controller.start(observable<StandardSourceBinding>({
    key: undefined,
    hooks: {},
    keyedHooks: {},
    props: {},
  }))

  const pending = controller.open()
  await waitFor(() => catalogStarted)
  controller.actions.suspend()
  releaseCatalog()
  await pending
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.deepEqual(controller.store.getSnapshot().readiness, {kind: 'loading'})
  controller.dispose()
})

test('cancel before the catalog read starts sends no later modelCatalog RPC', async () => {
  let catalogCalls = 0
  const controller = new LoopModelController({
    remote: remote({
      modelStatus: async () => ({
        ok: false,
        error: {code: 'loop-host/needs-auth', message: ''},
      }),
    }),
    loadModelCatalog: async () => {
      catalogCalls += 1
      return {ok: false, error: {code: 'loop/transport', message: ''}}
    },
  })
  controller.start(observable<StandardSourceBinding>({
    key: undefined,
    hooks: {},
    keyedHooks: {},
    props: {},
  }))

  const pending = controller.open()
  controller.actions.suspend()
  await pending
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.equal(catalogCalls, 0)
  assert.deepEqual(controller.store.getSnapshot().readiness, {kind: 'loading'})
  controller.dispose()
})

test('the catalog deadline bounds a Host call that ignores cancellation', async () => {
  const controller = new LoopModelController({
    remote: remote({
      modelStatus: async () => ({
        ok: false,
        error: {code: 'loop-host/needs-auth', message: ''},
      }),
    }),
    loadModelCatalog: () => new Promise(() => {}),
    catalogReadTimeoutMs: 5,
  })
  controller.start(observable<StandardSourceBinding>({
    key: undefined,
    hooks: {},
    keyedHooks: {},
    props: {},
  }))

  const result = await Promise.race([
    controller.open().then(() => 'settled' as const),
    new Promise<'timeout'>(resolve => {
      setTimeout(() => { resolve('timeout') }, 100)
    }),
  ])

  assert.equal(result, 'settled')
  assert.equal(controller.store.getSnapshot().readiness.kind, 'catalog-unavailable')
  controller.dispose()
})

test('a shared-page account epoch change fences a late Host model response', async () => {
  const page = observable({
    serverUrl: scope.serverUrl,
    serverRevision: scope.serverRevision,
    loopWorkspaceId: scope.workspaceId,
  })
  let identity = {
    workspaceId: 'wsp_alpha',
    principalId: 'hum_alpha',
    authEpoch: 'epoch-alpha',
  }
  const listeners = new Set<() => void>()
  const sharedData: HostObservable<{identity: typeof identity}> & {
    setIdentity(value: typeof identity): void
  } = {
    getSnapshot: () => ({identity}),
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    setIdentity(value) {
      identity = value
      for (const listener of listeners) listener()
    },
  }
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const controller = new LoopModelController({
    remote: remote({
      modelStatus: async () => {
        await gate
        return {ok: true, value: status}
      },
    }),
    loadModelCatalog: async () => ({ok: true, value: catalog}),
    scopeSources: {globalPage: page, sharedData},
  })
  controller.start(observable<StandardSourceBinding>({
    key: undefined,
    hooks: {},
    keyedHooks: {},
    props: {},
  }))
  const pending = controller.open()
  await waitFor(() => controller.store.getSnapshot().busy === 'read')
  sharedData.setIdentity({
    workspaceId: 'wsp_alpha',
    principalId: 'hum_alpha',
    authEpoch: 'epoch-next',
  })
  release()
  await pending
  assert.deepEqual(controller.store.getSnapshot().readiness, {kind: 'loading'})
})
