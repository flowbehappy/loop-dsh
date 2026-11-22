import assert from 'node:assert/strict'
import test from 'node:test'

import { LoopGlobalPageController } from '../client/ui/global-page-controller.ts'

const channel = 'loop.global-page.v2'
const revision = 'rev-server-a'
const origin = 'https://loop.example.test'
const identity = {
  workspaceId: 'wsp_alpha',
  principalId: 'usr_alice',
  authEpoch: 'auth-1-0-active',
}
const sharedData = {
  unread: { status: 'ready', total: 3, conversationCount: 2 },
  connection: {
    phase: 'connected',
    attempt: 1,
    since: 100,
    connectedAt: 100,
    retryAt: null,
  },
}

function fakeWindow() {
  const listeners = new Set()
  return {
    addEventListener(type, listener) {
      if (type === 'message') listeners.add(listener)
    },
    removeEventListener(type, listener) {
      if (type === 'message') listeners.delete(listener)
    },
    dispatch(data) {
      for (const listener of [...listeners]) {
        listener({ data, origin, source: frame })
      }
    },
  }
}

const frame = {
  posts: [],
  postMessage(data, targetOrigin) {
    this.posts.push({ data, targetOrigin })
  },
}

test('resubscribes for a baseline after a gap and rejects the old subscription', async () => {
  const previousWindow = globalThis.window
  const window = fakeWindow()
  globalThis.window = window
  frame.posts = []
  const remote = {
    async configureGlobalServerWorkspace() {
      return { ok: true, value: { loopWorkspaceId: identity.workspaceId } }
    },
  }
  const controller = new LoopGlobalPageController(remote)
  controller.store.set({
    ...controller.store.getSnapshot(),
    screen: 'ready',
    page: { url: `${origin}/external-host/page-session` },
    serverUrl: origin,
    serverRevision: revision,
  })

  try {
    controller.attachWorkspacePage(frame, `${origin}/external-host/page-session`)
    const init = frame.posts.find(post => post.data.type === 'init')
    assert.ok(init)
    const nonce = init.data.nonce

    window.dispatch({
      channel,
      type: 'workspace',
      nonce,
      revision,
      workspaceId: identity.workspaceId,
      workspaceName: 'Alpha',
      principalId: identity.principalId,
      authEpoch: identity.authEpoch,
    })
    await Promise.resolve()

    const subscribe = frame.posts.at(-1)
    assert.equal(subscribe.data.type, 'data-subscribe')
    const firstSubscription = subscribe.data.subscriptionId

    window.dispatch({
      channel,
      type: 'data-snapshot',
      nonce,
      revision,
      schemaVersion: 1,
      subscriptionId: firstSubscription,
      ...identity,
      sequence: 1,
      data: sharedData,
    })
    assert.equal(controller.sharedData.query().phase, 'ready')
    assert.deepEqual(controller.sharedData.query().data?.unread, {
      status: 'ready',
      total: 3,
      conversationCount: 2,
    })

    window.dispatch({
      channel,
      type: 'data-delta',
      nonce,
      revision,
      schemaVersion: 1,
      subscriptionId: firstSubscription,
      ...identity,
      baseSequence: 8,
      sequence: 9,
      changes: {
        unread: { status: 'ready', total: 4, conversationCount: 2 },
      },
    })
    const secondSubscribe = frame.posts.at(-1)
    assert.equal(secondSubscribe.data.type, 'data-subscribe')
    assert.notEqual(secondSubscribe.data.subscriptionId, firstSubscription)
    assert.equal(controller.sharedData.query().phase, 'resyncing')

    window.dispatch({
      channel,
      type: 'data-snapshot',
      nonce,
      revision,
      schemaVersion: 1,
      subscriptionId: firstSubscription,
      ...identity,
      sequence: 2,
      data: sharedData,
    })
    assert.equal(controller.sharedData.query().phase, 'resyncing')

    window.dispatch({
      channel,
      type: 'data-snapshot',
      nonce,
      revision,
      schemaVersion: 1,
      subscriptionId: secondSubscribe.data.subscriptionId,
      ...identity,
      sequence: 1,
      data: sharedData,
    })
    assert.equal(controller.sharedData.query().phase, 'ready')
  } finally {
    controller.dispose()
    globalThis.window = previousWindow
  }
})
