import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'

import type {
  ModelCatalog,
  ModelSelectionProjection,
} from '@deepseek-ai/dsh-api-session-controller/types'
import type {
  HostObservable,
  StandardSourceBinding,
} from '@deepseek-ai/dsh-client-ui-slots'
import {
  loopModelPickerID,
  loopModelRouteFromDigest,
  loopModelRouteInput,
} from '../../../model-identity.mjs'
import {
  LoopModelController,
  modelReadinessScopeKey,
  resolveModelReadiness,
  resolveSelectedModel,
} from '../model-controller.ts'
import type {LoopHostClient, LoopModelStatus} from '../types.ts'

function remote(overrides: Partial<LoopHostClient> = {}): LoopHostClient {
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

function route(workspaceId: string, connectionId: string): string {
  return loopModelRouteFromDigest(createHash('sha256')
    .update(loopModelRouteInput(workspaceId, connectionId))
    .digest('hex'))
}

const organizationModel = {
  id: 'model-a',
  name: 'Model A',
  source: 'loop_proxy' as const,
  providerId: 'provider-a',
  providerName: 'Provider A',
  wireApi: 'openai-completions' as const,
}
const personalModel = {
  ...organizationModel,
  source: 'loop_personal' as const,
}
const organizationRoute = route('wsp_alpha', 'eag_alpha')
const personalRoute = route('wsp_alpha', 'eag_personal')
const organizationPicker = loopModelPickerID(organizationModel)
const personalPicker = loopModelPickerID(personalModel)

const active: LoopModelStatus = {
  state: 'active',
  accountPrincipal: 'hum_alpha',
  connections: [{
    connectionId: 'eag_alpha',
    workspaceId: 'wsp_alpha',
    providerName: 'Loop · Alpha',
    models: [organizationModel],
    status: 'active',
    updatedAt: '2026-11-08T00:00:00Z',
  }],
}

const catalog: ModelCatalog = {
  default: {provider: organizationRoute, model: organizationPicker},
  routableProviders: [organizationRoute],
  groups: [{
    id: organizationRoute,
    name: 'Loop · Alpha',
    models: [{
      id: organizationPicker,
      name: 'Model A',
    }],
  }],
  failures: [],
}

const scope = {
  serverUrl: 'https://loop.synthetic.test/',
  serverRevision: 'rev-alpha',
  workspaceId: 'wsp_alpha',
  sharedWorkspaceId: 'wsp_alpha' as string | null,
  sharedPrincipalId: 'hum_alpha',
  authEpoch: 'epoch-alpha',
}
function requested(
  selection = catalog.default,
  overrides: Partial<{
    sessionId: string | null
    scope: 'active-session' | 'new-session'
    basis: 'next' | 'lastUsed' | 'default'
    projectionReady: boolean
  }> = {},
) {
  return {
    sessionId: null,
    scope: 'new-session' as const,
    basis: 'default' as const,
    selection,
    projectionReady: true,
    ...overrides,
  }
}

function scopeSources(initial = scope) {
  const page = observable({
    serverUrl: initial.serverUrl,
    serverRevision: initial.serverRevision,
    loopWorkspaceId: initial.workspaceId,
  })
  const sharedData = observable({
    identity: initial.sharedWorkspaceId === null ||
      initial.sharedPrincipalId === null ||
      initial.authEpoch === null
      ? null
      : {
          workspaceId: initial.sharedWorkspaceId,
          principalId: initial.sharedPrincipalId,
          authEpoch: initial.authEpoch,
        },
  })
  return {page, sharedData, sources: {globalPage: page, sharedData}}
}

function observable<T>(initial: T): HostObservable<T> & {set(value: T): void} {
  let value = initial
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set(next) {
      value = next
      for (const listener of listeners) listener()
    },
  }
}

function catalogEvents(): {
  readonly subscribe: (
    listener: (event: 'refresh' | 'reset') => void,
  ) => () => void
  emit(event: 'refresh' | 'reset'): void
} {
  let listener: ((event: 'refresh' | 'reset') => void) | undefined
  return {
    subscribe: next => {
      listener = next
      return () => {
        if (listener === next) listener = undefined
      }
    },
    emit: event => { listener?.(event) },
  }
}

function sessionBinding(
  sessionId: string,
  initial: ModelSelectionProjection,
): {
  readonly binding: StandardSourceBinding
  readonly set: (selection: ModelSelectionProjection) => void
} {
  const projection = observable(initial)
  return {
    binding: {
      key: sessionId,
      hooks: {},
      keyedHooks: {
        projection: key => key === 'modelSelection' ? projection : undefined,
      },
      props: {},
    },
    set: selection => { projection.set(selection) },
  }
}

function noSessionBinding(): HostObservable<StandardSourceBinding> {
  return observable({key: undefined, hooks: {}, keyedHooks: {}, props: {}})
}
test('no active Session exposes the new-session default from the real picker identity', async () => {
  const activeSession = noSessionBinding()
  const scopes = scopeSources()
  const controller = new LoopModelController({
    remote: remote({modelStatus: async () => ({ok: true, value: active})}),
    loadModelCatalog: async () => ({ok: true, value: catalog}),
    scopeSources: scopes.sources,
  })
  controller.start(activeSession)
  await controller.open()
  await waitFor(() => controller.store.getSnapshot().selection !== null &&
    controller.store.getSnapshot().readiness.kind === 'loop-ready')

  const selection = controller.store.getSnapshot().selection
  assert.equal(selection?.scope, 'new-session')
  assert.equal(selection?.basis, 'default')
  assert.equal(selection?.providerId, organizationRoute)
  assert.equal(selection?.modelId, organizationPicker)
  assert.equal(selection?.source, 'loop_proxy')
  assert.equal(selection?.billing, 'organization')
  assert.deepEqual(controller.store.getSnapshot().readiness, {
    kind: 'loop-ready',
    scopeKey: modelReadinessScopeKey(scope, active),
    sessionId: null,
    selectionScope: 'new-session',
    selectionBasis: 'default',
    connectionId: 'eag_alpha',
    workspaceId: 'wsp_alpha',
    providerId: organizationRoute,
    modelId: organizationPicker,
  })
})

