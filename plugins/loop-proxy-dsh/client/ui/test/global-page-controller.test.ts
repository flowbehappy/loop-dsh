import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LoopGlobalPageController,
  normalizedLoopServerUrl,
  startLoopGlobalPageRuntime,
} from '../global-page-controller.ts'
import type { LoopHostClient } from '../types.ts'

const GLOBAL_PAGE_URL =
  'https://loop.synthetic.test/external-host/page-login#next=%2Fworkspaces'
const SERVER_URL = 'https://loop.synthetic.test/'
const SERVER_REVISION = 'rev-server-a'
const NEXT_SERVER_REVISION = 'rev-server-b'

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
  for (let index = 0; index < 50; index += 1) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  assert.fail('condition did not settle')
}

function fakePageWindow() {
  const listeners = new Set<(event: MessageEvent) => void>()
  const posted: Array<{
    readonly frame: Window
    readonly message: Record<string, unknown>
    readonly origin: string
  }> = []
  const fakeWindow = {
    addEventListener(type: string, listener: (event: MessageEvent) => void) {
      if (type === 'message') listeners.add(listener)
    },
    removeEventListener(type: string, listener: (event: MessageEvent) => void) {
      if (type === 'message') listeners.delete(listener)
    },
  } as unknown as Window
  const frame = (): Window => ({
    postMessage(message: Record<string, unknown>, origin: string) {
      posted.push({ frame: this as Window, message, origin })
    },
  }) as unknown as Window
  const dispatch = (frameSource: Window, nonce: unknown, workspaceId: string): void => {
    for (const listener of listeners) {
      listener({
        origin: 'https://loop.synthetic.test',
        source: frameSource,
        data: {
          channel: 'loop.global-page.v2',
          type: 'workspace',
          nonce,
          revision: SERVER_REVISION,
          workspaceId,
          workspaceName: workspaceId,
        },
      } as MessageEvent)
    }
  }
  return { dispatch, fakeWindow, frame, listeners, posted }
}

function deferred<T>(): {
  readonly promise: Promise<T>
  readonly resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

test('server URL validation accepts HTTPS and loopback development HTTP only', () => {
  assert.equal(
    normalizedLoopServerUrl('https://loop.synthetic.test'),
    'https://loop.synthetic.test/',
  )
  assert.equal(
    normalizedLoopServerUrl('https://loop.synthetic.test/tenant/loop'),
    'https://loop.synthetic.test/tenant/loop',
  )
  assert.equal(
    normalizedLoopServerUrl('http://127.0.0.1:3302'),
    'http://127.0.0.1:3302/',
  )
  assert.equal(normalizedLoopServerUrl('http://loop.synthetic.test'), null)
  assert.equal(normalizedLoopServerUrl('http://LOOP.WORK.LOCALHOST:3302'), 'http://loop.work.localhost:3302/')
  for (const host of ['localhost.evil', 'loop.work.localhost.evil', 'notlocalhost', '192.168.1.2']) {
    assert.equal(normalizedLoopServerUrl(`http://${host}`), null)
  }
  assert.equal(normalizedLoopServerUrl('https://user:secret@loop.synthetic.test'), null)
  assert.equal(normalizedLoopServerUrl('https://loop.synthetic.test?debug=1'), null)
  assert.equal(normalizedLoopServerUrl('https://loop.synthetic.test#token'), null)
  assert.equal(normalizedLoopServerUrl('loop.synthetic.test'), null)
})

test('embedded page receives the initial locale and live locale changes on the trusted bridge', async () => {
  const bridge = fakePageWindow()
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: bridge.fakeWindow,
  })
  try {
    const controller = new LoopGlobalPageController(remote({
      globalServerStatus: async () => ({
        ok: true,
        value: { serverUrl: SERVER_URL, serverRevision: SERVER_REVISION },
      }),
      globalPage: async () => ({ ok: true, value: { url: GLOBAL_PAGE_URL } }),
    }))
    controller.setLocale('zh-CN')
    await controller.open()
    const frame = bridge.frame()
    controller.attachWorkspacePage(frame, GLOBAL_PAGE_URL)

    assert.deepEqual(bridge.posted[0]?.message, {
      channel: 'loop.global-page.v2',
      type: 'init',
      nonce: bridge.posted[0]?.message.nonce,
      revision: SERVER_REVISION,
      path: '/tasks/views/related-to-me',
      locale: 'zh-CN',
    })

    controller.setLocale('en')
    assert.deepEqual(bridge.posted.at(-1), {
      frame,
      message: {
        channel: 'loop.global-page.v2',
        type: 'locale',
        nonce: bridge.posted[0]?.message.nonce,
        revision: SERVER_REVISION,
        locale: 'en',
      },
      origin: 'https://loop.synthetic.test',
    })

    const count = bridge.posted.length
    controller.setLocale('en')
    assert.equal(bridge.posted.length, count)
    controller.dispose()
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      })
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  }
})

test('global page uses only the configured Loop service and retains the result', async () => {
  const inputs: Record<never, never>[] = []
  let statusCalls = 0
  const controller = new LoopGlobalPageController(remote({
    globalServerStatus: async () => {
      statusCalls += 1
      return { ok: true, value: { serverUrl: SERVER_URL, serverRevision: SERVER_REVISION } }
    },
    globalPage: async input => {
      inputs.push(input)
      return {
        ok: true,
        value: { url: GLOBAL_PAGE_URL },
      }
    },
  }))

  await controller.open()
  await controller.open()

  assert.equal(statusCalls, 1)
  assert.deepEqual(inputs, [{}])
  assert.deepEqual(controller.store.getSnapshot(), {
    screen: 'ready',
    page: { url: GLOBAL_PAGE_URL },
    frameKey: 2,
    error: null,
    serverUrl: SERVER_URL,
    serverRevision: SERVER_REVISION,
    serverDraft: SERVER_URL,
    serverBusy: false,
    serverError: null,
    loopWorkspaceId: null,
    workspaceError: null,
    activePath: '/tasks/views/related-to-me',
  })
})

