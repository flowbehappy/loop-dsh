// @vitest-environment jsdom

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {cleanup, waitFor} from '@testing-library/react'
import type {ModelCatalog} from '@deepseek-ai/dsh-api-session-controller/types'
import type {HostObservable, StandardSourceBinding} from '@deepseek-ai/dsh-client-ui-slots'
import {
  loopModelPickerID,
  loopModelRouteFromDigest,
  loopModelRouteInput,
} from '../../../model-identity.mjs'
import {LoopGlobalPageController} from '../global-page-controller.ts'
import {LoopModelController} from '../model-controller.ts'
import type {LoopHostClient, LoopModelStatus} from '../types.ts'

const SERVER_URL = 'https://loop.synthetic.test/'
const PAGE_URL = 'https://loop.synthetic.test/external-host/page-login#next=%2Fworkspaces'
const SERVER_REVISION = 'rev-scope'

function observableValue<T>(value: T): HostObservable<T> & {set(next: T): void} {
  let current = value
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => current,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set(next) {
      current = next
      for (const listener of listeners) listener()
    },
  }
}

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

async function route(workspaceId: string, connectionId: string): Promise<string> {
  const bytes = new TextEncoder().encode(loopModelRouteInput(workspaceId, connectionId))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  const hex = Array.from(new Uint8Array(digest), value =>
    value.toString(16).padStart(2, '0')).join('')
  return loopModelRouteFromDigest(hex)
}

function deferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return {promise, resolve}
}

interface WorkspaceFixture {
  readonly workspaceId: string
  readonly principalId: string
  readonly authEpoch: string
  readonly connectionId: string
  readonly descriptor: {
    readonly id: string
    readonly name: string
    readonly source: 'loop_proxy'
    readonly providerId: string
    readonly providerName: string
    readonly wireApi: 'openai-completions'
  }
  readonly status: LoopModelStatus
  readonly catalog: ModelCatalog
}

async function workspaceFixture(
  suffix: 'a' | 'b',
): Promise<WorkspaceFixture> {
  const workspaceId = `wsp_${suffix}`
  const principalId = `hum_${suffix}`
  const connectionId = `eag_${suffix}`
  const descriptor = {
    id: `model-${suffix}`,
    name: `Model ${suffix.toUpperCase()}`,
    source: 'loop_proxy' as const,
    providerId: `provider-${suffix}`,
    providerName: `Provider ${suffix.toUpperCase()}`,
    wireApi: 'openai-completions' as const,
  }
  const providerId = await route(workspaceId, connectionId)
  const modelId = loopModelPickerID(descriptor)
  return {
    workspaceId,
    principalId,
    authEpoch: `epoch-${suffix}`,
    connectionId,
    descriptor,
    status: {
      state: 'active',
      accountPrincipal: principalId,
      connections: [{
        connectionId,
        workspaceId,
        providerName: `Loop · ${suffix.toUpperCase()}`,
        models: [descriptor],
        status: 'active',
        updatedAt: '2026-11-09T00:00:00Z',
      }],
    },
    catalog: {
      default: {provider: providerId, model: modelId},
      routableProviders: [providerId],
      groups: [{
        id: providerId,
        name: `Loop · ${suffix.toUpperCase()}`,
        models: [{id: modelId, name: descriptor.name}],
      }],
      failures: [],
    },
  }
}

function bridgeHarness(): {
  readonly frame: Window
  readonly dispatch: (fixture: WorkspaceFixture) => void
} {
  const posted: Record<string, unknown>[] = []
  const frame = {
    postMessage(message: Record<string, unknown>) {
      posted.push(message)
    },
  } as unknown as Window
  return {
    frame,
    dispatch: fixture => {
      window.dispatchEvent(new MessageEvent('message', {
        origin: 'https://loop.synthetic.test',
        source: frame as unknown as MessageEventSource,
        data: {
          channel: 'loop.global-page.v2',
          type: 'workspace',
          nonce: posted.find(message => message.type === 'init')?.nonce,
          revision: SERVER_REVISION,
          workspaceId: fixture.workspaceId,
          workspaceName: fixture.workspaceId,
          principalId: fixture.principalId,
          authEpoch: fixture.authEpoch,
        },
      }))
    },
  }
}

function pageRemote(
  controller: () => LoopGlobalPageController,
  workspaceA: WorkspaceFixture,
  fixtureB: WorkspaceFixture,
  configure: LoopHostClient['configureGlobalServerWorkspace'],
): LoopHostClient {
  return remote({
    globalServerStatus: async () => ({
      ok: true,
      value: {serverUrl: SERVER_URL, serverRevision: SERVER_REVISION},
    }),
    globalPage: async () => ({ok: true, value: {url: PAGE_URL}}),
    globalServerWorkspaceStatus: async () => ({
      ok: true,
      value: {loopWorkspaceId: workspaceA.workspaceId},
    }),
    configureGlobalServerWorkspace: configure,
    modelStatus: async () => ({
      ok: true,
      value: controller().store.getSnapshot().loopWorkspaceId === fixtureB.workspaceId
        ? fixtureB.status
        : workspaceA.status,
    }),
  })
}