test('no-Session readiness requires the full active connection plus catalog intersection', async () => {
  const zeroModels: LoopModelStatus = {
    state: 'active',
    accountPrincipal: active.accountPrincipal,
    connections: [{
      ...active.connections[0]!,
      models: [],
    }],
  }
  const readiness = (status: LoopModelStatus | null, currentCatalog: ModelCatalog | null) =>
    resolveModelReadiness({
      status,
      catalog: currentCatalog,
      requested: requested(),
      scope,
      routeForConnection: async (workspaceId, connectionId) => route(workspaceId, connectionId),
      statusFailure: null,
    })
  assert.deepEqual(
    await readiness(zeroModels, catalog),
    {kind: 'no-models', reason: ''},
  )

  assert.deepEqual(
    await readiness(active, {
      ...catalog,
      groups: [],
      routableProviders: [],
    }),
    {kind: 'route-missing', reason: ''},
  )

  assert.deepEqual(
    await readiness(active, catalog),
    {
      kind: 'loop-ready',
      scopeKey: modelReadinessScopeKey(scope, active),
      sessionId: null,
      selectionScope: 'new-session',
      selectionBasis: 'default',
      connectionId: 'eag_alpha',
      workspaceId: 'wsp_alpha',
      providerId: organizationRoute,
      modelId: organizationPicker,
    },
  )

  assert.deepEqual(
    await readiness(active, null),
    {kind: 'catalog-unavailable', error: null},
  )
  assert.deepEqual(
    await readiness({state: 'needs_auth', connections: []}, catalog),
    {kind: 'needs-auth', reason: ''},
  )
})

test('an invalid default or another-workspace connection is never treated as ready', async () => {
  const invalidDefault = {
    ...catalog,
    default: {provider: organizationRoute, model: 'removed-model'},
  }
  const selectionRequired = await resolveModelReadiness({
    status: active,
    catalog: invalidDefault,
    requested: requested(invalidDefault.default),
    scope,
    routeForConnection: async (workspaceId, connectionId) => route(workspaceId, connectionId),
    statusFailure: null,
  })
  assert.equal(selectionRequired.kind, 'selection-required')
  if (selectionRequired.kind === 'selection-required') {
    assert.equal(selectionRequired.reason, 'invalid-selection')
    assert.deepEqual(selectionRequired.choices, [{
      kind: 'loop',
      connectionId: 'eag_alpha',
      workspaceId: 'wsp_alpha',
      providerId: organizationRoute,
      providerName: 'Loop · Alpha',
      modelId: organizationPicker,
      modelName: 'Model A',
    }])
  }

  assert.deepEqual(await resolveModelReadiness({
    status: active,
    catalog,
    requested: requested(),
    scope: {
      ...scope,
      workspaceId: 'wsp_beta',
      sharedWorkspaceId: 'wsp_beta',
      authEpoch: 'epoch-beta',
    },
    routeForConnection: async (workspaceId, connectionId) => route(workspaceId, connectionId),
    statusFailure: null,
  }), {kind: 'route-missing', reason: ''})
})

test('a no-Session explicit choice is saved through the Host default owner', async () => {
  let currentCatalog: ModelCatalog = {
    ...catalog,
    default: {provider: organizationRoute, model: 'removed-model'},
  }
  const scopes = scopeSources()
  const saved: unknown[] = []
  let sessionSelectCalls = 0
  const controller = new LoopModelController({
    remote: remote({
      modelStatus: async () => ({ok: true, value: active}),
      setDefaultModel: async input => {
        saved.push(input)
        currentCatalog = {
          ...currentCatalog,
          default: {provider: input.provider, model: input.model},
        }
        return {
          ok: true,
          value: {selection: {provider: input.provider, model: input.model}},
        }
      },
    }),
    loadModelCatalog: async () => ({ok: true, value: currentCatalog}),
    scopeSources: scopes.sources,
    selectModel: async () => {
      sessionSelectCalls += 1
      return {ok: true, value: undefined}
    },
  })
  const noSession = noSessionBinding()
  controller.start(noSession)
  await controller.open()
  await waitFor(() => controller.store.getSnapshot().readiness.kind === 'selection-required')
  const readiness = controller.store.getSnapshot().readiness
  assert.equal(readiness.kind, 'selection-required')
  if (readiness.kind !== 'selection-required') assert.fail('selection required')
  controller.actions.select(readiness.choices[0]!)
  await waitFor(() => controller.store.getSnapshot().readiness.kind === 'loop-ready')
  assert.deepEqual(saved, [{
    kind: 'loop',
    provider: organizationRoute,
    model: organizationPicker,
    connectionId: 'eag_alpha',
    workspaceId: 'wsp_alpha',
    expectedServerRevision: 'rev-alpha',
    expectedAccountPrincipal: 'hum_alpha',
  }])
  assert.equal(sessionSelectCalls, 0)
})

test('a failed no-Session default save stays unready and retryable', async () => {
  const scopes = scopeSources()
  const controller = new LoopModelController({
    remote: remote({
      modelStatus: async () => ({ok: true, value: active}),
      setDefaultModel: async () => ({
        ok: false,
        error: {code: 'loop-host/model-default-save', message: ''},
      }),
    }),
    loadModelCatalog: async () => ({
      ok: true,
      value: {...catalog, default: {provider: organizationRoute, model: 'missing'}},
    }),
    scopeSources: scopes.sources,
  })
  controller.start(noSessionBinding())
  await controller.open()
  await waitFor(() => controller.store.getSnapshot().readiness.kind === 'selection-required')
  const readiness = controller.store.getSnapshot().readiness
  if (readiness.kind !== 'selection-required') assert.fail('selection required')
  controller.actions.select(readiness.choices[0]!)
  await waitFor(() => controller.store.getSnapshot().error?.code === 'loop-host/model-default-save')
  assert.equal(controller.store.getSnapshot().readiness.kind, 'selection-required')
})