test('client bootstrap loads a persisted page once without panel selection or OAuth', async () => {
  let statusCalls = 0
  let pageCalls = 0
  const controller = new LoopGlobalPageController(remote({
    globalServerStatus: async () => {
      statusCalls += 1
      return {
        ok: true,
        value: {
          serverUrl: SERVER_URL,
          serverRevision: SERVER_REVISION,
        },
      }
    },
    globalPage: async () => {
      pageCalls += 1
      return { ok: true, value: { url: GLOBAL_PAGE_URL } }
    },
  }))

  const dispose = startLoopGlobalPageRuntime(controller)
  await waitFor(() => controller.store.getSnapshot().screen === 'ready')

  assert.equal(statusCalls, 1)
  assert.equal(pageCalls, 1)
  assert.equal(controller.store.getSnapshot().page?.url, GLOBAL_PAGE_URL)
  dispose()
  assert.equal(controller.store.getSnapshot().screen, 'idle')
})

test('first run shows server setup without requesting a page', async () => {
  let pageCalls = 0
  const controller = new LoopGlobalPageController(remote({
    globalServerStatus: async () => ({
      ok: true,
      value: { serverUrl: null, serverRevision: '' },
    }),
    globalPage: async () => {
      pageCalls += 1
      return { ok: true, value: { url: GLOBAL_PAGE_URL } }
    },
  }))

  const dispose = startLoopGlobalPageRuntime(controller)
  await waitFor(() => controller.store.getSnapshot().screen === 'setup')

  assert.equal(pageCalls, 0)
  assert.equal(controller.store.getSnapshot().screen, 'setup')
  assert.equal(controller.store.getSnapshot().serverDraft, '')
  dispose()
})

test('a Host without server revisions fails closed before loading the page', async () => {
  let pageCalls = 0
  const controller = new LoopGlobalPageController(remote({
    globalServerStatus: async () => ({
      ok: true,
      value: { serverUrl: SERVER_URL },
    } as never),
    globalPage: async () => {
      pageCalls += 1
      return { ok: true, value: { url: GLOBAL_PAGE_URL } }
    },
  }))

  await controller.open()

  assert.equal(pageCalls, 0)
  assert.equal(controller.store.getSnapshot().screen, 'error')
  assert.equal(controller.store.getSnapshot().error?.code, 'loop/host-update-required')
})

test('missing global-page capability reports an actionable host update', async () => {
  const controller = new LoopGlobalPageController(remote())

  await controller.open()

  assert.equal(controller.store.getSnapshot().screen, 'error')
  assert.equal(controller.store.getSnapshot().error?.code, 'loop/host-update-required')
})

test('reconnect replaces a transport failure with the latest successful page', async () => {
  let calls = 0
  const controller = new LoopGlobalPageController(remote({
    globalServerStatus: async () => ({
      ok: true,
      value: { serverUrl: SERVER_URL, serverRevision: SERVER_REVISION },
    }),
    globalPage: async () => {
      calls += 1
      if (calls === 1) throw new Error('offline')
      return {
        ok: true,
        value: { url: GLOBAL_PAGE_URL },
      }
    },
  }))

  await controller.open()
  assert.equal(controller.store.getSnapshot().error?.code, 'loop/transport')

  controller.actions.reconnect()
  await waitFor(() => controller.store.getSnapshot().screen === 'ready')

  assert.equal(calls, 2)
  assert.deepEqual(controller.store.getSnapshot().page, {
    url: GLOBAL_PAGE_URL,
  })
  assert.equal(controller.store.getSnapshot().frameKey, 4)
})

test('a superseded response cannot replace a newer global page', async () => {
  const pending: Array<{
    readonly resolve: (value: Awaited<ReturnType<NonNullable<LoopHostClient['globalPage']>>>) => void
  }> = []
  const controller = new LoopGlobalPageController(remote({
    globalServerStatus: async () => ({
      ok: true,
      value: { serverUrl: SERVER_URL, serverRevision: SERVER_REVISION },
    }),
    globalPage: () => new Promise(resolve => { pending.push({ resolve }) }),
  }))

  void controller.open()
  await waitFor(() => pending.length === 1)
  controller.actions.reconnect()
  await waitFor(() => pending.length === 2)

  pending[1]?.resolve({
    ok: true,
    value: { url: 'https://loop.synthetic.test/new' },
  })
  await waitFor(() => controller.store.getSnapshot().screen === 'ready')
  pending[0]?.resolve({
    ok: true,
    value: { url: 'https://loop.synthetic.test/stale' },
  })
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.equal(
    controller.store.getSnapshot().page?.url,
    'https://loop.synthetic.test/new',
  )
})

test('explicit reconnect refreshes the frame even when the public URL is unchanged', async () => {
  let calls = 0
  const controller = new LoopGlobalPageController(remote({
    globalServerStatus: async () => ({
      ok: true,
      value: { serverUrl: SERVER_URL, serverRevision: SERVER_REVISION },
    }),
    globalPage: async () => {
      calls += 1
      return { ok: true, value: { url: GLOBAL_PAGE_URL } }
    },
  }))

  await controller.open()
  const initialFrame = controller.store.getSnapshot().frameKey

  controller.actions.reconnect()
  await waitFor(() => controller.store.getSnapshot().screen === 'ready' &&
    controller.store.getSnapshot().frameKey !== initialFrame)

  assert.equal(calls, 2)
  assert.equal(controller.store.getSnapshot().page?.url, GLOBAL_PAGE_URL)
})

