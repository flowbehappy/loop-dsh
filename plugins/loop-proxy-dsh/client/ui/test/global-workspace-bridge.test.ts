import test from 'node:test'
import assert from 'node:assert/strict'
import {
  GLOBAL_WORKSPACE_BRIDGE_CHANNEL,
  bindLocaleForHarness,
  globalWorkspaceBridgeInit,
  globalWorkspaceBridgeLocale,
  globalWorkspaceBridgeNavigate,
  isGlobalWorkspaceBridgeReady,
  isGlobalWorkspaceBridgeNonce,
  newGlobalWorkspaceBridgeNonce,
  normalizedLoopLocale,
  readGlobalWorkspaceBridgeRoute,
  readGlobalWorkspaceBridgeSelection,
  sanitizedLoopPagePath,
} from '../global-workspace-bridge.ts'

const nonce = '0123456789abcdef0123456789abcdef'
const revision = 'rev-server-a'

test('accepts a workspace only from the current frame, origin, and nonce', () => {
  const source = {} as Window
  const event = {
    origin: 'https://loop.synthetic.test',
    source,
    data: {
      channel: GLOBAL_WORKSPACE_BRIDGE_CHANNEL,
      type: 'workspace',
      nonce,
      revision,
      workspaceId: 'wsp_alpha',
      workspaceName: ' Alpha ',
    },
  } as MessageEvent

  assert.deepEqual(readGlobalWorkspaceBridgeSelection(event, {
    origin: 'https://loop.synthetic.test',
    source,
    nonce,
    revision,
  }), {
    workspaceId: 'wsp_alpha',
    workspaceName: 'Alpha',
  })
  assert.equal(readGlobalWorkspaceBridgeSelection({ ...event, origin: 'https://evil.test' } as MessageEvent, {
    origin: 'https://loop.synthetic.test',
    source,
    nonce,
    revision,
  }), null)
  assert.equal(readGlobalWorkspaceBridgeSelection({ ...event, source: {} as Window } as MessageEvent, {
    origin: 'https://loop.synthetic.test',
    source,
    nonce,
    revision,
  }), null)
  assert.equal(readGlobalWorkspaceBridgeSelection({
    ...event,
    data: { ...event.data, nonce: 'stale-nonce' },
  } as MessageEvent, {
    origin: 'https://loop.synthetic.test',
    source,
    nonce,
    revision,
  }), null)
})

test('rejects malformed workspace IDs and nonces', () => {
  const source = {} as Window
  assert.equal(readGlobalWorkspaceBridgeSelection({
    origin: 'https://loop.synthetic.test',
    source,
    data: {
      channel: GLOBAL_WORKSPACE_BRIDGE_CHANNEL,
      type: 'workspace',
      nonce,
      revision,
      workspaceId: '../../escape',
      workspaceName: 'Alpha',
    },
  } as MessageEvent, {
    origin: 'https://loop.synthetic.test',
    source,
    nonce,
    revision,
  }), null)
  assert.equal(isGlobalWorkspaceBridgeNonce(nonce), true)
  assert.equal(isGlobalWorkspaceBridgeNonce('short'), false)
  assert.match(newGlobalWorkspaceBridgeNonce(), /^[A-Za-z0-9_-]{16,128}$/u)
})

test('accepts readiness only from the current frame and origin', () => {
  const source = {} as Window
  const ready = {
    origin: 'https://loop.synthetic.test',
    source,
    data: {
      channel: GLOBAL_WORKSPACE_BRIDGE_CHANNEL,
      type: 'ready',
    },
  } as MessageEvent

  assert.equal(isGlobalWorkspaceBridgeReady(ready, {
    origin: 'https://loop.synthetic.test',
    source,
  }), true)
  assert.equal(isGlobalWorkspaceBridgeReady({ ...ready, origin: 'https://evil.test' } as MessageEvent, {
    origin: 'https://loop.synthetic.test',
    source,
  }), false)
  assert.equal(isGlobalWorkspaceBridgeReady({ ...ready, source: {} as Window } as MessageEvent, {
    origin: 'https://loop.synthetic.test',
    source,
  }), false)
})