test('an external default save completes without a second Loop status call', async () => {
  let currentCatalog: ModelCatalog = {
    default: {provider: 'external-key', model: 'missing'},
    routableProviders: ['external-key'],
    groups: [{id: 'external-key', name: 'Key', models: [{id: 'external-model', name: 'Model'}]}],
    failures: [],
  }
  let statusCalls = 0
  let uncertain = true
  const controller = new LoopModelController({
    remote: remote({
      modelStatus: async () => {
        statusCalls++
        assert.equal(statusCalls, 1, 'external selection/recheck must not wait for Loop status')
        return {ok: true, value: {state: 'needs_auth', connections: []}}
      },
      setDefaultModel: async input => {
        currentCatalog = {...currentCatalog, default: {provider: input.provider, model: input.model}}
        return uncertain
          ? {ok: false, error: {code: 'loop-host/model-default-unknown', message: ''}}
          : {ok: true, value: {selection: currentCatalog.default}}
      },
    }),
    loadModelCatalog: async () => ({ok: true, value: currentCatalog}),
  })
  controller.start(noSessionBinding())
  await controller.open()
  await waitFor(() => controller.store.getSnapshot().readiness.kind === 'selection-required')
  let readiness = controller.store.getSnapshot().readiness
  if (readiness.kind !== 'selection-required') assert.fail('selection required')
  controller.actions.select(readiness.choices[0]!)
  await waitFor(() => controller.store.getSnapshot().error?.code === 'loop-host/model-default-unknown')
  await controller.open()
  readiness = controller.store.getSnapshot().readiness
  assert.equal(readiness.kind, 'selection-required', 'live catalog target does not confirm profile persistence')
  if (readiness.kind !== 'selection-required') assert.fail('retry required')
  uncertain = false
  controller.actions.select(readiness.choices[0]!)
  await waitFor(() => controller.store.getSnapshot().readiness.kind === 'external-ready')
  assert.equal(statusCalls, 1)
  controller.dispose()
})

test('a cancelled default save cannot apply its late Host success', async () => {
  let defaultStarted = false
  let releaseDefault!: () => void
  const defaultGate = new Promise<void>(resolve => { releaseDefault = resolve })
  const scopes = scopeSources()
  const controller = new LoopModelController({
    remote: remote({
      modelStatus: async () => ({ok: true, value: active}),
      setDefaultModel: async input => {
        defaultStarted = true
        await defaultGate
        return {
          ok: true,
          value: {selection: {provider: input.provider, model: input.model}},
        }
      },
    }),
    loadModelCatalog: async () => ({
      ok: true,
      value: {...catalog, default: {provider: organizationRoute, model: 'missing'}},
    }),
    scopeSources: scopes.sources,
  })
  controller.start(noSessionBinding())
  await controller.open()
  await waitFor(() => controller.store.getSnapshot().readiness.kind === 'selection-required')
  const readiness = controller.store.getSnapshot().readiness
  if (readiness.kind !== 'selection-required') assert.fail('selection required')

  controller.actions.select(readiness.choices[0]!)
  await waitFor(() => defaultStarted)
  controller.actions.suspend()
  releaseDefault()
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.deepEqual(controller.store.getSnapshot().readiness, {kind: 'loading'})
  assert.equal(controller.store.getSnapshot().error, null)
})

test('a default save bound to the old scope cannot apply after identity changes', async () => {
  let defaultStarted = false
  let releaseDefault!: () => void
  const defaultGate = new Promise<void>(resolve => { releaseDefault = resolve })
  const scopes = scopeSources()
  const controller = new LoopModelController({
    remote: remote({
      modelStatus: async () => ({ok: true, value: active}),
      setDefaultModel: async input => {
        defaultStarted = true
        await defaultGate
        return {
          ok: true,
          value: {selection: {provider: input.provider, model: input.model}},
        }
      },
    }),
    loadModelCatalog: async () => ({
      ok: true,
      value: {...catalog, default: {provider: organizationRoute, model: 'missing'}},
    }),
    scopeSources: scopes.sources,
  })
  controller.start(noSessionBinding())
  await controller.open()
  await waitFor(() => controller.store.getSnapshot().readiness.kind === 'selection-required')
  const readiness = controller.store.getSnapshot().readiness
  if (readiness.kind !== 'selection-required') assert.fail('selection required')

  controller.actions.select(readiness.choices[0]!)
  await waitFor(() => defaultStarted)
  scopes.page.set({
    serverUrl: 'https://loop.other.test/',
    serverRevision: 'rev-other',
    loopWorkspaceId: 'wsp_other',
  })
  releaseDefault()
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.deepEqual(controller.store.getSnapshot().readiness, {kind: 'loading'})
  assert.equal(controller.store.getSnapshot().status, null)
})

test('an active Session explicit choice stays on the Session selection owner', async () => {
  const activeSession = sessionBinding('session-active', {
    next: {provider: organizationRoute, model: 'removed-model'},
    lastUsed: null,
  })
  const scopes = scopeSources()
  const selected: unknown[] = []
  let defaultCalls = 0
  const controller = new LoopModelController({
    remote: remote({
      modelStatus: async () => ({ok: true, value: active}),
      setDefaultModel: async () => {
        defaultCalls += 1
        return {
          ok: true,
          value: {selection: {provider: organizationRoute, model: organizationPicker}},
        }
      },
    }),
    loadModelCatalog: async () => ({ok: true, value: catalog}),
    scopeSources: scopes.sources,
    selectModel: async input => {
      selected.push(input)
      activeSession.set({
        next: {provider: input.choice.providerId, model: input.choice.modelId},
        lastUsed: null,
      })
      return {ok: true, value: undefined}
    },
  })
  controller.start(observable(activeSession.binding))
  await controller.open()
  await waitFor(() => controller.store.getSnapshot().readiness.kind === 'selection-required')
  const readiness = controller.store.getSnapshot().readiness
  if (readiness.kind !== 'selection-required') assert.fail('selection required')
  controller.actions.select(readiness.choices[0]!)
  await waitFor(() => controller.store.getSnapshot().readiness.kind === 'loop-ready')

  assert.deepEqual(selected, [{
    sessionId: 'session-active',
    choice: readiness.choices[0],
  }])
  assert.equal(defaultCalls, 0)
})