test('saving a server shows the existing address and updates only after Host success', async () => {
  const configured = 'https://next.synthetic.test/'
  const nextPage = 'https://next.synthetic.test/external-host/page-login#next=%2Fworkspaces'
  const saved: string[] = []
  const controller = new LoopGlobalPageController(remote({
    globalServerStatus: async () => ({
      ok: true,
      value: { serverUrl: SERVER_URL, serverRevision: SERVER_REVISION },
    }),
    globalPage: async () => ({ ok: true, value: { url: GLOBAL_PAGE_URL } }),
    configureGlobalServer: async input => {
      saved.push(input.serverUrl)
      return {
        ok: true,
        value: {
          serverUrl: configured,
          serverRevision: NEXT_SERVER_REVISION,
          page: { url: nextPage },
        },
      }
    },
  }))

  await controller.open()
  const originalFrame = controller.store.getSnapshot().frameKey
  controller.actions.changeServerUrl('https://next.synthetic.test')
  controller.actions.saveServer()
  await waitFor(() => controller.store.getSnapshot().screen === 'ready' &&
    controller.store.getSnapshot().serverUrl === configured)

  assert.deepEqual(saved, [configured])
  assert.equal(controller.store.getSnapshot().page?.url, nextPage)
  assert.notEqual(controller.store.getSnapshot().frameKey, originalFrame)
})

test('failed server save keeps the current page visible with an actionable error', async () => {
  const controller = new LoopGlobalPageController(remote({
    globalServerStatus: async () => ({
      ok: true,
      value: { serverUrl: SERVER_URL, serverRevision: SERVER_REVISION },
    }),
    globalPage: async () => ({ ok: true, value: { url: GLOBAL_PAGE_URL } }),
    configureGlobalServer: async () => ({
      ok: false,
      error: { code: 'loop-host/backend-unavailable', message: 'offline' },
    }),
  }))

  await controller.open()
  const originalFrame = controller.store.getSnapshot().frameKey
  controller.actions.changeServerUrl('https://offline.synthetic.test')
  controller.actions.saveServer()
  await waitFor(() => controller.store.getSnapshot().serverError !== null)

  assert.equal(controller.store.getSnapshot().page?.url, GLOBAL_PAGE_URL)
  assert.equal(controller.store.getSnapshot().frameKey, originalFrame)
  assert.equal(controller.store.getSnapshot().serverError?.code, 'loop-host/backend-unavailable')
})

test('invalid server input is rejected before Host configuration', async () => {
  let configureCalls = 0
  const controller = new LoopGlobalPageController(remote({
    globalServerStatus: async () => ({
      ok: true,
      value: { serverUrl: null, serverRevision: '' },
    }),
    configureGlobalServer: async () => {
      configureCalls += 1
      return {
        ok: true,
        value: {
          serverUrl: SERVER_URL,
          serverRevision: NEXT_SERVER_REVISION,
          page: { url: GLOBAL_PAGE_URL },
        },
      }
    },
  }))

  await controller.open()
  controller.actions.changeServerUrl('http://public.example.test')
  controller.actions.saveServer()

  assert.equal(configureCalls, 0)
  assert.equal(controller.store.getSnapshot().serverError?.code, 'loop/server-url-invalid')
})

test('trusted page bridge configures the selected Loop workspace without reloading the page', async () => {
  const listeners = new Set<(event: MessageEvent) => void>()
  const fakeWindow = {
    addEventListener(type: string, listener: (event: MessageEvent) => void) {
      if (type === 'message') listeners.add(listener)
    },
    removeEventListener(type: string, listener: (event: MessageEvent) => void) {
      if (type === 'message') listeners.delete(listener)
    },
  } as unknown as Window
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: fakeWindow,
  })
  try {
    const posted: Array<{ readonly message: Record<string, unknown>; readonly origin: string }> = []
    const frame = {
      postMessage(message: Record<string, unknown>, origin: string) {
        posted.push({ message, origin })
      },
    } as unknown as Window
    const configured: Array<{
      readonly workspaceId: string
      readonly expectedServerRevision: string
    }> = []
    const controller = new LoopGlobalPageController(remote({
      globalServerStatus: async () => ({
        ok: true,
        value: { serverUrl: SERVER_URL, serverRevision: SERVER_REVISION },
      }),
      globalPage: async () => ({ ok: true, value: { url: GLOBAL_PAGE_URL } }),
      globalServerWorkspaceStatus: async () => ({
        ok: true,
        value: { loopWorkspaceId: null },
      }),
      configureGlobalServerWorkspace: async input => {
        configured.push({
          workspaceId: input.workspaceId,
          expectedServerRevision: input.expectedServerRevision,
        })
        return { ok: true, value: { loopWorkspaceId: input.workspaceId } }
      },
    }))

    await controller.open()
    const frameKey = controller.store.getSnapshot().frameKey
    controller.attachWorkspacePage(frame, GLOBAL_PAGE_URL)
    assert.equal(posted[0]?.origin, 'https://loop.synthetic.test')
    const nonce = posted[0]?.message.nonce
    assert.equal(typeof nonce, 'string')
    for (const listener of listeners) {
      listener({
        origin: 'https://loop.synthetic.test',
        source: frame,
        data: {
          channel: 'loop.global-page.v2',
          type: 'workspace',
          nonce,
          revision: SERVER_REVISION,
          workspaceId: 'wsp_alpha',
          workspaceName: 'Alpha',
        },
      } as MessageEvent)
    }
    await waitFor(() => controller.store.getSnapshot().loopWorkspaceId === 'wsp_alpha')

    assert.deepEqual(configured, [{
      workspaceId: 'wsp_alpha',
      expectedServerRevision: SERVER_REVISION,
    }])
    assert.equal(controller.store.getSnapshot().frameKey, frameKey)
    controller.dispose()
    assert.equal(listeners.size, 0)
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      })
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  }
})