test('builds revision-bound init, locale, and navigation messages', () => {
  assert.deepEqual(globalWorkspaceBridgeInit(nonce, revision, '/tasks', 'zh-CN'), {
    channel: GLOBAL_WORKSPACE_BRIDGE_CHANNEL,
    type: 'init',
    nonce,
    revision,
    path: '/tasks',
    locale: 'zh-CN',
  })
  assert.deepEqual(globalWorkspaceBridgeNavigate(nonce, revision, '/kb/base'), {
    channel: GLOBAL_WORKSPACE_BRIDGE_CHANNEL,
    type: 'navigate',
    nonce,
    revision,
    path: '/kb/base',
  })
  assert.deepEqual(globalWorkspaceBridgeLocale(nonce, revision, 'en'), {
    channel: GLOBAL_WORKSPACE_BRIDGE_CHANNEL,
    type: 'locale',
    nonce,
    revision,
    locale: 'en',
  })
})

test('normalizes Harness locale aliases to Loop locales', () => {
  assert.equal(normalizedLoopLocale('zh'), 'zh-CN')
  assert.equal(normalizedLoopLocale('zh-Hans'), 'zh-CN')
  assert.equal(normalizedLoopLocale('zh-TW'), 'zh-TW')
  assert.equal(normalizedLoopLocale('zh-Hant-HK'), 'zh-TW')
  assert.equal(normalizedLoopLocale('en-US'), 'en')
  assert.equal(normalizedLoopLocale('ja'), 'ja')
  assert.equal(normalizedLoopLocale('fr'), null)
  assert.equal(normalizedLoopLocale(null), null)
})

test('maps Harness locale to the optional beginBind callback locale', () => {
  assert.equal(bindLocaleForHarness('zh'), 'zh')
  assert.equal(bindLocaleForHarness('zh-CN'), 'zh')
  assert.equal(bindLocaleForHarness('zh-TW'), 'zh')
  assert.equal(bindLocaleForHarness('en-US'), 'en')
  assert.equal(bindLocaleForHarness('ja'), undefined)
  assert.equal(bindLocaleForHarness(null), undefined)
})

test('accepts route updates only from the current frame, origin, nonce, and revision', () => {
  const source = {} as Window
  const event = {
    origin: 'https://loop.synthetic.test',
    source,
    data: {
      channel: GLOBAL_WORKSPACE_BRIDGE_CHANNEL,
      type: 'route',
      nonce,
      revision,
      path: '/tasks/by-id/tsk_1?tab=activity',
    },
  } as MessageEvent
  const expected = {
    origin: 'https://loop.synthetic.test',
    source,
    nonce,
    revision,
  }
  assert.equal(
    readGlobalWorkspaceBridgeRoute(event, expected),
    '/tasks/by-id/tsk_1?tab=activity',
  )
  assert.equal(
    readGlobalWorkspaceBridgeRoute({
      ...event,
      data: { ...event.data, revision: 'rev-stale' },
    } as MessageEvent, expected),
    null,
  )
  assert.equal(
    readGlobalWorkspaceBridgeRoute({
      ...event,
      source: {} as Window,
    } as MessageEvent, expected),
    null,
  )
})

test('only accepts relative in-app page paths', () => {
  assert.equal(sanitizedLoopPagePath('/tasks?view=mine#top'), '/tasks?view=mine#top')
  assert.equal(sanitizedLoopPagePath('https://evil.test/tasks'), null)
  assert.equal(sanitizedLoopPagePath('//evil.test/tasks'), null)
  assert.equal(sanitizedLoopPagePath('/tasks\\..\\escape'), null)
  assert.equal(sanitizedLoopPagePath('/tasks\ninjected'), null)
})
