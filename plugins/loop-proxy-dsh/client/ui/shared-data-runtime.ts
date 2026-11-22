/** Identity-fenced Human page projections shared by native Loop modules. */

import {
  createSnapshotStore,
  type MutableSnapshotStore,
  type ObservableSnapshot,
} from './store.ts'

export const SHARED_DATA_SCHEMA_VERSION = 1

export const SHARED_DATA_CHANNEL = 'loop.global-page.v2'

export type SharedDataIdentity = {
  readonly workspaceId: string
  readonly principalId: string
  readonly authEpoch: string
}

export type SharedUnreadSummary =
  | { readonly status: 'not-ready' }
  | {
      readonly status: 'ready'
      readonly total: number
      readonly conversationCount: number | null
    }

export type SharedConnectionState = {
  readonly phase: 'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  readonly attempt: number
  readonly since: number
  readonly connectedAt: number | null
  readonly retryAt: number | null
}

export type SharedWorkspaceData = {
  readonly unread: SharedUnreadSummary
  readonly connection: SharedConnectionState
}

export type SharedDataPhase =
  | 'idle'
  | 'waiting'
  | 'ready'
  | 'resyncing'
  | 'unavailable'

export type SharedDataState = {
  readonly phase: SharedDataPhase
  readonly identity: SharedDataIdentity | null
  readonly subscriptionId: string
  readonly sequence: number
  readonly data: SharedWorkspaceData | null
  readonly reason: string | null
}

export type SharedDataMessage =
  | {
      readonly type: 'snapshot'
      readonly identity: SharedDataIdentity
      readonly subscriptionId: string
      readonly sequence: number
      readonly data: SharedWorkspaceData
    }
  | {
      readonly type: 'delta'
      readonly identity: SharedDataIdentity
      readonly subscriptionId: string
      readonly baseSequence: number
      readonly sequence: number
      readonly changes: {
        readonly unread?: SharedUnreadSummary
        readonly connection?: SharedConnectionState
      }
    }
  | {
      readonly type: 'unavailable'
      readonly identity: SharedDataIdentity
      readonly subscriptionId: string
      readonly reason: string
    }

export type SharedDataAcceptance =
  | 'accepted'
  | 'ignored'
  | 'resync'

export const INITIAL_SHARED_DATA_STATE: SharedDataState = Object.freeze({
  phase: 'idle',
  identity: null,
  subscriptionId: '',
  sequence: 0,
  data: null,
  reason: null,
})

const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u
const EPOCH = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,255}$/u
const SUBSCRIPTION = /^[A-Za-z0-9_-]{1,128}$/u

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function nullableTimestamp(value: unknown): number | null | undefined {
  if (value === null) return null
  return nonnegativeInteger(value) ? value : undefined
}

function readIdentity(value: Record<string, unknown>): SharedDataIdentity | null {
  if (
    typeof value.workspaceId !== 'string' ||
    !ID.test(value.workspaceId) ||
    typeof value.principalId !== 'string' ||
    !ID.test(value.principalId) ||
    typeof value.authEpoch !== 'string' ||
    !EPOCH.test(value.authEpoch)
  ) {
    return null
  }
  return {
    workspaceId: value.workspaceId,
    principalId: value.principalId,
    authEpoch: value.authEpoch,
  }
}

function readUnread(value: unknown): SharedUnreadSummary | null {
  const input = record(value)
  if (input?.status === 'not-ready') return { status: 'not-ready' }
  if (input?.status !== 'ready' ||
      !nonnegativeInteger(input.total) ||
      (input.conversationCount !== null &&
        !nonnegativeInteger(input.conversationCount))) {
    return null
  }
  return {
    status: 'ready',
    total: input.total,
    conversationCount: input.conversationCount,
  }
}

function mergeUnread(
  current: SharedUnreadSummary | null,
  incoming: SharedUnreadSummary,
): SharedUnreadSummary {
  if (incoming.status === 'ready') return incoming
  return current?.status === 'ready' ? current : incoming
}