test('replacing the Loop page rejects workspace messages from the previous frame', async () => {
  const listeners = new Set<(event: MessageEvent) => void>()
  const fakeWindow = {
    addEventListener(type: string, listener: (event: MessageEvent) => void) {
      if (type === 'message') listeners.add(listener)
    },
    removeEventListener(type: string, listener: (event: MessageEvent) => void) {
      if (type === 'message') listeners.delete(listener)
    },
  } as unknown as Window
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: fakeWindow,
  })
  try {
    const posted: Array<{ readonly frame: Window; readonly message: Record<string, unknown> }> = []
    const frame = (): Window => ({
      postMessage(message: Record<string, unknown>) {
        posted.push({ frame: this as Window, message })
      },
    }) as unknown as Window
    const first = frame()
    const second = frame()
    const configured: Array<{
      readonly workspaceId: string
      readonly expectedServerRevision: string
    }> = []
    const controller = new LoopGlobalPageController(remote({
      globalServerStatus: async () => ({
        ok: true,
        value: { serverUrl: SERVER_URL, serverRevision: SERVER_REVISION },
      }),
      globalPage: async () => ({ ok: true, value: { url: GLOBAL_PAGE_URL } }),
      configureGlobalServerWorkspace: async input => {
        configured.push(input.workspaceId)
        return { ok: true, value: { loopWorkspaceId: input.workspaceId } }
      },
    }))

    await controller.open()
    controller.attachWorkspacePage(first, GLOBAL_PAGE_URL)
    controller.attachWorkspacePage(second, GLOBAL_PAGE_URL)
    const firstNonce = posted.find(row => row.frame === first)?.message.nonce
    const secondNonce = posted.find(row => row.frame === second)?.message.nonce
    const listener = [...listeners][0]
    assert.notEqual(firstNonce, secondNonce)
    listener?.({
      origin: 'https://loop.synthetic.test',
      source: first,
      data: {
        channel: 'loop.global-page.v2',
        type: 'workspace',
        nonce: firstNonce,
        revision: SERVER_REVISION,
        workspaceId: 'wsp_stale',
        workspaceName: 'Stale',
      },
    } as MessageEvent)
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.deepEqual(configured, [])

    listener?.({
      origin: 'https://loop.synthetic.test',
      source: second,
      data: {
        channel: 'loop.global-page.v2',
        type: 'workspace',
        nonce: secondNonce,
        revision: SERVER_REVISION,
        workspaceId: 'wsp_current',
        workspaceName: 'Current',
      },
    } as MessageEvent)
    await waitFor(() => controller.store.getSnapshot().loopWorkspaceId === 'wsp_current')
    assert.deepEqual(configured, ['wsp_current'])
    controller.dispose()
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      })
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  }
})

test('failed server cutover ignores old messages while pending and restores the same page bridge', async () => {
  const bridge = fakePageWindow()
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: bridge.fakeWindow,
  })
  try {
    const cutover = deferred<Awaited<ReturnType<NonNullable<LoopHostClient['configureGlobalServer']>>>>()
    const configured: string[] = []
    const controller = new LoopGlobalPageController(remote({
      globalServerStatus: async () => ({
        ok: true,
        value: { serverUrl: SERVER_URL, serverRevision: SERVER_REVISION },
      }),
      globalPage: async () => ({ ok: true, value: { url: GLOBAL_PAGE_URL } }),
      globalServerWorkspaceStatus: async () => ({ ok: true, value: { loopWorkspaceId: null } }),
      configureGlobalServerWorkspace: async input => {
        configured.push(input.workspaceId)
        return { ok: true, value: { loopWorkspaceId: input.workspaceId } }
      },
      configureGlobalServer: async () => cutover.promise,
    }))

    await controller.open()
    const frame = bridge.frame()
    controller.attachWorkspacePage(frame, GLOBAL_PAGE_URL)
    const originalFrameKey = controller.store.getSnapshot().frameKey
    controller.actions.changeServerUrl('https://next.synthetic.test')
    void controller.saveServer()
    await waitFor(() => controller.store.getSnapshot().serverBusy)

    const pendingNonce = bridge.posted.find(row => row.frame === frame)?.message.nonce
    bridge.dispatch(frame, pendingNonce, 'wsp_ignored')
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.deepEqual(configured, [])

    cutover.resolve({
      ok: false,
      error: { code: 'loop-host/backend-unavailable', message: 'offline' },
    })
    await waitFor(() => controller.store.getSnapshot().serverError !== null)
    assert.equal(controller.store.getSnapshot().page?.url, GLOBAL_PAGE_URL)
    assert.equal(controller.store.getSnapshot().frameKey, originalFrameKey)

    const resumedNonce = bridge.posted.at(-1)?.message.nonce
    assert.notEqual(resumedNonce, pendingNonce)
    bridge.dispatch(frame, resumedNonce, 'wsp_resumed')
    await waitFor(() => controller.store.getSnapshot().loopWorkspaceId === 'wsp_resumed')
    assert.deepEqual(configured, ['wsp_resumed'])
    controller.dispose()
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      })
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  }
})

