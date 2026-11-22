import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LoopSharedDataRuntime,
  readSharedDataMessage,
} from '../client/ui/shared-data-runtime.ts'

const nonce = '0123456789abcdef0123456789abcdef'
const revision = 'rev-server-a'
const identity = {
  workspaceId: 'wsp_alpha',
  principalId: 'usr_alice',
  authEpoch: 'auth-1-0-active',
}
const data = {
  unread: { status: 'ready', total: 3, conversationCount: 2 },
  connection: {
    phase: 'connected',
    attempt: 1,
    since: 100,
    connectedAt: 100,
    retryAt: null,
  },
}

function message(overrides = {}) {
  return {
    data: {
      channel: 'loop.global-page.v2',
      type: 'data-snapshot',
      nonce,
      revision,
      schemaVersion: 1,
      subscriptionId: 'shared_1',
      ...identity,
      sequence: 1,
      data,
      ...overrides,
    },
  }
}

const expected = {
  nonce,
  revision,
  subscriptionId: 'shared_1',
  identity,
}

test('parses a bounded snapshot and rejects stale identity or schema', () => {
  assert.deepEqual(readSharedDataMessage(message(), expected), {
    type: 'snapshot',
    identity,
    subscriptionId: 'shared_1',
    sequence: 1,
    data,
  })
  assert.equal(readSharedDataMessage(message({
    principalId: 'usr_mallory',
  }), expected), null)
  assert.equal(readSharedDataMessage(message({
    schemaVersion: 2,
  }), expected), null)
  assert.deepEqual(readSharedDataMessage(message({
    data: { ...data, messages: [{ content: 'not allowed' }] },
  }), expected)?.data, data)
})

test('keeps one baseline and applies contiguous deltas without a gap', () => {
  const runtime = new LoopSharedDataRuntime()
  runtime.selectIdentity(identity)
  runtime.beginSubscription(identity, 'shared_1')
  assert.equal(
    runtime.accept(readSharedDataMessage(message(), expected)),
    'accepted'
  )

  assert.equal(runtime.accept({
    type: 'delta',
    identity,
    subscriptionId: 'shared_1',
    baseSequence: 1,
    sequence: 2,
    changes: {
      unread: { status: 'ready', total: 7, conversationCount: 4 },
    },
  }), 'accepted')
  assert.deepEqual(runtime.query(), {
    phase: 'ready',
    identity,
    subscriptionId: 'shared_1',
    sequence: 2,
    data: {
      unread: { status: 'ready', total: 7, conversationCount: 4 },
      connection: data.connection,
    },
    reason: null,
  })

  assert.equal(runtime.accept({
    type: 'delta',
    identity,
    subscriptionId: 'shared_1',
    baseSequence: 3,
    sequence: 4,
    changes: {
      unread: { status: 'ready', total: 8, conversationCount: 4 },
    },
  }), 'resync')
  assert.equal(runtime.query().phase, 'resyncing')
  assert.equal(runtime.query().sequence, 2)

  runtime.beginSubscription(identity, 'shared_2')
  assert.equal(runtime.query().phase, 'resyncing')
  assert.deepEqual(runtime.query().data?.unread, {
    status: 'ready',
    total: 7,
    conversationCount: 4,
  })
  const baseline = readSharedDataMessage(message({
    subscriptionId: 'shared_2',
    data: {
      unread: { status: 'ready', total: 9, conversationCount: 5 },
      connection: data.connection,
    },
  }), {
    ...expected,
    subscriptionId: 'shared_2',
  })
  assert.equal(runtime.accept(baseline), 'accepted')
  assert.equal(runtime.query().phase, 'ready')
  assert.deepEqual(runtime.query().data?.unread, {
    status: 'ready',
    total: 9,
    conversationCount: 5,
  })
})

test('drops a late snapshot from an old authority epoch for the same member', () => {
  const runtime = new LoopSharedDataRuntime()
  runtime.selectIdentity(identity)
  runtime.beginSubscription(identity, 'shared_1')
  runtime.accept(readSharedDataMessage(message(), expected))
  const nextIdentity = {
    ...identity,
    authEpoch: 'auth-1-1-active',
  }
  runtime.selectIdentity(nextIdentity)
  assert.equal(
    runtime.accept(readSharedDataMessage(message(), expected)),
    'ignored'
  )
  assert.equal(runtime.query().identity?.authEpoch, nextIdentity.authEpoch)
  assert.equal(runtime.query().data, null)
})

test('a not-ready unread snapshot does not erase the last ready badge', () => {
  const runtime = new LoopSharedDataRuntime()
  runtime.selectIdentity(identity)
  runtime.beginSubscription(identity, 'shared_1')
  runtime.accept(readSharedDataMessage(message(), expected))

  runtime.beginSubscription(identity, 'shared_2')
  const notReady = readSharedDataMessage(message({
    subscriptionId: 'shared_2',
    data: {
      unread: { status: 'not-ready' },
      connection: data.connection,
    },
  }), {
    ...expected,
    subscriptionId: 'shared_2',
  })
  assert.equal(runtime.accept(notReady), 'accepted')
  assert.deepEqual(runtime.query().data?.unread, {
    status: 'ready',
    total: 3,
    conversationCount: 2,
  })

  assert.equal(runtime.accept({
    type: 'delta',
    identity,
    subscriptionId: 'shared_2',
    baseSequence: 1,
    sequence: 2,
    changes: {
      unread: { status: 'ready', total: 0, conversationCount: 0 },
    },
  }), 'accepted')
  assert.deepEqual(runtime.query().data?.unread, {
    status: 'ready',
    total: 0,
    conversationCount: 0,
  })
})

test('distinguishes an unavailable source from an ignored stale message', () => {
  const runtime = new LoopSharedDataRuntime()
  runtime.selectIdentity(identity)
  runtime.beginSubscription(identity, 'shared_1')
  const unavailable = readSharedDataMessage(message({
    type: 'data-unavailable',
    reason: 'source-unavailable',
    sequence: undefined,
    data: undefined,
  }), expected)
  assert.deepEqual(unavailable, {
    type: 'unavailable',
    identity,
    subscriptionId: 'shared_1',
    reason: 'source-unavailable',
  })
  assert.equal(runtime.accept(unavailable), 'accepted')
  assert.equal(runtime.query().phase, 'unavailable')
  assert.equal(runtime.query().data, null)
})

test('surfaces missing authorization and resets when a new page attaches', () => {
  const runtime = new LoopSharedDataRuntime()
  runtime.disconnect('authorization-required')
  assert.equal(runtime.query().phase, 'unavailable')
  assert.equal(runtime.query().reason, 'authorization-required')
  assert.equal(runtime.selectIdentity(null), true)
  assert.equal(runtime.query().phase, 'idle')
})