test('cancel and scope changes fence delayed readiness success and failure', async () => {
  let releaseStatus!: () => void
  let statusCalled = false
  const statusGate = new Promise<void>(resolve => { releaseStatus = resolve })
  const scopes = scopeSources()
  const controller = new LoopModelController({
    remote: remote({
      modelStatus: async () => {
        statusCalled = true
        await statusGate
        return {ok: true, value: active}
      },
    }),
    loadModelCatalog: async () => ({ok: true, value: catalog}),
    scopeSources: scopes.sources,
  })
  const noSession = noSessionBinding()
  controller.start(noSession)
  const pending = controller.open()
  await waitFor(() => statusCalled)
  controller.actions.suspend()
  releaseStatus()
  await pending
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(controller.store.getSnapshot().readiness, {kind: 'loading'})

  let releaseSecond!: () => void
  let secondStatusCalled = false
  const secondGate = new Promise<void>(resolve => { releaseSecond = resolve })
  const second = new LoopModelController({
    remote: remote({
      modelStatus: async () => {
        secondStatusCalled = true
        await secondGate
        return {ok: true, value: active}
      },
    }),
    loadModelCatalog: async () => ({ok: true, value: catalog}),
    scopeSources: scopes.sources,
  })
  second.start(noSession)
  const secondPending = second.open()
  await waitFor(() => secondStatusCalled)
  scopes.page.set({
    serverUrl: 'https://loop.synthetic.test/',
    serverRevision: 'rev-beta',
    loopWorkspaceId: 'wsp_beta',
  })
  releaseSecond()
  await secondPending
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(second.store.getSnapshot().readiness, {kind: 'loading'})

  let rejectLate!: (error: Error) => void
  let thirdStatusCalled = false
  const lateFailure = new Promise<never>((_resolve, reject) => { rejectLate = reject })
  const third = new LoopModelController({
    remote: remote({
      modelStatus: async () => {
        thirdStatusCalled = true
        return await lateFailure
      },
    }),
    loadModelCatalog: async () => ({ok: true, value: catalog}),
    scopeSources: scopeSources().sources,
  })
  third.start(noSession)
  const thirdPending = third.open()
  await waitFor(() => thirdStatusCalled)
  third.actions.suspend()
  rejectLate(new Error('late failure'))
  await thirdPending
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.deepEqual(third.store.getSnapshot().readiness, {kind: 'loading'})
  assert.equal(third.store.getSnapshot().error, null)
})

test('a Loop status failure still exposes an independently catalogued API-key provider', async () => {
  const controller = new LoopModelController({
    remote: remote({
      modelStatus: async () => ({
        ok: false,
        error: {code: 'loop-host/needs-auth', message: 'Loop is signed out'},
      }),
    }),
    loadModelCatalog: async () => ({
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
    }),
  })

  await controller.open()
  await waitFor(() => controller.store.getSnapshot().readiness.kind === 'external-ready')
  await waitFor(() => controller.store.getSnapshot().error?.code === 'loop-host/needs-auth')

  assert.equal(controller.store.getSnapshot().error?.code, 'loop-host/needs-auth')
  assert.deepEqual(controller.store.getSnapshot().readiness, {
    kind: 'external-ready',
    scopeKey: modelReadinessScopeKey({
      serverUrl: null,
      serverRevision: '',
      workspaceId: null,
      sharedWorkspaceId: null,
      sharedPrincipalId: null,
      authEpoch: null,
    }, null),
    sessionId: null,
    selectionScope: 'new-session',
    selectionBasis: 'default',
    providerId: 'external-key',
    modelId: 'external-model',
  })
})

test('active Session uses projection next before lastUsed and default', async () => {
  const first = sessionBinding('ses_one', {
    next: {provider: organizationRoute, model: organizationPicker},
    lastUsed: null,
  })
  const activeSession = observable(first.binding)
  const scopes = scopeSources()
  const controller = new LoopModelController({
    remote: remote({modelStatus: async () => ({ok: true, value: active})}),
    loadModelCatalog: async () => ({ok: true, value: catalog}),
    scopeSources: scopes.sources,
  })
  controller.start(activeSession)
  await controller.open()
  await waitFor(() => controller.store.getSnapshot().selection?.basis === 'next' &&
    controller.store.getSnapshot().readiness.kind === 'loop-ready')
  assert.equal(controller.store.getSnapshot().selection?.sessionId, 'ses_one')
  const nextReadiness = controller.store.getSnapshot().readiness
  assert.equal(nextReadiness.kind, 'loop-ready')
  if (nextReadiness.kind === 'loop-ready') {
    assert.equal(nextReadiness.selectionScope, 'active-session')
    assert.equal(nextReadiness.selectionBasis, 'next')
    assert.equal(nextReadiness.sessionId, 'ses_one')
  }

  first.set({next: null, lastUsed: null})
  await waitFor(() => controller.store.getSnapshot().selection?.basis === 'default')
  assert.equal(controller.store.getSnapshot().selection?.scope, 'active-session')

  first.set({next: null, lastUsed: {provider: organizationRoute, model: organizationPicker}})
  await waitFor(() => controller.store.getSnapshot().selection?.basis === 'lastUsed')
  assert.equal(controller.store.getSnapshot().selection?.modelId, organizationPicker)
})

test('connection route plus wire/source/provider/model selects the exact same-name model', async () => {
  const multiple: LoopModelStatus = {
    state: 'active',
    connections: [
      {
        ...active.connections[0]!,
        connectionId: 'eag_personal',
        providerName: 'Loop Personal',
        models: [personalModel],
      },
      active.connections[0]!,
    ],
  }
  const selected = await resolveSelectedModel(catalog, multiple, requested(
    {provider: organizationRoute, model: organizationPicker},
    {sessionId: 'ses_one', scope: 'active-session', basis: 'next'},
  ))
  assert.equal(selected.source, 'loop_proxy')
  assert.equal(selected.billing, 'organization')
  assert.equal(selected.providerId, organizationRoute)
  assert.notEqual(organizationPicker, personalPicker)
})