test('server cutover aborts an in-flight workspace write and accepts only the new B frame', async () => {
  const bridge = fakePageWindow()
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: bridge.fakeWindow,
  })
  try {
    const firstWorkspace = deferred<Awaited<ReturnType<NonNullable<LoopHostClient['configureGlobalServerWorkspace']>>>>()
    const cutover = deferred<Awaited<ReturnType<NonNullable<LoopHostClient['configureGlobalServer']>>>>()
    const configured: string[] = []
    const expectedRevisions: string[] = []
    const workspaceSignals: AbortSignal[] = []
    const nextUrl = 'https://next.synthetic.test/external-host/page-login#next=%2Fworkspaces'
    const controller = new LoopGlobalPageController(remote({
      globalServerStatus: async () => ({
        ok: true,
        value: { serverUrl: SERVER_URL, serverRevision: SERVER_REVISION },
      }),
      globalPage: async () => ({ ok: true, value: { url: GLOBAL_PAGE_URL } }),
      globalServerWorkspaceStatus: async () => ({ ok: true, value: { loopWorkspaceId: null } }),
      configureGlobalServerWorkspace: async (input, signal) => {
        configured.push({
          workspaceId: input.workspaceId,
          expectedServerRevision: input.expectedServerRevision,
        })
        expectedRevisions.push(input.expectedServerRevision)
        workspaceSignals.push(signal as AbortSignal)
        if (configured.length === 1) return firstWorkspace.promise
        return { ok: true, value: { loopWorkspaceId: input.workspaceId } }
      },
      configureGlobalServer: async () => cutover.promise,
    }))

    await controller.open()
    const frameA = bridge.frame()
    controller.attachWorkspacePage(frameA, GLOBAL_PAGE_URL)
    const nonceA = bridge.posted.find(row => row.frame === frameA)?.message.nonce
    bridge.dispatch(frameA, nonceA, 'wsp_alpha')
    await waitFor(() => configured.length === 1)

    controller.actions.changeServerUrl('https://next.synthetic.test')
    void controller.saveServer()
    await waitFor(() => controller.store.getSnapshot().serverBusy)
    assert.equal(workspaceSignals[0]?.aborted, true)

    bridge.dispatch(frameA, nonceA, 'wsp_stale')
    firstWorkspace.resolve({ ok: true, value: { loopWorkspaceId: 'wsp_alpha' } })
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.equal(controller.store.getSnapshot().loopWorkspaceId, null)

    cutover.resolve({
      ok: true,
      value: {
        serverUrl: 'https://next.synthetic.test/',
        serverRevision: NEXT_SERVER_REVISION,
        page: { url: nextUrl },
      },
    })
    await waitFor(() => controller.store.getSnapshot().serverUrl === 'https://next.synthetic.test/')

    bridge.dispatch(frameA, nonceA, 'wsp_old_after_success')
    await new Promise(resolve => setTimeout(resolve, 0))
    assert.deepEqual(configured, [{
      workspaceId: 'wsp_alpha',
      expectedServerRevision: SERVER_REVISION,
    }])

    const frameB = bridge.frame()
    controller.attachWorkspacePage(frameB, nextUrl)
    const nonceB = bridge.posted.find(row => row.frame === frameB)?.message.nonce
    for (const listener of bridge.listeners) {
      listener({
        origin: 'https://next.synthetic.test',
        source: frameB,
        data: {
          channel: 'loop.global-page.v2',
          type: 'workspace',
          nonce: nonceB,
          revision: NEXT_SERVER_REVISION,
          workspaceId: 'wsp_beta',
          workspaceName: 'Beta',
        },
      } as MessageEvent)
    }
    await waitFor(() => controller.store.getSnapshot().loopWorkspaceId === 'wsp_beta')
    assert.deepEqual(configured, [
      { workspaceId: 'wsp_alpha', expectedServerRevision: SERVER_REVISION },
      { workspaceId: 'wsp_beta', expectedServerRevision: NEXT_SERVER_REVISION },
    ])
    assert.deepEqual(expectedRevisions, [SERVER_REVISION, NEXT_SERVER_REVISION])
    controller.dispose()
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      })
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  }
})

test('A to B to A rotates server revisions and never reuses the old A revision', async () => {
  const bridge = fakePageWindow()
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: bridge.fakeWindow,
  })
  try {
    const serverA = 'https://server-a.test/'
    const serverB = 'https://server-b.test/'
    const revisionA1 = 'rev-a-1'
    const revisionB = 'rev-b-1'
    const revisionA2 = 'rev-a-2'
    const pageA = `${serverA}external-host/page-login#next=%2Fworkspaces`
    const pageB = `${serverB}external-host/page-login#next=%2Fworkspaces`
    let cutovers = 0
    const expectedRevisions: string[] = []
    const controller = new LoopGlobalPageController(remote({
      globalServerStatus: async () => ({
        ok: true,
        value: { serverUrl: serverA, serverRevision: revisionA1 },
      }),
      globalPage: async () => ({ ok: true, value: { url: pageA } }),
      globalServerWorkspaceStatus: async () => ({ ok: true, value: { loopWorkspaceId: null } }),
      configureGlobalServerWorkspace: async input => {
        expectedRevisions.push(input.expectedServerRevision)
        return { ok: true, value: { loopWorkspaceId: input.workspaceId } }
      },
      configureGlobalServer: async input => {
        cutovers += 1
        if (input.serverUrl === serverB) {
          return {
            ok: true,
            value: { serverUrl: serverB, serverRevision: revisionB, page: { url: pageB } },
          }
        }
        return {
          ok: true,
          value: { serverUrl: serverA, serverRevision: revisionA2, page: { url: pageA } },
        }
      },
    }))

    const publish = (
      frame: Window,
      origin: string,
      workspaceId: string,
      revision: string,
    ): void => {
      const nonce = bridge.posted.findLast(row => row.frame === frame)?.message.nonce
      for (const listener of bridge.listeners) {
        listener({
          origin,
          source: frame,
          data: {
            channel: 'loop.global-page.v2',
            type: 'workspace',
            nonce,
            revision,
            workspaceId,
            workspaceName: workspaceId,
          },
        } as MessageEvent)
      }
    }

    await controller.open()
    const frameA1 = bridge.frame()
    controller.attachWorkspacePage(frameA1, pageA)
    publish(frameA1, serverA.slice(0, -1), 'wsp_alpha_1', revisionA1)
    await waitFor(() => controller.store.getSnapshot().loopWorkspaceId === 'wsp_alpha_1')

    controller.actions.changeServerUrl(serverB)
    controller.actions.saveServer()
    await waitFor(() => controller.store.getSnapshot().serverRevision === revisionB)
    const frameB = bridge.frame()
    controller.attachWorkspacePage(frameB, pageB)
    publish(frameB, serverB.slice(0, -1), 'wsp_beta', revisionB)
    await waitFor(() => controller.store.getSnapshot().loopWorkspaceId === 'wsp_beta')

    controller.actions.changeServerUrl(serverA)
    controller.actions.saveServer()
    await waitFor(() => controller.store.getSnapshot().serverRevision === revisionA2)
    const frameA2 = bridge.frame()
    controller.attachWorkspacePage(frameA2, pageA)
    publish(frameA2, serverA.slice(0, -1), 'wsp_alpha_2', revisionA2)
    await waitFor(() => controller.store.getSnapshot().loopWorkspaceId === 'wsp_alpha_2')

    assert.equal(cutovers, 2)
    assert.deepEqual(expectedRevisions, [revisionA1, revisionB, revisionA2])
    assert.equal(new Set(expectedRevisions).size, 3)
    controller.dispose()
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      })
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  }
})

