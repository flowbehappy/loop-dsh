import test from 'node:test'
import assert from 'node:assert/strict'

import type {ModelSelectionProjection} from '@deepseek-ai/dsh-api-session-controller/types'
import {
  retainModelSelectionObservation,
  SessionModelSelectionAdapter,
  type ModelSelectionObservation,
  type SessionModelSelectionPorts,
} from '../session-model-selection.ts'
import type {ModelChoice} from '../model-controller.ts'

const choice: ModelChoice = {
  kind: 'loop',
  connectionId: 'eag_alpha',
  workspaceId: 'wsp_alpha',
  providerId: 'provider-route',
  providerName: 'Loop · Alpha',
  modelId: 'picker-model',
  modelName: 'Model A',
}

function observation(
  initial: ModelSelectionProjection,
): ModelSelectionObservation & {
  set(next: ModelSelectionProjection): void
  readonly releaseCount: number
} {
  let value = initial
  let releaseCount = 0
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    release() {
      releaseCount += 1
      listeners.clear()
    },
    set(next) {
      value = next
      for (const listener of listeners) listener()
    },
    get releaseCount() {
      return releaseCount
    },
  }
}

function ports(overrides: Partial<SessionModelSelectionPorts> = {}): SessionModelSelectionPorts {
  return {
    selectModel: async input => ({
      ok: true,
      value: {selected: {provider: input.provider, model: input.model}},
    }),
    observeModelSelection: () => observation({
      next: {provider: choice.providerId, model: choice.modelId},
      lastUsed: null,
    }),
    ...overrides,
  }
}

test('projection face failure releases the retained Session reference', () => {
  let releases = 0
  assert.throws(() => retainModelSelectionObservation({
    retain: () => ({
      binding: {
        session: {
          projections: {
            faceOf() {
              throw new Error('generation changed')
            },
          },
        },
      },
      release() {
        releases += 1
      },
    }),
  } as never, 'session-existing' as never))
  assert.equal(releases, 1)
})

test('an existing Session selects through the official owner and confirms its exact projection', async () => {
  const selectedSessions: string[] = []
  const adapter = new SessionModelSelectionAdapter(ports({
    selectModel: async input => {
      selectedSessions.push(input.sessionId)
      return {
        ok: true,
        value: {selected: {provider: input.provider, model: input.model}},
      }
    },
  }))
  assert.equal((await adapter.select({
    sessionId: 'session-existing',
    choice,
  })).ok, true)
  assert.deepEqual(selectedSessions, ['session-existing'])
})

test('projection timeout is retryable on the same existing Session without another Session', async () => {
  let selectCount = 0
  const adapter = new SessionModelSelectionAdapter(ports({
    selectModel: async selected => {
      selectCount += 1
      return {
        ok: true,
        value: {selected: {provider: selected.provider, model: selected.model}},
      }
    },
    observeModelSelection: () => observation({
      next: selectCount === 1
        ? null
        : {provider: choice.providerId, model: choice.modelId},
      lastUsed: null,
    }),
    projectionTimeoutMs: 0,
  }))
  const input = {sessionId: 'session-existing', choice}
  assert.equal((await adapter.select(input)).ok, false)
  assert.equal((await adapter.select(input)).ok, true)
  assert.equal(selectCount, 2)
})

test('cancellation before the explicit action sends no Session RPC', async () => {
  let selectCount = 0
  let observeCount = 0
  const adapter = new SessionModelSelectionAdapter(ports({
    selectModel: async selected => {
      selectCount += 1
      return {
        ok: true,
        value: {selected: {provider: selected.provider, model: selected.model}},
      }
    },
    observeModelSelection: () => {
      observeCount += 1
      return observation({next: null, lastUsed: null})
    },
  }))
  const controller = new AbortController()
  controller.abort()
  assert.equal((await adapter.select({
    sessionId: 'session-existing',
    choice,
  }, controller.signal)).ok, false)
  assert.equal(selectCount, 0)
  assert.equal(observeCount, 0)
})

test('cancellation releases a projection wait and ignores its late exact value', async () => {
  const delayed = observation({next: null, lastUsed: null})
  const adapter = new SessionModelSelectionAdapter(ports({
    observeModelSelection: () => delayed,
  }))
  const controller = new AbortController()
  const pending = adapter.select({
    sessionId: 'session-existing',
    choice,
  }, controller.signal)
  await new Promise(resolve => setTimeout(resolve, 0))
  controller.abort()
  assert.equal((await pending).ok, false)
  assert.equal(delayed.releaseCount, 1)
  delayed.set({
    next: {provider: choice.providerId, model: choice.modelId},
    lastUsed: null,
  })
})