test('unknown route or malformed picker identity stays explicitly unknown', async () => {
  const unknownRoute = await resolveSelectedModel(catalog, active, requested(
    {provider: 'loop-model-missing', model: organizationPicker},
  ))
  assert.equal(unknownRoute.source, 'unknown')
  assert.equal(unknownRoute.billing, 'unknown')

  const malformed = await resolveSelectedModel(catalog, active, requested(
    {provider: organizationRoute, model: 'model-a'},
  ))
  assert.equal(malformed.source, 'unknown')
})

test('removing the selected Loop connection never falls back to another same-name source', async () => {
  const selected = await resolveSelectedModel({
    ...catalog,
    groups: catalog.groups.map(group => ({
      ...group,
      models: [...group.models, {id: personalPicker, name: 'Model A'}],
    })),
    routableProviders: [organizationRoute, personalRoute],
  }, active, requested(
    {provider: personalRoute, model: personalPicker},
    {sessionId: 'ses_one', scope: 'active-session', basis: 'next'},
  ))
  assert.equal(selected.providerId, personalRoute)
  assert.equal(selected.source, 'unknown')
  assert.equal(selected.billing, 'unknown')
})

test('switching active Session prevents an older route result from overwriting the new Session', async () => {
  let releaseOrganization!: () => void
  const organizationGate = new Promise<void>(resolve => { releaseOrganization = resolve })
  const controller = new LoopModelController({
    remote: remote({modelStatus: async () => ({ok: true, value: active})}),
    loadModelCatalog: async () => ({ok: true, value: catalog}),
    routeForConnection: async (workspaceId, connectionId) => {
      if (connectionId === 'eag_alpha') await organizationGate
      return route(workspaceId, connectionId)
    },
  })
  const first = sessionBinding('ses_one', {
    next: {provider: organizationRoute, model: organizationPicker},
    lastUsed: null,
  })
  const second = sessionBinding('ses_two', {
    next: {provider: organizationRoute, model: organizationPicker},
    lastUsed: null,
  })
  const activeSession = observable(first.binding)
  controller.start(activeSession)
  await controller.open()
  await waitFor(() => controller.store.getSnapshot().selectionLoading)
  activeSession.set(second.binding)
  releaseOrganization()
  await waitFor(() => controller.store.getSnapshot().selection?.sessionId === 'ses_two')
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(controller.store.getSnapshot().selection?.sessionId, 'ses_two')
})

test('a refresh failure keeps the last authorized model catalog visible', async () => {
  const controller = new LoopModelController({
    remote: remote({
      modelStatus: async () => ({ok: true, value: active}),
      refreshModelConnections: async () => ({
        ok: false,
        error: {code: 'loop-host/backend-unavailable', message: ''},
      }),
    }),
  })

  await controller.open()
  controller.actions.refresh()
  await waitFor(() => controller.store.getSnapshot().error !== null)

  assert.equal(controller.store.getSnapshot().status?.connections.length, 1)
  assert.equal(controller.store.getSnapshot().error?.code, 'loop-host/backend-unavailable')
})

test('disconnect removes only the selected Loop model connection', async () => {
  const calls: string[] = []
  const controller = new LoopModelController({
    remote: remote({
      modelStatus: async () => ({ok: true, value: active}),
      disconnectModelConnection: async (input, signal) => {
        assert.ok(signal instanceof AbortSignal)
        calls.push(input.connectionId)
        return {ok: true, value: {state: 'needs_auth', connections: []}}
      },
    }),
  })

  await controller.open()
  controller.actions.disconnect('eag_alpha')
  await waitFor(() => controller.store.getSnapshot().busy === null && calls.length === 1)

  assert.deepEqual(calls, ['eag_alpha'])
  assert.deepEqual(controller.store.getSnapshot().status?.connections, [])
  assert.equal(controller.store.getSnapshot().disconnectConnectionId, '')
})

test('a catalog failure recovers once after a forwarded model event without reading Loop status', async () => {
  let fails = true
  let catalogCalls = 0
  let statusCalls = 0
  const events = catalogEvents()
  const controller = new LoopModelController({
    remote: remote({
      modelStatus: async () => {
        statusCalls += 1
        return {ok: true, value: active}
      },
    }),
    loadModelCatalog: async () => {
      catalogCalls += 1
      return fails
        ? {ok: false, error: {code: 'loop/catalog-timeout', message: ''}}
        : {ok: true, value: catalog}
    },
    subscribeCatalogEvents: events.subscribe,
    scopeSources: scopeSources().sources,
  })
  controller.start(noSessionBinding())
  await controller.open()
  await waitFor(() => controller.store.getSnapshot().readiness.kind === 'catalog-unavailable')
  const callsAfterOpen = catalogCalls
  const statusAfterOpen = statusCalls

  fails = false
  events.emit('refresh')
  events.emit('refresh')
  await waitFor(() => controller.store.getSnapshot().readiness.kind === 'loop-ready')

  assert.equal(catalogCalls, callsAfterOpen + 1)
  assert.equal(statusCalls, statusAfterOpen)
  assert.equal(controller.store.getSnapshot().selectionError, null)
})

test('a failed catalog refresh clears the ready authority and keeps the original failure', async () => {
  let fail = false
  let catalogCalls = 0
  const events = catalogEvents()
  const controller = new LoopModelController({
    remote: remote({modelStatus: async () => ({ok: true, value: active})}),
    loadModelCatalog: async () => {
      catalogCalls += 1
      return fail
        ? {ok: false, error: {code: 'loop/catalog-timeout', message: ''}}
        : {ok: true, value: catalog}
    },
    subscribeCatalogEvents: events.subscribe,
    scopeSources: scopeSources().sources,
  })
  controller.start(noSessionBinding())
  await controller.open()
  await waitFor(() => controller.store.getSnapshot().readiness.kind === 'loop-ready')
  const callsBefore = catalogCalls

  fail = true
  events.emit('refresh')
  await waitFor(() => catalogCalls > callsBefore &&
    controller.store.getSnapshot().readiness.kind === 'catalog-unavailable')

  assert.equal(controller.store.getSnapshot().selection, null)
  assert.deepEqual(
    controller.store.getSnapshot().selectionError,
    {code: 'loop/catalog-timeout', message: ''},
  )
})