test('native module selection routes the persistent iframe and restores detail paths', async () => {
  const bridge = fakePageWindow()
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: bridge.fakeWindow,
  })
  try {
    const selected: string[] = []
    const controller = new LoopGlobalPageController(remote({
      globalServerStatus: async () => ({
        ok: true,
        value: { serverUrl: SERVER_URL, serverRevision: SERVER_REVISION },
      }),
      globalPage: async () => ({ ok: true, value: { url: GLOBAL_PAGE_URL } }),
    }), {
      onRoute: panelId => {
        selected.push(panelId)
        return false
      },
    })

    await controller.open()
    const frame = bridge.frame()
    controller.attachWorkspacePage(frame, GLOBAL_PAGE_URL)
    const frameKey = controller.store.getSnapshot().frameKey
    await controller.openModule('loop-knowledge')

    assert.deepEqual(bridge.posted.at(-1)?.message, {
      channel: 'loop.global-page.v2',
      type: 'navigate',
      nonce: bridge.posted[0]?.message.nonce,
      revision: SERVER_REVISION,
      path: '/kb',
    })
    assert.equal(controller.store.getSnapshot().frameKey, frameKey)
    assert.equal(controller.store.getSnapshot().activePath, '/kb')

    const nonce = bridge.posted[0]?.message.nonce
    for (const listener of bridge.listeners) {
      listener({
        origin: 'https://loop.synthetic.test',
        source: frame,
        data: {
          channel: 'loop.global-page.v2',
          type: 'route',
          nonce,
          revision: SERVER_REVISION,
          path: '/tasks/by-id/tsk_1?tab=activity',
        },
      } as MessageEvent)
    }

    assert.equal(controller.store.getSnapshot().activePath, '/tasks/by-id/tsk_1?tab=activity')
    assert.deepEqual(selected, ['loop-tasks'])

    const routePosts = bridge.posted.length
    await controller.openModule('loop-tasks')
    assert.equal(bridge.posted.length, routePosts)
    assert.equal(
      controller.store.getSnapshot().activePath,
      '/tasks/by-id/tsk_1?tab=activity',
    )

    await controller.openModule('loop-knowledge')
    assert.equal(bridge.posted.at(-1)?.message.path, '/kb')
    await controller.openModule('loop-tasks')
    assert.equal(
      bridge.posted.at(-1)?.message.path,
      '/tasks/by-id/tsk_1?tab=activity',
    )
    controller.dispose()
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      })
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  }
})

test('collaboration task links route the exact original Loop task', async () => {
  const bridge = fakePageWindow()
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: bridge.fakeWindow,
  })
  try {
    const controller = new LoopGlobalPageController(remote({
      globalServerStatus: async () => ({
        ok: true,
        value: { serverUrl: SERVER_URL, serverRevision: SERVER_REVISION },
      }),
      globalPage: async () => ({ ok: true, value: { url: GLOBAL_PAGE_URL } }),
    }))
    await controller.open()
    const frame = bridge.frame()
    controller.attachWorkspacePage(frame, GLOBAL_PAGE_URL)

    assert.equal(controller.openTask('wsp_alpha', 'tsk_123'), true)
    // Activating the task's native panel must retain the exact deep link.
    await controller.openModule('loop-tasks')
    assert.deepEqual(
      bridge.posted.at(-1)?.message,
      {
        channel: 'loop.global-page.v2',
        type: 'navigate',
        nonce: bridge.posted[0]?.message.nonce,
        revision: SERVER_REVISION,
        path: '/w/wsp_alpha/tasks/by-id/tsk_123',
      },
    )
    assert.equal(controller.store.getSnapshot().activePath, '/w/wsp_alpha/tasks/by-id/tsk_123')
    assert.equal(controller.openTask('../escape', 'tsk_123'), false)
    controller.dispose()
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      })
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  }
})