function modelController(
  host: LoopHostClient,
  page: LoopGlobalPageController,
  workspaceA: WorkspaceFixture,
  fixtureB: WorkspaceFixture,
): LoopModelController {
  return new LoopModelController({
    remote: host,
    autoSelectAfterLogin: true,
    openExternal: () => true,
    getLocale: () => 'en',
    loadModelCatalog: async () => ({
      ok: true,
      value: page.store.getSnapshot().loopWorkspaceId === fixtureB.workspaceId
        ? fixtureB.catalog
        : workspaceA.catalog,
    }),
    scopeSources: {
      globalPage: page.store,
      sharedData: page.sharedData.store,
    },
    routeForConnection: async (workspaceId, connectionId) => route(workspaceId, connectionId),
  })
}

beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>'
  const root = document.getElementById('root')
  if (root !== null) root.inert = false
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('Loop model scope changes', () => {
  it('never uses Host A models while shared B persists before the page switches', async () => {
    const workspaceA = await workspaceFixture('a')
    const fixtureB = await workspaceFixture('b')
    const configuredB = deferred<Awaited<ReturnType<
      NonNullable<LoopHostClient['configureGlobalServerWorkspace']>
    >>>()
    const configureCalls: string[] = []
    let page!: LoopGlobalPageController
    const host = pageRemote(
      () => page,
      workspaceA,
      fixtureB,
      async input => {
        configureCalls.push(input.workspaceId)
        return await configuredB.promise
      },
    )
    page = new LoopGlobalPageController(host)
    await page.open()
    const bridge = bridgeHarness()
    page.attachWorkspacePage(bridge.frame, PAGE_URL)

    bridge.dispatch(fixtureB)
    expect(page.sharedData.query().identity?.workspaceId).toBe(fixtureB.workspaceId)
    expect(page.store.getSnapshot().loopWorkspaceId).toBe(workspaceA.workspaceId)

    const models = modelController(host, page, workspaceA, fixtureB)
    models.start(observableValue<StandardSourceBinding>({
      key: undefined,
      hooks: {},
      keyedHooks: {},
      props: {},
    }))
    // Opening the shared login dialog loads models through this controller.
    await models.open()

    await waitFor(() => {
      expect(models.store.getSnapshot().readiness.kind).toBe('scope-required')
    })
    expect(page.store.getSnapshot().loopWorkspaceId).toBe(workspaceA.workspaceId)

    configuredB.resolve({ok: true, value: {loopWorkspaceId: fixtureB.workspaceId}})
    await waitFor(() => {
      expect(page.store.getSnapshot().loopWorkspaceId).toBe(fixtureB.workspaceId)
      expect(models.store.getSnapshot().readiness.kind).toBe('loop-ready')
    })
    expect(configureCalls).toEqual([fixtureB.workspaceId])

    models.dispose()
    page.dispose()
  })

  it('recovers when workspace B persistence fails and can retry without using models from A', async () => {
    const workspaceA = await workspaceFixture('a')
    const fixtureB = await workspaceFixture('b')
    const first = deferred<Awaited<ReturnType<
      NonNullable<LoopHostClient['configureGlobalServerWorkspace']>
    >>>()
    const second = deferred<Awaited<ReturnType<
      NonNullable<LoopHostClient['configureGlobalServerWorkspace']>
    >>>()
    const configureCalls: string[] = []
    let page!: LoopGlobalPageController
    const host = pageRemote(
      () => page,
      workspaceA,
      fixtureB,
      async input => {
        configureCalls.push(input.workspaceId)
        return await (configureCalls.length === 1 ? first : second).promise
      },
    )
    page = new LoopGlobalPageController(host)
    await page.open()
    const bridge = bridgeHarness()
    page.attachWorkspacePage(bridge.frame, PAGE_URL)
    bridge.dispatch(fixtureB)

    const models = modelController(host, page, workspaceA, fixtureB)
    models.start(observableValue<StandardSourceBinding>({
      key: undefined,
      hooks: {},
      keyedHooks: {},
      props: {},
    }))
    // Opening the shared login dialog loads models through this controller.
    await models.open()
    await waitFor(() => {
      expect(models.store.getSnapshot().readiness.kind).toBe('scope-required')
    })

    first.resolve({
      ok: false,
      error: {code: 'loop-host/workspace-write', message: 'offline'},
    })
    await waitFor(() => {
      expect(page.store.getSnapshot().workspaceError?.code).toBe('loop-host/workspace-write')
    })
    expect(page.store.getSnapshot().loopWorkspaceId).toBe(workspaceA.workspaceId)

    bridge.dispatch(fixtureB)
    await waitFor(() => { expect(configureCalls).toHaveLength(2) })
    second.resolve({ok: true, value: {loopWorkspaceId: fixtureB.workspaceId}})
    await waitFor(() => {
      expect(page.store.getSnapshot().loopWorkspaceId).toBe(fixtureB.workspaceId)
      expect(models.store.getSnapshot().readiness.kind).toBe('loop-ready')
    })

    models.dispose()
    page.dispose()
  })
})