test('a status failure does not erase the original catalog failure', async () => {
  const catalogFailure = {code: 'loop/catalog-timeout', message: ''}
  const controller = new LoopModelController({
    remote: remote({
      modelStatus: async () => ({
        ok: false,
        error: {code: 'loop-host/backend-unavailable', message: ''},
      }),
    }),
    loadModelCatalog: async () => ({ok: false, error: catalogFailure}),
  })

  await controller.open()
  await waitFor(() => controller.store.getSnapshot().readiness.kind === 'catalog-unavailable')

  assert.equal(controller.store.getSnapshot().selection, null)
  assert.deepEqual(controller.store.getSnapshot().selectionError, catalogFailure)
})

test('a projection update cannot replace a catalog failure with perpetual loading', async () => {
  const session = sessionBinding('ses_catalog_failure', {
    next: {provider: organizationRoute, model: organizationPicker},
    lastUsed: null,
  })
  const failure = {code: 'loop/catalog-timeout', message: ''}
  const controller = new LoopModelController({
    remote: remote({modelStatus: async () => ({ok: true, value: active})}),
    loadModelCatalog: async () => ({ok: false, error: failure}),
    scopeSources: scopeSources().sources,
  })
  controller.start(observable(session.binding))
  await controller.open()
  await waitFor(() => controller.store.getSnapshot().readiness.kind === 'catalog-unavailable')

  session.set({
    next: {provider: organizationRoute, model: organizationPicker},
    lastUsed: null,
  })
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.equal(controller.store.getSnapshot().selectionLoading, false)
  assert.deepEqual(controller.store.getSnapshot().selectionError, failure)
  assert.equal(controller.store.getSnapshot().readiness.kind, 'catalog-unavailable')
})

test('a projection update cannot overwrite an authoritative Loop status failure', async () => {
  const session = sessionBinding('ses_status_failure', {
    next: {provider: organizationRoute, model: organizationPicker},
    lastUsed: null,
  })
  const failure = {code: 'loop-host/backend-unavailable', message: ''}
  const controller = new LoopModelController({
    remote: remote({
      modelStatus: async () => ({ok: false, error: failure}),
    }),
    loadModelCatalog: async () => ({ok: true, value: catalog}),
    scopeSources: scopeSources().sources,
  })
  controller.start(observable(session.binding))
  await controller.open()
  await waitFor(() => controller.store.getSnapshot().readiness.kind === 'error')
  assert.deepEqual(controller.store.getSnapshot().readiness, {kind: 'error', error: failure})

  session.set({
    next: {provider: organizationRoute, model: organizationPicker},
    lastUsed: null,
  })
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.deepEqual(controller.store.getSnapshot().readiness, {kind: 'error', error: failure})
})

test('a catalog event received during selection recheck is drained after busy clears', async () => {
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
  const initialCatalog: ModelCatalog = {
    ...externalCatalog,
    default: {provider: organizationRoute, model: 'missing'},
  }
  const unavailable: ModelCatalog = {
    default: {provider: 'gone', model: 'gone'},
    routableProviders: [],
    groups: [],
    failures: [],
  }
  let listener: ((event: 'refresh' | 'reset') => void) | undefined
  let catalogCalls = 0
  let inSelectProbe = false
  let eventSent = false
  const controller = new LoopModelController({
    remote: remote({
      modelStatus: async () => ({
        ok: true,
        value: {state: 'active', accountPrincipal: 'hum_alpha', connections: []},
      }),
      setDefaultModel: async () => ({
        ok: true,
        value: {selection: externalCatalog.default},
      }),
    }),
    loadModelCatalog: async () => {
      catalogCalls += 1
      if (inSelectProbe && !eventSent) {
        eventSent = true
        listener?.('refresh')
        return {ok: true, value: externalCatalog}
      }
      return {ok: true, value: eventSent ? unavailable : initialCatalog}
    },
    subscribeCatalogEvents: next => {
      listener = next
      return () => { listener = undefined }
    },
    scopeSources: scopeSources().sources,
  })
  controller.start(noSessionBinding())
  await controller.open()
  await waitFor(() => controller.store.getSnapshot().readiness.kind === 'selection-required')
  const callsBefore = catalogCalls

  inSelectProbe = true
  controller.actions.select({
    kind: 'external',
    providerId: 'external-key',
    providerName: 'External key',
    modelId: 'external-model',
    modelName: 'External model',
  })
  await waitFor(() => catalogCalls === callsBefore + 2 &&
    controller.store.getSnapshot().busy === null)

  assert.notEqual(controller.store.getSnapshot().readiness.kind, 'external-ready')
})

test('connection reset discards old status authority and reads the current status', async () => {
  const emptyStatus: LoopModelStatus = {
    state: 'active',
    accountPrincipal: 'hum_alpha',
    connections: [],
  }
  let statusCalls = 0
  let releaseOldStatus!: () => void
  const oldStatusGate = new Promise<void>(resolve => {
    releaseOldStatus = resolve
  })
  const events = catalogEvents()
  const controller = new LoopModelController({
    remote: remote({
      modelStatus: async () => {
        statusCalls += 1
        if (statusCalls === 2) {
          await oldStatusGate
          return {ok: true, value: active}
        }
        return {ok: true, value: statusCalls === 1 ? active : emptyStatus}
      },
    }),
    loadModelCatalog: async () => ({ok: true, value: catalog}),
    subscribeCatalogEvents: events.subscribe,
    scopeSources: scopeSources().sources,
  })
  controller.start(noSessionBinding())
  await controller.open()
  await waitFor(() => controller.store.getSnapshot().readiness.kind === 'loop-ready')

  controller.actions.refresh()
  await waitFor(() => statusCalls === 2 &&
    controller.store.getSnapshot().busy === 'read')
  events.emit('reset')
  releaseOldStatus()
  await waitFor(() => statusCalls === 3 &&
    controller.store.getSnapshot().readiness.kind === 'route-missing')

  assert.equal(statusCalls, 3)
})