test('opening a bound project routes its exact ID and survives another module visit', async () => {
  const bridge = fakePageWindow()
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: bridge.fakeWindow,
  })
  try {
    const controller = new LoopGlobalPageController(remote({
      globalServerStatus: async () => ({
        ok: true,
        value: { serverUrl: SERVER_URL, serverRevision: SERVER_REVISION },
      }),
      globalPage: async () => ({ ok: true, value: { url: GLOBAL_PAGE_URL } }),
    }))

    await controller.open()
    const frame = bridge.frame()
    controller.attachWorkspacePage(frame, GLOBAL_PAGE_URL)
    const frameKey = controller.store.getSnapshot().frameKey

    assert.equal(await controller.openProject({
      projectId: 'prj_release_1',
      loopWorkspaceId: 'wsp_other',
      serviceBaseUrl: 'https://loop.synthetic.test',
    }), true)

    assert.deepEqual(bridge.posted.at(-1)?.message, {
      channel: 'loop.global-page.v2',
      type: 'navigate',
      nonce: bridge.posted[0]?.message.nonce,
      revision: SERVER_REVISION,
      path: '/w/wsp_other/projects/prj_release_1',
    })
    assert.equal(controller.store.getSnapshot().activePath, '/w/wsp_other/projects/prj_release_1')
    assert.equal(controller.store.getSnapshot().frameKey, frameKey)
    await controller.openModule('loop-knowledge')
    assert.equal(bridge.posted.at(-1)?.message.path, '/kb')
    await controller.openModule('loop-projects')
    assert.equal(
      bridge.posted.at(-1)?.message.path,
      '/w/wsp_other/projects/prj_release_1',
    )
    assert.equal(controller.store.getSnapshot().activePath, '/w/wsp_other/projects/prj_release_1')
    assert.equal(await controller.openWorksite({
      loopWorkspaceId: 'wsp_other',
      serviceBaseUrl: 'https://loop.synthetic.test',
    }), true)
    assert.equal(bridge.posted.at(-1)?.message.path, '/w/wsp_other/start-work')
    assert.equal(controller.store.getSnapshot().activePath, '/w/wsp_other/start-work')
    controller.dispose()
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      })
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  }
})

test('a Workspace binding from another Loop server cannot route the shared page', async () => {
  const bridge = fakePageWindow()
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: bridge.fakeWindow,
  })
  try {
    const controller = new LoopGlobalPageController(remote({
      globalServerStatus: async () => ({
        ok: true,
        value: { serverUrl: SERVER_URL, serverRevision: SERVER_REVISION },
      }),
      globalPage: async () => ({ ok: true, value: { url: GLOBAL_PAGE_URL } }),
    }))

    await controller.open()
    controller.attachWorkspacePage(bridge.frame(), GLOBAL_PAGE_URL)
    const posted = bridge.posted.length

    assert.equal(await controller.openProject({
      projectId: 'prj_elsewhere',
      loopWorkspaceId: 'wsp_other',
      serviceBaseUrl: 'https://other.synthetic.test',
    }), false)
    assert.equal(await controller.openProject({
      projectId: 'prj_wrong_prefix',
      loopWorkspaceId: 'wsp_other',
      serviceBaseUrl: 'https://loop.synthetic.test/another-deployment',
    }), false)

    assert.equal(bridge.posted.length, posted)
    assert.equal(controller.store.getSnapshot().activePath, '/tasks/views/related-to-me')
    controller.dispose()
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        value: originalWindow,
      })
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  }
})


test('projects entry uses the remembered workspace instead of the public marketing route', async () => {
  const controller = new LoopGlobalPageController(remote({
    globalServerStatus: async () => ({ ok: true, value: { serverUrl: SERVER_URL, serverRevision: SERVER_REVISION } }),
    globalPage: async () => ({ ok: true, value: { url: GLOBAL_PAGE_URL } }),
    globalServerWorkspaceStatus: async () => ({ ok: true, value: { loopWorkspaceId: 'wsp_selected' } }),
  }))
  await controller.openModule('loop-projects')
  assert.equal(controller.store.getSnapshot().activePath, '/w/wsp_selected/projects')
  controller.dispose()
})

test('projects entry waits for an explicit workspace selection when none is remembered', async () => {
  const bridge = fakePageWindow()
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', { configurable: true, value: bridge.fakeWindow })
  try {
    const controller = new LoopGlobalPageController(remote({
      globalServerStatus: async () => ({ ok: true, value: { serverUrl: SERVER_URL, serverRevision: SERVER_REVISION } }),
      globalPage: async () => ({ ok: true, value: { url: GLOBAL_PAGE_URL } }),
      globalServerWorkspaceStatus: async () => ({ ok: true, value: { loopWorkspaceId: null } }),
      configureGlobalServerWorkspace: async input => ({ ok: true, value: { loopWorkspaceId: input.workspaceId } }),
    }))
    await controller.openModule('loop-projects')
    assert.equal(controller.store.getSnapshot().activePath, '/tasks/views/related-to-me')
    const frame = bridge.frame()
    controller.attachWorkspacePage(frame, GLOBAL_PAGE_URL)
    assert.notEqual(bridge.posted.at(-1)?.message.path, '/workspaces')
    bridge.dispatch(frame, bridge.posted[0]?.message.nonce, 'wsp_selected')
    await waitFor(() => controller.store.getSnapshot().activePath === '/w/wsp_selected/projects')
    controller.dispose()
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
    else Reflect.deleteProperty(globalThis, 'window')
  }
})