function readConnection(value: unknown): SharedConnectionState | null {
  const input = record(value)
  if (input === null) return null
  const connectedAt = nullableTimestamp(input.connectedAt)
  const retryAt = nullableTimestamp(input.retryAt)
  if (
    (input.phase !== 'connecting' &&
      input.phase !== 'connected' &&
      input.phase !== 'reconnecting' &&
      input.phase !== 'disconnected') ||
    !nonnegativeInteger(input.attempt) ||
    !nonnegativeInteger(input.since) ||
    connectedAt === undefined ||
    retryAt === undefined
  ) {
    return null
  }
  return {
    phase: input.phase,
    attempt: input.attempt,
    since: input.since,
    connectedAt,
    retryAt,
  }
}

function readData(value: unknown): SharedWorkspaceData | null {
  const input = record(value)
  if (input === null) return null
  const unread = readUnread(input.unread)
  const connection = readConnection(input.connection)
  return unread === null || connection === null ? null : { unread, connection }
}

function sameIdentity(
  left: SharedDataIdentity | null,
  right: SharedDataIdentity,
): boolean {
  return left !== null &&
    left.workspaceId === right.workspaceId &&
    left.principalId === right.principalId &&
    left.authEpoch === right.authEpoch
}

/**
 * Parse only the bounded shared-data messages emitted by the persistent Loop
 * page. Origin/frame checks remain the caller's responsibility.
 */
export function readSharedDataMessage(
  event: Pick<MessageEvent, 'data'>,
  expected: {
    readonly nonce: string
    readonly revision: string
    readonly subscriptionId: string
    readonly identity: SharedDataIdentity
  },
): SharedDataMessage | null {
  const value = record(event.data)
  if (
    value === null ||
    value.channel !== SHARED_DATA_CHANNEL ||
    value.nonce !== expected.nonce ||
    value.revision !== expected.revision ||
    value.schemaVersion !== SHARED_DATA_SCHEMA_VERSION ||
    typeof value.subscriptionId !== 'string' ||
    !SUBSCRIPTION.test(value.subscriptionId) ||
    value.subscriptionId !== expected.subscriptionId
  ) {
    return null
  }
  const identity = readIdentity(value)
  if (
    identity === null ||
    !sameIdentity(identity, expected.identity)
  ) {
    return null
  }
  if (value.type === 'data-snapshot') {
    const data = readData(value.data)
    if (data === null || !nonnegativeInteger(value.sequence)) return null
    return {
      type: 'snapshot',
      identity,
      subscriptionId: value.subscriptionId,
      sequence: value.sequence,
      data,
    }
  }
  if (value.type === 'data-delta') {
    const changes = record(value.changes)
    if (
      changes === null ||
      !nonnegativeInteger(value.baseSequence) ||
      !nonnegativeInteger(value.sequence)
    ) {
      return null
    }
    const unread = changes.unread === undefined
      ? undefined
      : readUnread(changes.unread)
    const connection = changes.connection === undefined
      ? undefined
      : readConnection(changes.connection)
    if (
      (changes.unread !== undefined && unread === null) ||
      (changes.connection !== undefined && connection === null) ||
      (unread === undefined && connection === undefined)
    ) {
      return null
    }
    return {
      type: 'delta',
      identity,
      subscriptionId: value.subscriptionId,
      baseSequence: value.baseSequence,
      sequence: value.sequence,
      changes: {
        ...(unread == null ? {} : { unread }),
        ...(connection == null ? {} : { connection }),
      },
    }
  }
  if (value.type === 'data-unavailable') {
    if (
      typeof value.reason !== 'string' ||
      value.reason.length === 0 ||
      value.reason.length > 80
    ) {
      return null
    }
    return {
      type: 'unavailable',
      identity,
      subscriptionId: value.subscriptionId,
      reason: value.reason,
    }
  }
  return null
}

/**
 * Root query/subscribe surface for native Loop consumers. It stores only the
 * latest bounded projection and asks the page for a new baseline on a gap.
 */
export class LoopSharedDataRuntime {
  readonly store: ObservableSnapshot<SharedDataState>
  private readonly mutableStore: MutableSnapshotStore<SharedDataState>