test('connection reset during a default write keeps the save result unknown', async () => {
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
  let currentCatalog: ModelCatalog = {
    ...externalCatalog,
    default: {provider: organizationRoute, model: 'missing'},
  }
  let releaseWrite!: () => void
  const writeGate = new Promise<void>(resolve => {
    releaseWrite = resolve
  })
  const events = catalogEvents()
  const controller = new LoopModelController({
    remote: remote({
      modelStatus: async () => ({
        ok: true,
        value: {state: 'active', accountPrincipal: 'hum_alpha', connections: []},
      }),
      setDefaultModel: async input => {
        await writeGate
        currentCatalog = {
          ...currentCatalog,
          default: {provider: input.provider, model: input.model},
        }
        return {
          ok: true,
          value: {selection: {provider: input.provider, model: input.model}},
        }
      },
    }),
    loadModelCatalog: async () => ({ok: true, value: currentCatalog}),
    subscribeCatalogEvents: events.subscribe,
    scopeSources: scopeSources().sources,
  })
  controller.start(noSessionBinding())
  await controller.open()
  await waitFor(() => controller.store.getSnapshot().readiness.kind === 'selection-required')
  const readiness = controller.store.getSnapshot().readiness
  if (readiness.kind !== 'selection-required') assert.fail('selection required')

  controller.actions.select(readiness.choices[0]!)
  await waitFor(() => controller.store.getSnapshot().busy === 'select')
  events.emit('reset')
  releaseWrite()
  await waitFor(() => controller.store.getSnapshot().busy === null &&
    controller.store.getSnapshot().readiness.kind === 'selection-required')

  assert.equal(controller.store.getSnapshot().readiness.kind, 'selection-required')
  assert.equal(controller.store.getSnapshot().error?.code, 'loop-host/model-default-unknown')
})

test('a connection reset supersedes an in-flight event refresh and loads only the new generation', async () => {
  let catalogCalls = 0
  let releaseOld!: (value: ModelCatalog) => void
  const oldCatalog = new Promise<ModelCatalog>(resolve => {
    releaseOld = resolve
  })
  const replacement: ModelCatalog = {
    default: {provider: 'external-key', model: 'external-model'},
    routableProviders: ['external-key'],
    groups: [{
      id: 'external-key',
      name: 'External key',
      models: [{id: 'external-model', name: 'External model'}],
    }],
    failures: [],
  }
  const events = catalogEvents()
  const controller = new LoopModelController({
    remote: remote({modelStatus: async () => ({ok: true, value: active})}),
    loadModelCatalog: async () => {
      catalogCalls += 1
      if (catalogCalls === 3) return {ok: true, value: await oldCatalog}
      return {ok: true, value: replacement}
    },
    subscribeCatalogEvents: events.subscribe,
    scopeSources: scopeSources().sources,
  })
  controller.start(noSessionBinding())
  await controller.open()
  await waitFor(() => controller.store.getSnapshot().readiness.kind === 'external-ready')

  events.emit('refresh')
  await waitFor(() => catalogCalls === 3)
  events.emit('reset')
  releaseOld(catalog)
  await waitFor(() => catalogCalls === 5 &&
    controller.store.getSnapshot().readiness.kind === 'external-ready')

  assert.equal(controller.store.getSnapshot().selection?.providerId, 'external-key')
})

test('cancel fences a delayed event refresh', async () => {
  let catalogCalls = 0
  let release!: (value: ModelCatalog) => void
  const delayed = new Promise<ModelCatalog>(resolve => {
    release = resolve
  })
  const events = catalogEvents()
  const controller = new LoopModelController({
    remote: remote({modelStatus: async () => ({ok: true, value: active})}),
    loadModelCatalog: async () => {
      catalogCalls += 1
      if (catalogCalls === 3) return {ok: true, value: await delayed}
      return {ok: true, value: catalog}
    },
    subscribeCatalogEvents: events.subscribe,
    scopeSources: scopeSources().sources,
  })
  controller.start(noSessionBinding())
  await controller.open()
  await waitFor(() => controller.store.getSnapshot().readiness.kind === 'loop-ready')

  events.emit('refresh')
  await waitFor(() => catalogCalls === 3)
  controller.actions.suspend()
  release(catalog)
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.deepEqual(controller.store.getSnapshot().readiness, {kind: 'loading'})
  assert.equal(controller.store.getSnapshot().selection, null)
})

test('signed-in automatic selection keeps existing local and Loop selections', async () => {
  const external = {provider:'local-key',model:'local-model'}
  for (const selection of [catalog.default, external]) {
    const selectedCatalog = {...catalog, default:selection,
      routableProviders:[...catalog.routableProviders,external.provider],
      groups:[...catalog.groups,{id:external.provider,name:'Local',models:[{id:external.model,name:'Local model'}]}]}
    let writes=0
    const controller = new LoopModelController({
      autoSelectAfterLogin:true,
      remote:remote({modelStatus:async()=>({ok:true,value:active}),setDefaultModel:async()=>{writes++;throw Error('must preserve')}}),
      openExternal:()=>true,getLocale:()=> 'en',scopeSources:scopeSources().sources,
      loadModelCatalog:async()=>({ok:true,value:selectedCatalog}),
    })
    controller.start(noSessionBinding())
    await waitFor(()=>['loop-ready','external-ready'].includes(controller.store.getSnapshot().readiness.kind))
    await new Promise(resolve=>setTimeout(resolve,0))
    assert.equal(writes,0)
    assert.equal(controller.store.getSnapshot().selection?.providerId,selection.provider)
    controller.dispose()
  }
})

test('an unset selection prefers Loop, falls back to local, and persists the native default once', async () => {
  const external = {provider:'local-key',model:'local-model'}
  for (const hasLoop of [true,false]) {
    let currentCatalog = {...catalog, default:{provider:'unconfigured',model:'unset'},
      routableProviders:[external.provider,...(hasLoop?catalog.routableProviders:[])],
      groups:[{id:external.provider,name:'Local',models:[{id:external.model,name:'Local model'}]},...(hasLoop?catalog.groups:[])]}
    const status = hasLoop?active:{...active,connections:active.connections.map(c=>({...c,models:[]}))}
    let writes=0
    const controller = new LoopModelController({
      autoSelectAfterLogin:true,
      remote:remote({modelStatus:async()=>({ok:true,value:status}),setDefaultModel:async input=>{
        writes++;currentCatalog={...currentCatalog,default:{provider:input.provider,model:input.model}}
        return {ok:true,value:{selection:currentCatalog.default}}
      }}),openExternal:()=>true,getLocale:()=> 'en',scopeSources:scopeSources().sources,
      loadModelCatalog:async()=>({ok:true,value:currentCatalog}),
    })
    controller.start(noSessionBinding())
    await waitFor(()=>controller.store.getSnapshot().readiness.kind===(hasLoop?'loop-ready':'external-ready'))
    assert.equal(writes,1)
    assert.deepEqual(currentCatalog.default,hasLoop?catalog.default:external)
    await controller.open(true)
    assert.equal(writes,1)
    controller.dispose()
  }
})