test('switching Loop Workspace does not restore another Workspace module path', async () => {
  const bridge = fakePageWindow()
  const originalWindow = globalThis.window
  Object.defineProperty(globalThis, 'window', { configurable: true, value: bridge.fakeWindow })
  try {
    const controller = new LoopGlobalPageController(remote({
      globalServerStatus: async () => ({
        ok: true,
        value: { serverUrl: SERVER_URL, serverRevision: SERVER_REVISION },
      }),
      globalPage: async () => ({ ok: true, value: { url: GLOBAL_PAGE_URL } }),
      globalServerWorkspaceStatus: async () => ({
        ok: true,
        value: { loopWorkspaceId: null },
      }),
      configureGlobalServerWorkspace: async input => ({
        ok: true,
        value: { loopWorkspaceId: input.workspaceId },
      }),
    }))

    await controller.open()
    const frame = bridge.frame()
    controller.attachWorkspacePage(frame, GLOBAL_PAGE_URL)
    const nonce = bridge.posted[0]?.message.nonce
    bridge.dispatch(frame, nonce, 'wsp_alpha')
    await waitFor(() => controller.store.getSnapshot().loopWorkspaceId === 'wsp_alpha')

    for (const listener of bridge.listeners) {
      listener({
        origin: 'https://loop.synthetic.test',
        source: frame,
        data: {
          channel: 'loop.global-page.v2',
          type: 'route',
          nonce,
          revision: SERVER_REVISION,
          path: '/w/wsp_alpha/projects/prj_alpha',
        },
      } as MessageEvent)
    }
    assert.equal(
      controller.store.getSnapshot().activePath,
      '/w/wsp_alpha/projects/prj_alpha',
    )

    bridge.dispatch(frame, nonce, 'wsp_beta')
    await waitFor(() => controller.store.getSnapshot().loopWorkspaceId === 'wsp_beta')
    await controller.openModule('loop-projects')

    assert.equal(bridge.posted.at(-1)?.message.path, '/w/wsp_beta/projects')
    assert.equal(controller.store.getSnapshot().activePath, '/w/wsp_beta/projects')
    controller.dispose()
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow })
    } else {
      Reflect.deleteProperty(globalThis, 'window')
    }
  }
})

test('only OAuth status mounts the page; revocation detaches it and polling preserves a healthy frame', async () => {
  let state: 'signed_in' | 'signed_out' | 'needs_auth' = 'signed_out'
  let pages = 0
  const controller = new LoopGlobalPageController(remote({
    globalServerStatus: async () => ({ok: true, value: {serverUrl: SERVER_URL,
      serverRevision: SERVER_REVISION, connection: {state}}}),
    globalPage: async () => { pages++; return {ok: true, value: {url: GLOBAL_PAGE_URL}} },
  }))
  await controller.open()
  assert.equal(pages, 0)
  assert.equal(controller.store.getSnapshot().page, null)
  state = 'signed_in'
  await controller.refreshConnection()
  assert.equal(pages, 1)
  const frameKey = controller.store.getSnapshot().frameKey
  await controller.refreshConnection()
  assert.equal(pages, 1)
  assert.equal(controller.store.getSnapshot().frameKey, frameKey)
  state = 'needs_auth'
  await controller.refreshConnection()
  assert.equal(controller.store.getSnapshot().page, null)
  assert.equal(controller.sharedData.store.getSnapshot().identity, null)
  controller.dispose()
})

test('sign-out immediately drops the iframe and rejects an older page response', async () => {
  const pending = deferred<{ok: true; value: {url: string}}>()
  const controller = new LoopGlobalPageController(remote({
    globalServerStatus: async () => ({ok: true, value: {serverUrl: SERVER_URL,
      serverRevision: SERVER_REVISION, connection: {state: 'signed_in'}}}),
    globalPage: () => pending.promise,
  }))
  const opening = controller.open()
  await waitFor(() => controller.store.getSnapshot().connection?.state === 'signed_in')
  controller.suspend()
  pending.resolve({ok: true, value: {url: GLOBAL_PAGE_URL}})
  await opening
  assert.equal(controller.store.getSnapshot().page, null)
  assert.equal(controller.store.getSnapshot().connection?.state, 'signing_out')
  controller.dispose()
})

test('expired panel renews through Host without a second login and rejects stale recovery messages', async () => {
  const originalWindow = globalThis.window
  const bridge = fakePageWindow()
  Object.defineProperty(globalThis, 'window', {configurable: true, value: bridge.fakeWindow})
  let pages = 0
  const controller = new LoopGlobalPageController(remote({
    globalServerStatus: async () => ({ok: true, value: {serverUrl: SERVER_URL,
      serverRevision: SERVER_REVISION, connection: {state: 'signed_in'}}}),
    globalPage: async () => { pages++; return {ok: true, value: {url: GLOBAL_PAGE_URL}} },
  }))
  try {
    await controller.open()
    controller.store.set({...controller.store.getSnapshot(), activePath: '/w/wsp_alpha/tasks'})
    const frame = bridge.frame()
    controller.attachWorkspacePage(frame, GLOBAL_PAGE_URL)
    const nonce = bridge.posted[0]?.message.nonce
    const notify = (source: Window, token: unknown) => {
      for (const listener of bridge.listeners) listener({
        source, origin: 'https://loop.synthetic.test',
        data: {channel: 'loop.global-page.v2', type: 'workspace-cleared', nonce: token, revision: SERVER_REVISION},
      } as MessageEvent)
    }
    notify(frame, 'stale-nonce')
    notify(bridge.frame(), nonce)
    assert.equal(pages, 1)
    notify(frame, nonce)
    await waitFor(() => pages === 2 && controller.store.getSnapshot().screen === 'ready')
    assert.equal(controller.store.getSnapshot().activePath, '/w/wsp_alpha/tasks')
    assert.equal(controller.store.getSnapshot().connection?.state, 'signed_in')
    // The new frame may still be blocked by browser cookie policy. Repeated
    // signals must not become an unbounded reload or open an OAuth flow.
    const nextFrame = bridge.frame()
    controller.attachWorkspacePage(nextFrame, GLOBAL_PAGE_URL)
    const nextNonce = bridge.posted.at(-1)?.message.nonce
    notify(frame, nonce)
    notify(nextFrame, nextNonce)
    await Promise.resolve()
    assert.equal(pages, 2)
  } finally {
    controller.dispose()
    if (originalWindow) Object.defineProperty(globalThis, 'window', {configurable: true, value: originalWindow})
    else Reflect.deleteProperty(globalThis, 'window')
  }
})