  constructor() {
    this.mutableStore = createSnapshotStore(INITIAL_SHARED_DATA_STATE)
    this.store = this.mutableStore
  }

  query(): SharedDataState {
    return this.mutableStore.getSnapshot()
  }

  subscribe(listener: () => void): () => void {
    return this.mutableStore.subscribe(listener)
  }

  selectIdentity(identity: SharedDataIdentity | null): boolean {
    const current = this.mutableStore.getSnapshot()
    if (identity === null) {
      if (current.identity === null && current.phase === 'idle') return false
      this.mutableStore.set(INITIAL_SHARED_DATA_STATE)
      return true
    }
    if (
      current.identity?.workspaceId === identity?.workspaceId &&
      current.identity?.principalId === identity?.principalId &&
      current.identity?.authEpoch === identity?.authEpoch
    ) {
      return false
    }
    this.mutableStore.set({
      ...INITIAL_SHARED_DATA_STATE,
      phase: identity === null ? 'idle' : 'waiting',
      identity,
    })
    return true
  }

  beginSubscription(
    identity: SharedDataIdentity,
    subscriptionId: string,
  ): void {
    if (!SUBSCRIPTION.test(subscriptionId)) return
    const current = this.mutableStore.getSnapshot()
    if (!sameIdentity(current.identity, identity)) return
    const replacingSubscription = current.subscriptionId !== ''
    this.mutableStore.set({
      phase: replacingSubscription ? 'resyncing' : 'waiting',
      identity,
      subscriptionId,
      sequence: 0,
      data: current.data,
      reason: current.reason,
    })
  }

  accept(message: SharedDataMessage): SharedDataAcceptance {
    const current = this.mutableStore.getSnapshot()
    if (
      !sameIdentity(current.identity, message.identity) ||
      current.subscriptionId !== message.subscriptionId
    ) {
      return 'ignored'
    }
    if (message.type === 'unavailable') {
      this.mutableStore.set({
        ...current,
        phase: 'unavailable',
        data: null,
        sequence: 0,
        reason: message.reason,
      })
      return 'accepted'
    }
    if (message.type === 'snapshot') {
      const replacingSubscription = current.sequence === 0
      if (!replacingSubscription &&
          current.data !== null &&
          message.sequence <= current.sequence) {
        return 'ignored'
      }
      this.mutableStore.set({
        phase: 'ready',
        identity: current.identity,
        subscriptionId: current.subscriptionId,
        sequence: message.sequence,
        data: {
          ...message.data,
          unread: mergeUnread(
            current.data?.unread ?? null,
            message.data.unread,
          ),
        },
        reason: null,
      })
      return 'accepted'
    }
    if (message.sequence <= current.sequence) return 'ignored'
    if (current.data === null || message.baseSequence !== current.sequence) {
      this.mutableStore.set({
        ...current,
        phase: 'resyncing',
      })
      return 'resync'
    }
    if (message.sequence !== current.sequence + 1) {
      this.mutableStore.set({
        ...current,
        phase: 'resyncing',
      })
      return 'resync'
    }
    this.mutableStore.set({
      phase: 'ready',
      identity: current.identity,
      subscriptionId: current.subscriptionId,
      sequence: message.sequence,
      data: {
        unread: mergeUnread(current.data.unread, message.changes.unread ??
          current.data.unread),
        connection: message.changes.connection ?? current.data.connection,
      },
      reason: null,
    })
    return 'accepted'
  }

  disconnect(reason: string): void {
    const current = this.mutableStore.getSnapshot()
    if (current.identity === null) {
      this.mutableStore.set({
        ...INITIAL_SHARED_DATA_STATE,
        phase: 'unavailable',
        reason,
      })
      return
    }
    this.mutableStore.set({
      ...current,
      phase: 'unavailable',
      data: null,
      sequence: 0,
      reason,
    })
  }

  reset(): void {
    this.mutableStore.set(INITIAL_SHARED_DATA_STATE)
  }
}