test('relogin restores the same Loop model under a new connection route, including an existing Session', async () => {
  const previous={provider:'loop-model-expired',model:personalPicker}
  const newCatalog={...catalog,default:previous,routableProviders:[organizationRoute,personalRoute],groups:[...catalog.groups,
    {id:personalRoute,name:'Personal',models:[{id:personalPicker,name:'Model A'}]}]}
  const status={...active,connections:[...active.connections,{...active.connections[0]!,connectionId:'eag_personal',models:[personalModel]}]}
  const session=sessionBinding('session-returning',{next:null,lastUsed:previous})
  let selected:unknown
  const controller=new LoopModelController({autoSelectAfterLogin:true,
    remote:remote({modelStatus:async()=>({ok:true,value:status})}),
    openExternal:()=>true,getLocale:()=> 'en',scopeSources:scopeSources().sources,
    loadModelCatalog:async()=>({ok:true,value:newCatalog}),
    selectModel:async input=>{selected=input;session.set({next:{provider:input.choice.providerId,model:input.choice.modelId},lastUsed:previous});return {ok:true,value:undefined}},
  })
  controller.start(observable(session.binding))
  await waitFor(()=>controller.store.getSnapshot().readiness.kind==='loop-ready')
  assert.equal((selected as {choice:{modelId:string}}).choice.modelId,personalPicker)
  assert.equal((selected as {choice:{providerId:string}}).choice.providerId,personalRoute)
  assert.equal(controller.store.getSnapshot().selection?.basis,'next')
  controller.dispose()
})

test('catalog changes after a zero-model login fill the empty selection without opening settings', async () => {
  let ready=false,writes=0
  let selected={provider:'unconfigured',model:'unset'}
  const events=catalogEvents()
  const controller=new LoopModelController({autoSelectAfterLogin:true,
    remote:remote({modelStatus:async()=>({ok:true,value:ready?active:{...active,connections:[]}}),setDefaultModel:async input=>{
      writes++;selected={provider:input.provider,model:input.model};return {ok:true,value:{selection:selected}}
    }}),openExternal:()=>true,getLocale:()=> 'en',scopeSources:scopeSources().sources,
    subscribeCatalogEvents:events.subscribe,
    loadModelCatalog:async()=>({ok:true,value:{...catalog,default:selected,...ready?{}:{groups:[],routableProviders:[]}}}),
  })
  controller.start(noSessionBinding())
  await waitFor(()=>controller.store.getSnapshot().busy===null&&controller.store.getSnapshot().readiness.kind!=='loading')
  assert.equal(writes,0)
  ready=true;events.emit('refresh')
  await waitFor(()=>controller.store.getSnapshot().readiness.kind==='loop-ready')
  assert.equal(writes,1)
  controller.dispose()
})

test('automatic selection waits for current account authority and never loops on a failed save', async () => {
  const scopes=scopeSources({...scope,sharedPrincipalId:'someone-else'})
  let writes=0
  const controller=new LoopModelController({autoSelectAfterLogin:true,
    remote:remote({modelStatus:async()=>({ok:true,value:active}),setDefaultModel:async()=>{
      writes++;return {ok:false,error:{code:'loop-host/model-default-save',message:'disk failure'}}
    }}),openExternal:()=>true,getLocale:()=> 'en',scopeSources:scopes.sources,
    loadModelCatalog:async()=>({ok:true,value:{...catalog,default:{provider:'unconfigured',model:'unset'}}}),
  })
  controller.start(noSessionBinding())
  await waitFor(()=>controller.store.getSnapshot().busy===null&&controller.store.getSnapshot().readiness.kind!=='loading')
  assert.equal(writes,0)
  scopes.sharedData.set({identity:{workspaceId:'wsp_alpha',principalId:'hum_alpha',authEpoch:'epoch-new'}})
  await waitFor(()=>controller.store.getSnapshot().error?.code==='loop-host/model-default-save')
  await new Promise(resolve=>setTimeout(resolve,5))
  assert.equal(writes,1)
  controller.dispose()
})

test('login waits for the Loop provider to register before falling back to an already visible local model', async () => {
  let registered=false,writes=0
  let selection={provider:'loop-model-old-login',model:organizationPicker}
  const events=catalogEvents()
  const external={id:'local',name:'Local',models:[{id:'local-model',name:'Local model'}]}
  const controller=new LoopModelController({autoSelectAfterLogin:true,
    remote:remote({modelStatus:async()=>({ok:true,value:active}),setDefaultModel:async input=>{
      writes++;selection={provider:input.provider,model:input.model};return {ok:true,value:{selection}}
    }}),openExternal:()=>true,getLocale:()=> 'en',scopeSources:scopeSources().sources,
    subscribeCatalogEvents:events.subscribe,
    loadModelCatalog:async()=>({ok:true,value:{...catalog,default:selection,
      groups:[external,...registered?catalog.groups:[]],routableProviders:['local',...registered?catalog.routableProviders:[]]}}),
  })
  controller.start(noSessionBinding())
  await waitFor(()=>controller.store.getSnapshot().readiness.kind==='selection-required'&&controller.store.getSnapshot().busy===null)
  await new Promise(resolve=>setTimeout(resolve,0))
  assert.equal(writes,0,'must not pick local during the registration gap')
  registered=true;events.emit('refresh')
  await waitFor(()=>controller.store.getSnapshot().readiness.kind==='loop-ready')
  assert.equal(writes,1)
  assert.deepEqual(selection,catalog.default)
  controller.dispose()
})
