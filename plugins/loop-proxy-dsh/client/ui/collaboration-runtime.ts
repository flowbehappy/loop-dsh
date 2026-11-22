/** Session-scoped native collaborator discovery, inert intent binding, and status UI state. */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  CandidateRequest,
  ClientSessionContext,
  InputTriggerCandidate,
  InputTriggerPick,
  InputTriggerServiceContract,
  InputTriggerSource,
  ReferenceCodec,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { createSnapshotStore, type MutableSnapshotStore } from './store.ts'
import {
  collaborationDigest,
  collaborationRequestId,
  decodeCollaborationReference,
  encodeCollaborationReference,
  serializeCollaborationReference,
  type CollaborationReference,
} from './collaboration-reference.ts'
import type {
  BindingView,
  CollaborationBoard,
  CollaborationContinuationResult,
  CollaborationDirectoryEntry,
  CollaborationEventFrame,
  CollaborationSharePreview,
  CollaborationShareScope,
  CollaborationStatus,
  LoopHostClient,
  RemoteFailure,
  RemoteResult,
  WorkspaceRef,
} from './types.ts'

type MentionEntry = CollaborationDirectoryEntry & {
  readonly directoryKey?: string
}

export interface CollaborationPendingSubmission {
  readonly requestId: string
  readonly text: string
}

export interface CollaborationSessionFace {
  getSnapshot(): {
    readonly pendingSubmissions: readonly CollaborationPendingSubmission[]
  }
  subscribe(listener: () => void): () => void
}

export interface CollaborationSessions {
  binding(sessionId: SessionId): { readonly session: CollaborationSessionFace } | undefined
}

export type CollaborationOverlay =
  | 'closed'
  | 'details'
  | 'boards'
  | 'reference'
  | 'share'

export type CollaborationNotice =
  | 'connected'
  | 'share-confirmed'
  | 'intent-discarded'
  | 'intent-bound'
  | 'cancel-pending-delivery'
  | 'cancel-requested'
  | 'stopped'
  | 'not-dispatched'
  | 'already-terminal'
  | 'cancel-unknown'
  | 'reconciled'
  | 'continuation-linked'
  | 'continuation-needs-target'
  | 'continuation-unavailable'
  | 'continuation-failed'

export interface CollaborationContinuationView {
  readonly state:
    | 'idle'
    | 'binding'
    | 'ready'
    | 'no-active-work'
    | 'needs-explicit-target'
    | 'stale'
    | 'unavailable'
    | 'error'
  readonly requestId?: string
  readonly taskCount: number
  readonly taskIds: readonly string[]
  readonly intentId?: string




  readonly failedCount?: number
  readonly reason?: string
}

export interface CollaborationUiState {
  readonly screen: 'idle' | 'loading' | 'ready' | 'error'
  readonly status: CollaborationStatus | null
  readonly error: RemoteFailure | null
  readonly boards: readonly CollaborationBoard[]
  readonly boardsRevision: string
  readonly selectedBoardId: string
  readonly shareScope: CollaborationShareScope
  readonly sharePreview: CollaborationSharePreview | null
  readonly shareTargetNames: readonly string[]
  readonly overlay: CollaborationOverlay
  readonly reference: CollaborationReference | null
  readonly busy: string | null
  readonly notice: CollaborationNotice | null
  readonly pendingIntent: boolean
  readonly continuation: CollaborationContinuationView
}

const INITIAL: CollaborationUiState = Object.freeze({
  screen: 'idle',
  status: null,
  error: null,
  boards: [],
  boardsRevision: '',
  selectedBoardId: '',
  shareScope: {
    scope: 'task-description',
    resourceRefs: [],
    expandedAudience: false,
  },
  sharePreview: null,
  shareTargetNames: [],
  overlay: 'closed',
  reference: null,
  busy: null,
  notice: null,
  pendingIntent: false,
  continuation: { state: 'idle', taskCount: 0, taskIds: [] },
})

export interface CollaborationRuntimeOptions {
  readonly remote: LoopHostClient
  readonly sessions: CollaborationSessions
  readonly workspaceForSession: (sessionId: string) => WorkspaceRef | undefined
  readonly openBinding: (workspace: WorkspaceRef, sessionId: string) => void
  readonly openLoopProject: () => void
  readonly openWorksiteSetup?: (scope: NonNullable<CollaborationStatus['scope']>) => void
  readonly openTask: (workspaceId: string, taskId: string) => boolean

}

interface PreparedTarget {
  readonly targetId: string
  readonly targetType: 'agent' | 'human'
  readonly stableRef: string
  readonly intendedActions: readonly ('dispatch' | 'notify' | 'followup')[]
}

interface PreparedBatch {
  readonly hostManaged?: boolean
  readonly intentRef: string
  readonly tokens: readonly string[]
  readonly targets: readonly PreparedTarget[]
  readonly shareScope: CollaborationShareScope
  readonly targetNames: readonly string[]
  readonly bindingRevision: string
  readonly existingRequestIds: ReadonlySet<string>
}

interface BatchBuilder {
  readonly routes: Promise<CollaborationStatus>[]
  readonly targets: PreparedTarget[]
  readonly tokens: string[]
  readonly targetNames: string[]
  readonly ready: Promise<void>
  prepared: Promise<PreparedBatch> | null
}

interface PendingIntentRecovery {
  readonly prepared: PreparedBatch
  readonly request: CollaborationPendingSubmission
  readonly placeholderCancelRequestId: string
  placeholderCancelled: boolean
  exactIntentRef?: string
  exactPayloadDigest?: string
}

interface ContinuationFailure {
  readonly request: CollaborationPendingSubmission
  readonly continuationRef: string
}

interface ShareConsent {
  readonly intentRef: string
  readonly shareScope: CollaborationShareScope
  readonly timer: ReturnType<typeof setTimeout>
  readonly cleanup: () => void
  readonly resolve: (scope: CollaborationShareScope) => void
  readonly reject: (error: Error) => void
}

export class CollaborationRuntimeError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'CollaborationRuntimeError'
    this.code = code
  }
}

function resultValue<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new CollaborationRuntimeError(result.error.code, result.error.message)
  return result.value
}

function requestMatchesText(request: CollaborationPendingSubmission, tokens: readonly string[]): boolean {
  return tokens.length > 0 && tokens.every(token => request.text.includes(token))
}

/**
 * One Session's collaboration projection. It never activates an intent; it
 * prepares an inert descriptor and binds it only after the public pending
 * submission exposes its exact request identity and text.
 */
export class CollaborationSessionRuntime {
  readonly store: MutableSnapshotStore<CollaborationUiState>
  private readonly options: CollaborationRuntimeOptions
  private readonly sessionId: string
  private readonly face: CollaborationSessionFace
  private readonly unsubscribeSession: () => void
  private statusPromise: Promise<CollaborationStatus> | null = null
  private statusGeneration = 0
  private batchBuilder: BatchBuilder | null = null
  private prepared: PreparedBatch | null = null
  private pendingRecovery: PendingIntentRecovery | null = null
  private shareConsent: ShareConsent | null = null
  private readonly handledRequestIds = new Set<string>()
  private readonly observedRequestIds: Set<string>
  private readonly continuationRequests = new Map<string, Promise<boolean>>()
  private readonly continuationFailures = new Map<string, ContinuationFailure>()
  private openBindingTimer: ReturnType<typeof setTimeout> | null = null
  private readonly seenEventIds = new Set<string>()
  private stream: AbortController | null = null
  private streamBindingEpoch = ''
  private disposed = false

  constructor(sessionId: string, options: CollaborationRuntimeOptions) {
    this.sessionId = sessionId
    this.options = options
    this.store = createSnapshotStore(INITIAL)
    const binding = options.sessions.binding(sessionId as SessionId)
    if (binding === undefined) {
      throw new CollaborationRuntimeError(
        'loop-collaboration/session-unavailable',
        'The Session is not retained by the Host.',
      )
    }
    this.face = binding.session
    this.observedRequestIds = new Set(
      this.face.getSnapshot().pendingSubmissions.map(item => item.requestId),
    )
    this.unsubscribeSession = this.face.subscribe(this.onSessionChange)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.openBindingTimer !== null) {
      clearTimeout(this.openBindingTimer)
      this.openBindingTimer = null
    }
    this.unsubscribeSession()
    this.stream?.abort()
    this.stream = null
    this.streamBindingEpoch = ''
    this.continuationRequests.clear()
    this.continuationFailures.clear()
    this.rejectShareConsent(new CollaborationRuntimeError(
      'loop-collaboration/cancelled',
      'The collaborator message was closed before confirmation.',
    ))
    this.store.set(INITIAL)
  }

  async warm(): Promise<void> {
    // Restore task/delivery status independently of the composer directory.
    await this.refreshStatus().catch(() => undefined)
  }

  readonly showDirectoryError = (): void => {
    this.patch({overlay: 'details'})
  }

  readonly openDetails = async (): Promise<void> => {
    this.patch({ overlay: 'details', error: null, notice: null })
    await this.refreshStatus().catch(() => undefined)
  }

  readonly closeOverlay = (): void => {
    if (this.store.getSnapshot().overlay === 'share') {
      this.rejectShareConsent(new CollaborationRuntimeError(
        'loop-collaboration/cancelled',
        'Share review was cancelled; the message was not sent.',
      ))
    }
    this.patch({ overlay: 'closed', notice: null })
  }

  async refreshStatus(fresh = false): Promise<CollaborationStatus> {
    if (this.disposed) throw new CollaborationRuntimeError('loop-collaboration/cancelled', 'Session closed')
    if (!fresh && this.statusPromise !== null) return this.statusPromise
    if (this.options.remote.collaborationStatus === undefined) {
      const error = {
        code: 'loop-collaboration/capability-unsupported',
        message: 'This Loop Host needs an update to support native collaborators.',
      }
      this.patch({ screen: 'error', error })
      throw new CollaborationRuntimeError(error.code, error.message)
    }
    this.patch({ screen: 'loading', error: null })
    const generation = ++this.statusGeneration
    const task = this.options.remote.collaborationStatus({
      sessionId: this.sessionId,
      ...(this.options.workspaceForSession(this.sessionId) === undefined
        ? {}
        : { workspaceId: this.options.workspaceForSession(this.sessionId)!.workspaceId }),
    }).then(result => resultValue(result)).then(status => {
      if (this.disposed) return status
      if (generation !== this.statusGeneration) return status
      const previousScope = this.store.getSnapshot().status?.scope
      const previousRevision = previousScope?.bindingRevision
      const nextRevision = status.scope?.bindingRevision
      if (previousScope !== undefined && (previousRevision !== nextRevision ||
          previousScope.bindingId !== status.scope?.bindingId)) {
        this.invalidateForScopeChange()
      }
      this.patch({
        screen: 'ready',
        status,
        error: null,
        ...(status.scope?.boardId === undefined
          ? {}
          : { selectedBoardId: status.scope.boardId }),
      })
      this.restartStream(status)
      return status
    }).catch((error: unknown) => {
      if (generation !== this.statusGeneration) throw error
      const failure = error instanceof CollaborationRuntimeError
        ? { code: error.code, message: error.message }
        : { code: 'loop-collaboration/server-unavailable', message: error instanceof Error ? error.message : '' }
      if (!this.disposed) this.patch({ screen: 'error', error: failure })
      throw error
    }).finally(() => {
      if (this.statusPromise === task) this.statusPromise = null
    })
    this.statusPromise = task
    return task
  }

  async ensureDirectory(
    query: string,
    signal: AbortSignal,
    kinds: readonly ('agent' | 'human')[] = ['agent', 'human'],
  ): Promise<readonly MentionEntry[]> {
    signal.throwIfAborted()
    const name = query.trim()
    let directoryKey: string | undefined
    const groups = await Promise.all(kinds.map(async kind => {
      const entries = new Map<string, MentionEntry>()
      const cursors = new Set<string>()
      let cursor: string | undefined
      do {
        const page = await this.fetchDirectory(name, signal, [kind], cursor)
        if (!page.cacheKey || (directoryKey !== undefined && page.cacheKey !== directoryKey)) {
          throw new CollaborationRuntimeError('loop-collaboration/binding-stale', 'The Loop directory changed during search.')
        }
        directoryKey = page.cacheKey
        for (const entry of page.entries) {
          if (entry.targetType === kind && entry.visible) entries.set(entry.targetId, {...entry, directoryKey})
        }
        // Browsing shows all Agents and a first page of colleagues. A name
        // search reads every matching page from both server-side filters.
        if (!name && kind === 'human') break
        cursor = page.nextCursor || undefined
        if (cursor && cursors.has(cursor)) {
          throw new CollaborationRuntimeError('loop-collaboration/server-unavailable', 'The Loop directory repeated a page cursor.')
        }
        if (cursor) cursors.add(cursor)
      } while (cursor)
      return [...entries.values()]
    }))
    return groups.flat()
  }

  candidateValue(entry: MentionEntry): string {
    const status = this.store.getSnapshot().status
    const scope = status?.scope
    if (!scope && !entry.directoryKey) return ''
    return JSON.stringify({
      targetId: entry.targetId,
      targetType: entry.targetType,
      stableRef: entry.stableRef,
      displayName: entry.displayName,
      bindingRevision: scope?.bindingRevision || undefined,
      directoryKey: entry.directoryKey,
      visible: entry.visible,
      delegable: entry.delegable,
      notifiable: entry.notifiable,
      needsAccess: entry.needsAccess,
      capabilityAvailable: entry.capability.available,
      staleReason: entry.staleReason,
    })
  }

  pickCandidate(pick: InputTriggerPick): ReturnType<InputTriggerSource['onPick']> {
    let value: Record<string, unknown>
    try {
      const parsed = JSON.parse(pick.candidate.value ?? '') as unknown
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
      value = parsed as Record<string, unknown>
    } catch {
      return undefined
    }
    // Picking an advertised identity only inserts a reference. Cached access or
    // runtime availability must never interrupt composition; dispatch checks
    // current authority and returns a concrete tool error to the Agent.
    if (
      typeof value.targetId !== 'string' ||
      (value.targetType !== 'agent' && value.targetType !== 'human') ||
      typeof value.stableRef !== 'string' ||
      typeof value.displayName !== 'string' ||
      (typeof value.directoryKey !== 'string' && typeof value.bindingRevision !== 'string')
    ) return undefined
    const reference: CollaborationReference = {
      version: 1,
      sessionId: this.sessionId,
      targetId: value.targetId,
      targetType: value.targetType,
      stableRef: value.stableRef,
      displayName: value.displayName,
      ...(typeof value.bindingRevision === 'string' ? {bindingRevision: value.bindingRevision} : {}),
      ...(typeof value.directoryKey === 'string' ? {directoryKey: value.directoryKey} : {}),
    }
    const ref = encodeCollaborationReference(reference)
    return {
      insert: {
        source: 'loop-collaboration',
        ref,
        label: value.displayName,
        appearance: value.targetType === 'agent' ? 'session' : 'folder',
        clipboardText: `@${value.displayName}`,
      },
    }
  }

  async serializeReference(ref: string, signal: AbortSignal): Promise<string> {
    const reference = decodeCollaborationReference(ref)
    if (reference === null || reference.sessionId !== this.sessionId) {
      throw new CollaborationRuntimeError(
        'loop-collaboration/session-unavailable',
        'This collaborator reference belongs to another Session. Select it again in this Session.',
      )
    }
    const share = this.store.getSnapshot().shareScope
    if (reference.directoryKey && share.scope === 'task-description' && share.resourceRefs.length === 0) {
      const entry = await this.verifyDirectoryMember(reference, signal)
      return serializeCollaborationReference(reference, entry.mention)
    }
    if (this.prepared !== null || this.pendingRecovery !== null) {
      throw new CollaborationRuntimeError(
        'loop-collaboration/intent-already-bound',
        'Another Loop collaborator message is still being linked. Wait, retry, or discard that pending intent.',
      )
    }
    const token = serializeCollaborationReference(reference)
    const builder = this.batchBuilder ?? this.newBatchBuilder()
    if (!builder.targets.some(target => target.targetId === reference.targetId && target.targetType === reference.targetType)) {
      builder.targets.push({
        targetId: reference.targetId,
        targetType: reference.targetType,
        stableRef: reference.stableRef,
        intendedActions: ['dispatch', 'followup'],
      })
      builder.tokens.push(token)
      builder.targetNames.push(reference.displayName)
    }
    builder.routes.push(this.submissionRoute(reference, signal))
    await builder.ready
    try {
      // The Host asks every chip to serialize concurrently. Directory rechecks
      // can finish out of order; all must agree before preparing any recipient.
      const routes = await Promise.all(builder.routes)
      signal.throwIfAborted()
      const scope = routes[0]?.scope
      if (routes.some(route => route?.scope?.bindingId !== scope?.bindingId ||
          route?.scope?.bindingRevision !== scope?.bindingRevision)) {
        throw new CollaborationRuntimeError('loop-collaboration/binding-stale', 'The selected collaborators belong to different routes.')
      }
      if (!scope) throw new CollaborationRuntimeError('loop-collaboration/not-bound', 'Choose a Loop board before sharing.')
      this.prepared = await this.prepareBatch(builder, scope.bindingRevision, signal)
      this.patch({ pendingIntent: true })
      return token
    } finally {
      if (this.batchBuilder === builder) this.batchBuilder = null
    }
  }

  private async verifyDirectoryMember(reference: CollaborationReference, signal: AbortSignal) {
    const page = await this.fetchDirectory(reference.targetId, signal, [reference.targetType])
    const entry = page.entries.find(item => item.visible && item.targetId === reference.targetId &&
      item.targetType === reference.targetType && item.stableRef === reference.stableRef)
    if (page.cacheKey !== reference.directoryKey || !entry) {
      throw new CollaborationRuntimeError('loop-collaboration/binding-stale', 'The directory or collaborator changed. Select the collaborator again.')
    }
    return entry
  }

  private async submissionRoute(reference: CollaborationReference, signal: AbortSignal) {
    if (reference.directoryKey) await this.verifyDirectoryMember(reference, signal)
    const status = await this.refreshStatus()
    if (!status.scope || (status.state !== 'ready' && status.state !== 'degraded')) {
      throw new CollaborationRuntimeError('loop-collaboration/not-bound', 'Choose a Loop board before sending.')
    }
    if (reference.bindingRevision !== status.scope.bindingRevision) {
      throw new CollaborationRuntimeError('loop-collaboration/binding-stale', 'The Loop board changed. Remove this stale collaborator and select it again.')
    }
    return status
  }

  async bindBoard(boardId: string): Promise<void> {
    const state = this.store.getSnapshot()
    if (state.busy !== null) return
    const workspace = this.options.workspaceForSession(this.sessionId)
    if (workspace === undefined) {
      this.patch({ error: { code: 'loop-collaboration/not-bound', message: 'Open this Session from a workspace first.' } })
      return
    }
    const board = state.boards.find(item => item.boardId === boardId)
    if (board === undefined || state.boardsRevision === '') {
      this.patch({ error: { code: 'loop-collaboration/not-bound', message: 'Choose a Loop board first.' } })
      return
    }
    if (this.options.remote.collaborationBind === undefined) {
      this.patch({ error: { code: 'loop-collaboration/capability-unsupported', message: 'This Loop Host needs an update.' } })
      return
    }
    this.patch({ busy: 'bind', selectedBoardId: boardId, error: null })
    try {
      const bindingResult = this.options.remote.status === undefined
        ? null
        : await this.options.remote.status(workspace)
      const existing = bindingResult?.ok === true ? bindingResult.value as BindingView : null
      const coordinatorAgentId =
        state.status?.scope?.coordinatorAgentId || existing?.agent?.id
      if (coordinatorAgentId === undefined || coordinatorAgentId === '') {
        this.openExistingBinding(workspace)
        return
      }
      const collaborationWorkspaceId =
        state.status?.scope?.workspaceId || existing?.loop?.workspaceId
      if (collaborationWorkspaceId === undefined || collaborationWorkspaceId === '') {
        this.reportFailure(new CollaborationRuntimeError(
          'loop-collaboration/not-bound',
          'The Loop workspace identity is unavailable.',
        ))
        return
      }
      const result = await this.options.remote.collaborationBind({
        sessionId: this.sessionId,
        workspaceId: collaborationWorkspaceId,
        boardId: board.boardId,
        coordinatorAgentId,
        expectedRevision: state.boardsRevision,
        shareScope: state.shareScope,
      })
      if (!result.ok) throw new CollaborationRuntimeError(result.error.code, result.error.message)
      this.patch({ busy: null, overlay: 'details', notice: 'connected' })
      await this.refreshStatus(true)
    } catch (error) {
      this.reportFailure(error)
    } finally {
      if (this.store.getSnapshot().busy === 'bind') this.patch({ busy: null })
    }
  }

  async loadBoards(): Promise<void> {
    if (this.options.remote.collaborationBoards === undefined) {
      this.patch({ error: { code: 'loop-collaboration/capability-unsupported', message: 'This Loop Host needs an update.' } })
      return
    }
    this.patch({ busy: 'boards', overlay: 'boards', error: null, notice: null })
    try {
      const result = await this.options.remote.collaborationBoards({
        sessionId: this.sessionId,
        limit: 50,
      })
      const value = resultValue(result)
      const boards = value.boards
      this.patch({
        busy: null,
        boards,
        boardsRevision: value.revision,
        selectedBoardId: boards.some(board => board.boardId === this.store.getSnapshot().selectedBoardId)
          ? this.store.getSnapshot().selectedBoardId
          : boards[0]?.boardId ?? '',
      })
    } catch (error) {
      this.reportFailure(error)
      if (this.store.getSnapshot().busy === 'boards') this.patch({ busy: null })
    }
  }

  setShareScope(scope: CollaborationShareScope['scope']): void {
    this.patch({
      shareScope: {
        ...this.store.getSnapshot().shareScope,
        scope,
      },
    })
  }

  selectBoard(boardId: string): void {
    this.patch({ selectedBoardId: boardId })
  }

  readonly confirmShare = (): void => {
    const consent = this.shareConsent
    if (consent === null) return
    this.clearShareConsent(consent)
    const shareScope = {
      ...consent.shareScope,
      expandedAudience: true,
    }
    this.patch({
      overlay: 'closed',
      sharePreview: null,
      shareScope,
      notice: 'share-confirmed',
      pendingIntent: true,
    })
    consent.resolve(shareScope)
  }

  async discardPreparedIntent(): Promise<void> {
    const prepared = this.pendingRecovery?.prepared ?? this.prepared
    if (prepared === null || this.options.remote.cancelCollaborationIntent === undefined) return
    this.patch({ busy: 'discard-intent', error: null, notice: null })
    try {
      const intentRef = this.pendingRecovery?.exactIntentRef ?? prepared.intentRef
      resultValue(await this.options.remote.cancelCollaborationIntent({
        sessionId: this.sessionId,
        intentRef,
        clientRequestId: collaborationRequestId('discard-intent'),
        reason: 'Discarded before the accepted message was bound',
        expectedStatus: 'prepared',
      }))
      this.prepared = null
      this.pendingRecovery = null
      this.patch({
        busy: null,
        pendingIntent: false,
        notice: 'intent-discarded',
      })
    } catch (error) {
      this.reportFailure(error)
      if (this.store.getSnapshot().busy === 'discard-intent') this.patch({ busy: null })
    }
  }

  openReference(ref: string): boolean {
    const reference = decodeCollaborationReference(ref)
    if (reference === null || reference.sessionId !== this.sessionId) return false
    this.patch({ overlay: 'reference', reference, notice: null })
    return true
  }

  showFailure(error: unknown): void {
    this.reportFailure(error)
  }

  readonly openExistingBindingForSession = (): void => {
    const workspace = this.options.workspaceForSession(this.sessionId)
    if (workspace === undefined) {
      this.patch({
        overlay: 'details',
        error: {
          code: 'loop-collaboration/session-unavailable',
          message: '',
        },
      })
      return
    }
    this.openExistingBinding(workspace)
  }

  readonly openLoopProject = (): void => {
    this.patch({ overlay: 'closed' })
    this.options.openLoopProject()
  }

  readonly openWorksiteSetup = (): void => {
    const scope = this.store.getSnapshot().status?.scope
    if (scope === undefined || this.options.openWorksiteSetup === undefined) {
      this.options.openLoopProject()
      return
    }
    this.patch({ overlay: 'closed' })
    this.options.openWorksiteSetup(scope)
  }

  openTask(workspaceId: string, taskId: string): void {
    this.patch({ overlay: 'closed' })
    if (!this.options.openTask(workspaceId, taskId)) this.options.openLoopProject()
  }


  async reconcile(): Promise<void> {
    if (this.store.getSnapshot().busy?.startsWith('bind:') === true) return
    if (this.pendingRecovery !== null) {
      const recovered = await this.bindPending(this.pendingRecovery.request)
      if (!recovered) return
    }
    if (this.options.remote.collaborationReconcile === undefined) return
    this.patch({ busy: 'reconcile', error: null })
    try {
      resultValue(await this.options.remote.collaborationReconcile({ sessionId: this.sessionId }))
      await this.refreshStatus()
      this.patch({ busy: null, notice: 'reconciled' })
    } catch (error) {
      this.reportFailure(error)
      if (this.store.getSnapshot().busy === 'reconcile') this.patch({ busy: null })
    }
  }

  private awaitShareConsent(
    intentRef: string,
    sharePreview: CollaborationSharePreview,
    targetNames: readonly string[],
    shareScope: CollaborationShareScope,
    expiresAt: string,
    signal: AbortSignal,
  ): Promise<CollaborationShareScope> {
    if (this.shareConsent !== null) {
      return Promise.reject(new CollaborationRuntimeError(
        'loop-collaboration/intent-already-bound',
        'Another collaborator share review is already waiting.',
      ))
    }
    return new Promise<CollaborationShareScope>((resolve, reject) => {
      let settled = false
      const finish = (): boolean => {
        if (settled) return false
        settled = true
        return true
      }
      const expiry = Date.parse(expiresAt)
      const timeoutMs = Number.isFinite(expiry)
        ? Math.max(0, Math.min(expiry - Date.now(), 5 * 60_000))
        : 5 * 60_000
      const timer = setTimeout(() => {
        this.rejectShareConsent(new CollaborationRuntimeError(
          'loop-collaboration/intent-expired',
          'Share review expired; the message was not sent.',
        ))
      }, timeoutMs)
      timer.unref?.()
      const abort = (): void => {
        this.rejectShareConsent(new CollaborationRuntimeError(
          'loop-collaboration/cancelled',
          'The submission was cancelled during share review.',
        ))
      }
      const cleanup = (): void => {
        clearTimeout(timer)
        signal.removeEventListener('abort', abort)
      }
      this.shareConsent = {
        intentRef,
        shareScope,
        timer,
        cleanup,
        resolve: scope => {
          if (!finish()) return
          cleanup()
          resolve(scope)
        },
        reject: error => {
          if (!finish()) return
          cleanup()
          reject(error)
        },
      }
      signal.addEventListener('abort', abort, {once: true})
      if (signal.aborted) {
        abort()
        return
      }
      this.patch({
        overlay: 'share',
        sharePreview,
        shareTargetNames: [...targetNames],
        shareScope: {
          ...shareScope,
          expandedAudience: false,
        },
        pendingIntent: false,
      })
    })
  }

  private clearShareConsent(consent: ShareConsent): void {
    consent.cleanup()
    if (this.shareConsent === consent) this.shareConsent = null
  }

  private rejectShareConsent(error: Error): void {
    const consent = this.shareConsent
    if (consent === null) return
    this.clearShareConsent(consent)
    consent.reject(error)
    if (this.options.remote.cancelCollaborationIntent !== undefined) {
      void this.options.remote.cancelCollaborationIntent({
        sessionId: this.sessionId,
        intentRef: consent.intentRef,
        clientRequestId: collaborationRequestId('discard-preview'),
        reason: 'Share preview was not confirmed',
        expectedStatus: 'prepared',
      }).then(resultValue).catch((error: unknown) => {
        this.reportFailure(error)
      })
    }
    this.patch({
      overlay: this.store.getSnapshot().overlay === 'share' ? 'closed' : this.store.getSnapshot().overlay,
      sharePreview: null,
      shareTargetNames: [],
      pendingIntent: false,
    })
  }

  private newBatchBuilder(): BatchBuilder {
    let release!: () => void
    const ready = new Promise<void>(resolve => { release = resolve })
    queueMicrotask(release)
    const builder: BatchBuilder = { routes: [], targets: [], tokens: [], targetNames: [], ready, prepared: null }
    this.batchBuilder = builder
    return builder
  }

  private async prepareBatch(
    builder: BatchBuilder,
    bindingRevision: string,
    signal: AbortSignal,
  ): Promise<PreparedBatch> {
    if (builder.prepared !== null) return builder.prepared
    if (this.options.remote.prepareCollaborationIntent === undefined) {
      throw new CollaborationRuntimeError(
        'loop-collaboration/capability-unsupported',
        'This Loop Host cannot prepare collaborator messages.',
      )
    }
    builder.prepared = (async () => {
      const payloadText = builder.tokens.join('\n')
      const payloadDigest = await collaborationDigest(payloadText)
      signal.throwIfAborted()
      let shareScope = this.store.getSnapshot().shareScope
      const personalDescription = (!this.store.getSnapshot().status?.scope?.projectId ||
        builder.targets.every(target => target.targetType === 'human')) &&
        shareScope.scope === 'task-description' && shareScope.resourceRefs.length === 0
      if (personalDescription) shareScope = { ...shareScope, expandedAudience: true }
      const prepare = () => this.options.remote.prepareCollaborationIntent!({
        sessionId: this.sessionId,
        bindingRevision,
        references: builder.targets,
        serializedText: payloadText,
        payloadDigest,
        shareScope,
        activateOnClaim: shareScope.expandedAudience,
        expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      }, signal)
      let value = resultValue(await prepare())
      if (value.state !== 'prepared') {
        throw new CollaborationRuntimeError(
          'loop-collaboration/intent-not-accepted',
          `Loop did not prepare this message (${value.state}).`,
        )
      }
      if (!shareScope.expandedAudience) {
        shareScope = await this.awaitShareConsent(
          value.intentRef,
          value.sharePreview,
          builder.targetNames,
          shareScope,
          value.expiresAt,
          signal,
        )
        signal.throwIfAborted()
        if (value.activationOwner !== undefined) {
          resultValue(await this.options.remote.cancelCollaborationIntent!({
            sessionId: this.sessionId, intentRef: value.intentRef,
            clientRequestId: collaborationRequestId('confirm-share'),
            reason: 'Replace preview with confirmed share scope', expectedStatus: 'prepared',
          }, signal))
          value = resultValue(await prepare())
        }
      }
      return {
        hostManaged: value.activationOwner === 'host',
        intentRef: value.intentRef,
        tokens: [...builder.tokens],
        targets: [...builder.targets],
        shareScope,
        targetNames: [...builder.targetNames],
        bindingRevision,
        existingRequestIds: new Set(
          this.face.getSnapshot().pendingSubmissions.map(item => item.requestId),
        ),
      }
    })()
    return builder.prepared
  }

  private async bindPending(request: CollaborationPendingSubmission): Promise<boolean> {
    const prepared = this.prepared
      ?? (this.pendingRecovery?.request.requestId === request.requestId
        ? this.pendingRecovery.prepared
        : null)
    if (prepared === null ||
        this.options.remote.bindCollaborationIntent === undefined ||
        this.options.remote.prepareCollaborationIntent === undefined ||
        this.options.remote.cancelCollaborationIntent === undefined) {
      if (prepared !== null) {
        this.reportFailure(new CollaborationRuntimeError(
          'loop-collaboration/capability-unsupported',
          'This Loop Host cannot finish linking the accepted message.',
        ))
      }
      return false
    }
    this.handledRequestIds.add(request.requestId)
    this.prepared = null
    const recovery = this.pendingRecovery?.request.requestId === request.requestId
      ? this.pendingRecovery
      : this.pendingRecovery = {
          prepared,
          request,
          placeholderCancelRequestId: collaborationRequestId('replace-intent'),
          placeholderCancelled: false,
        }
    const payloadDigest = await collaborationDigest(request.text)
    this.patch({ busy: `bind:${request.requestId}`, error: null, notice: null })
    try {
      if (!recovery.placeholderCancelled) {
        const cancelled = await this.options.remote.cancelCollaborationIntent({
          sessionId: this.sessionId,
          intentRef: prepared.intentRef,
          clientRequestId: recovery.placeholderCancelRequestId,
          reason: 'Replace the reference-only intent with the accepted message identity',
          expectedStatus: 'prepared',
        })
        resultValue(cancelled)
        recovery.placeholderCancelled = true
      }
      if (recovery.exactIntentRef === undefined || recovery.exactPayloadDigest === undefined) {
        const exact = await this.options.remote.prepareCollaborationIntent({
          sessionId: this.sessionId,
          bindingRevision: prepared.bindingRevision,
          references: prepared.targets,
          serializedText: request.text,
          payloadDigest,
          shareScope: prepared.shareScope,
          expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
        })
        const exactIntent = resultValue(exact)
        if (exactIntent.state !== 'prepared') {
          throw new CollaborationRuntimeError(
            'loop-collaboration/intent-not-accepted',
            `Loop did not prepare the accepted message (${exactIntent.state}).`,
          )
        }
        if (!prepared.shareScope.expandedAudience) {
          throw new CollaborationRuntimeError(
            'loop-collaboration/intent-not-accepted',
            'The accepted message did not include confirmed share scope.',
          )
        }
        recovery.exactIntentRef = exactIntent.intentRef
        recovery.exactPayloadDigest = exactIntent.payloadDigest
      }
      const result = await this.options.remote.bindCollaborationIntent({
        intentRef: recovery.exactIntentRef,
        sessionId: this.sessionId,
        requestId: request.requestId,
        payloadDigest: recovery.exactPayloadDigest,
        acceptedSerializedText: request.text,
        bindingRevision: prepared.bindingRevision,
      })
      const value = resultValue(result)
      if (value.state !== 'bound' && value.state !== 'accepted' && value.state !== 'activating' && value.state !== 'activated') {
        throw new CollaborationRuntimeError(
          'loop-collaboration/intent-not-accepted',
          `The accepted message could not be linked to Loop (${value.state}).`,
        )
      }
      this.patch({
        busy: null,
        notice: 'intent-bound',
        pendingIntent: false,
      })
      this.pendingRecovery = null
      await this.refreshStatus().catch(() => undefined)
      return true
    } catch (error) {
      this.reportFailure(error)
      if (this.store.getSnapshot().busy === `bind:${request.requestId}`) this.patch({ busy: null })
      return false
    }
  }

  private onSessionChange = (): void => {
    const pending = this.face.getSnapshot().pendingSubmissions
    for (const request of pending) {
      if (this.observedRequestIds.has(request.requestId)) continue
      this.observedRequestIds.add(request.requestId)
      const prepared = this.prepared
      if (prepared !== null &&
          !prepared.existingRequestIds.has(request.requestId) &&
          requestMatchesText(request, prepared.tokens)) {
        // Keep ownership while queued: a second serialization must not replace
        // the reference before the Host claims the first message.
        if (!prepared.hostManaged) void this.bindPending(request)
        continue
      }
      if (request.text.includes('<loop-collaboration')) {
        this.patch({
          continuation: {
            state: 'needs-explicit-target',
            requestId: request.requestId,
            taskCount: 0,
            taskIds: [],
          },
          notice: 'continuation-needs-target',
        })
        continue
      }
      // Ordinary messages are handled by the Host only when a model invokes a Loop tool.
    }
  }

  private async bindContinuation(
    request: CollaborationPendingSubmission,
    continuationRef = collaborationRequestId('continue'),
  ): Promise<boolean> {
    const existing = this.continuationRequests.get(request.requestId)
    if (existing !== undefined) return existing
    const task = this.bindContinuationRequest(request, continuationRef)
    this.continuationRequests.set(request.requestId, task)
    try {
      return await task
    } finally {
      if (this.continuationRequests.get(request.requestId) === task) {
        this.continuationRequests.delete(request.requestId)
      }
    }
  }

  private async bindContinuationRequest(
    request: CollaborationPendingSubmission,
    continuationRef: string,
  ): Promise<boolean> {
    const previous = this.store.getSnapshot().status
    const previouslyActive = previous !== undefined && previous !== null &&
      (previous.active.length > 0 || previous.deliveries.some(delivery =>
        delivery.eventKind === 'collaboration.task_message'))
    const status = await this.refreshStatus().catch(() => null)
    if (status === null) {
      if (previouslyActive) {
        this.continuationFailures.set(request.requestId, { request, continuationRef })
        this.patch({
          continuation: {
            state: 'error',
            requestId: request.requestId,
            taskCount: previous?.active.length ?? 0,
            taskIds: previous?.active.map(task => task.taskId) ?? [],
            failedCount: this.continuationFailures.size,
          },
          notice: 'continuation-failed',
        })
      }
      return false
    }
    const activeCandidate =
      (status.state === 'ready' || status.state === 'degraded') &&
      (status.active.length > 0 || status.deliveries.some(delivery =>
        delivery.eventKind === 'collaboration.task_message' &&
        delivery.state !== 'canceled' &&
        delivery.state !== 'revoked' &&
        delivery.state !== 'binding-conflict' &&
        delivery.state !== 'blocked'))
    if (!activeCandidate) {
      this.patch({
        continuation: {
          state: 'no-active-work',
          taskCount: 0,
          taskIds: [],
          failedCount: this.continuationFailures.size,
        },
      })
      return true
    }
    if (this.options.remote.bindCollaborationContinuation === undefined) {
      this.patch({
        continuation: {
          state: 'unavailable',
          requestId: request.requestId,
          taskCount: status.active.length,
          taskIds: [],
        },
        notice: 'continuation-unavailable',
      })
      return false
    }
    const bindingRevision = status.scope?.bindingRevision
    if (bindingRevision === undefined || bindingRevision === '') {
      this.patch({
        continuation: {
          state: 'stale',
          requestId: request.requestId,
          taskCount: status.active.length,
          taskIds: [],
        },
        notice: 'continuation-failed',
      })
      return false
    }
    this.patch({
      continuation: {
        state: 'binding',
        requestId: request.requestId,
        taskCount: status.active.length,
        taskIds: [],
      },
      notice: null,
    })
    try {
      const payloadDigest = await collaborationDigest(request.text)
      const result = await this.options.remote.bindCollaborationContinuation({
        sessionId: this.sessionId,
        requestId: request.requestId,
        continuationRef,
        bindingRevision,
        payloadDigest,
        acceptedSerializedText: request.text,
      })
      const value = resultValue(result)
      const tasks = value.tasks ?? []
      switch (value.state) {
        case 'ready':
          this.continuationFailures.delete(request.requestId)
          this.patch({
            continuation: {
              state: 'ready',
              requestId: request.requestId,
              taskCount: tasks.length,
              taskIds: tasks.map(task => task.taskId),
              ...(value.localIntentId === undefined ? {} : { intentId: value.localIntentId }),
              failedCount: this.continuationFailures.size,
              ...(value.reason === undefined ? {} : { reason: value.reason }),
            },
            notice: 'continuation-linked',
          })
          return true
        case 'no-active-work':
          this.continuationFailures.delete(request.requestId)
          this.patch({
            continuation: {
              state: 'no-active-work',
              taskCount: 0,
              taskIds: [],
              failedCount: this.continuationFailures.size,
            },
          })
          return true
        case 'needs-explicit-target':
          this.continuationFailures.delete(request.requestId)
          this.patch({
            continuation: {
              state: 'needs-explicit-target',
              requestId: request.requestId,
              taskCount: tasks.length,
              taskIds: tasks.map(task => task.taskId),
              ...(value.localIntentId === undefined ? {} : { intentId: value.localIntentId }),
              failedCount: this.continuationFailures.size,
              ...(value.reason === undefined ? {} : { reason: value.reason }),
            },
            notice: 'continuation-needs-target',
          })
          return true
        case 'stale':
          throw new CollaborationRuntimeError(
            'loop-collaboration/binding-stale',
            value.reason ?? 'The active Loop work no longer matches this Session generation or binding',
          )
      }
    } catch (error) {
      this.continuationFailures.set(request.requestId, { request, continuationRef })
      this.patch({
        continuation: {
          state: 'error',
          requestId: request.requestId,
          taskCount: status.active.length,
          taskIds: status.active.map(task => task.taskId),
          ...(error instanceof Error ? { reason: error.message } : {}),
          failedCount: this.continuationFailures.size,
        },
        notice: 'continuation-failed',
      })
      return false
    }
  }

  async retryContinuation(): Promise<void> {
    const failures = [...this.continuationFailures.values()]
    for (const failure of failures) {
      await this.bindContinuation(failure.request, failure.continuationRef)
    }
  }

  private async fetchDirectory(
    query: string,
    signal: AbortSignal,
    kinds?: readonly ('agent' | 'human')[],
    cursor?: string,
  ) {
    if (this.options.remote.collaborationDirectory === undefined) {
      throw new CollaborationRuntimeError(
        'loop-collaboration/capability-unsupported',
        'This Loop Host cannot search collaborators.',
      )
    }
    const result = await this.options.remote.collaborationDirectory({
      sessionId: this.sessionId,
      query: query.slice(0, 200),
      limit: 50,
      ...(cursor === undefined ? {} : { cursor }),
      ...(kinds === undefined ? {} : { kinds }),
    }, signal)
    signal.throwIfAborted()
    return resultValue(result)
  }

  private restartStream(status: CollaborationStatus): void {
    const scope = status.scope
    if (scope === undefined || this.options.remote.collaborationEvents === undefined) return
    const bindingKey = JSON.stringify([scope.bindingId, scope.bindingEpoch])
    if (this.stream !== null && this.streamBindingEpoch === bindingKey) return
    this.stream?.abort()
    const controller = new AbortController()
    this.stream = controller
    this.streamBindingEpoch = bindingKey
    void (async () => {
      try {
        for await (const frame of this.options.remote.collaborationEvents!(
          { sessionId: this.sessionId },
          controller.signal,
        )) {
          if (controller.signal.aborted) break
          this.applyFrame(frame)
        }
      } catch (error) {
        if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return
        this.patch({
          screen: 'error',
          error: {
            code: 'loop-collaboration/server-unavailable',
            message: error instanceof Error ? error.message : '',
          },
        })
      } finally {
        if (this.stream === controller) {
          this.stream = null
          this.streamBindingEpoch = ''
        }
      }
    })()
  }

  private applyFrame(frame: CollaborationEventFrame): void {
    if (frame.type === 'ready') {
      this.patch({ status: frame.status ?? this.store.getSnapshot().status })
      return
    }
    if (frame.type === 'error') {
      this.patch({ error: frame.error })
      return
    }
    if (this.seenEventIds.has(frame.event.eventId)) return
    this.seenEventIds.add(frame.event.eventId)
    if (this.seenEventIds.size > 256) {
      const oldest = this.seenEventIds.values().next().value
      if (oldest !== undefined) this.seenEventIds.delete(oldest)
    }
    if (frame.event.kind === 'intent.changed' && frame.event.intent !== undefined) {
      const intent = frame.event.intent
      if (this.prepared && this.prepared.intentRef !== intent.intentRef &&
          this.prepared.intentRef !== intent.sourceIntentRef) return
      if (intent.state === 'failed' || intent.state === 'activated') {
        this.prepared = null
        this.pendingRecovery = null
        this.patch({ pendingIntent: false, busy: null,
          ...(intent.state === 'failed' ? { error: {
            code: 'loop-collaboration/intent-not-accepted', message: intent.reason ?? 'Loop submission failed',
          } } : { notice: 'intent-bound' as const }),
        })
      }
      return
    }
    if (frame.event.kind === 'binding.changed') {
      this.invalidateForScopeChange()
      void this.refreshStatus().catch(() => undefined)
      return
    }
    if (frame.event.kind === 'directory.changed') return
    const current = this.store.getSnapshot().status
    if (current === null) return
    if (frame.event.worksite !== undefined) {
      this.patch({ status: { ...current, worksite: frame.event.worksite } })
      return
    }
    if (frame.event.active !== undefined) {
      const active = current.active.filter(item => item.taskId !== frame.event.active!.taskId)
      this.patch({ status: { ...current, active: [frame.event.active, ...active] } })
    } else if (frame.event.delivery !== undefined) {
      const deliveries = current.deliveries.filter(item => item.deliveryId !== frame.event.delivery!.deliveryId)
      const deliveryState = frame.event.delivery.state
      // A task/message error stays on its delivery card. Only authoritative
      // connection status may revoke or restore the whole Session.
      const statusState = current.state === 'ready' &&
        ['needs-auth', 'revoked', 'binding-conflict', 'blocked', 'reconcile'].includes(deliveryState)
          ? 'degraded'
          : current.state
      this.patch({
        status: {
          ...current,
          state: statusState,
          deliveries: [frame.event.delivery, ...deliveries].slice(0, 100),
        },
      })
    } else {
      void this.refreshStatus().catch(() => undefined)
    }
  }

  private invalidateForScopeChange(): void {
    this.rejectShareConsent(new CollaborationRuntimeError(
      'loop-collaboration/binding-stale',
      'The Loop board changed during share review.',
    ))
    this.prepared = null
    this.batchBuilder = null
    this.pendingRecovery = null
    this.handledRequestIds.clear()
    this.continuationRequests.clear()
    this.continuationFailures.clear()
    this.stream?.abort()
    this.stream = null
    this.streamBindingEpoch = ''
    this.patch({
      boards: [],
      boardsRevision: '',
      sharePreview: null,
      shareTargetNames: [],
      pendingIntent: false,
      continuation: { state: 'idle', taskCount: 0, taskIds: [] },
      shareScope: {
        ...this.store.getSnapshot().shareScope,
        resourceRefs: [],
        expandedAudience: false,
      },
    })
  }

  private openExistingBinding(workspace: WorkspaceRef): void {
    this.patch({ busy: null, overlay: 'closed' })
    if (this.openBindingTimer !== null) clearTimeout(this.openBindingTimer)
    // Let the collaboration Modal commit closed before the canonical Loop
    // connection Modal opens into the same shell overlay seat.
    this.openBindingTimer = setTimeout(() => {
      this.openBindingTimer = null
      if (!this.disposed) this.options.openBinding(workspace, this.sessionId)
    }, 0)
  }

  private reportFailure(error: unknown): void {
    const failure = error instanceof CollaborationRuntimeError
      ? { code: error.code, message: error.message }
      : {
          code: 'loop-collaboration/internal',
          message: error instanceof Error ? error.message : 'Loop collaboration failed.',
        }
    this.patch({ screen: 'error', error: failure })
  }

  private patch(next: Partial<CollaborationUiState>): void {
    if (this.disposed) return
    this.store.set({ ...this.store.getSnapshot(), ...next })
  }
}


/** Root registry for Session-scoped collaboration state and the native @ source. */
export class CollaborationRuntime {
  private readonly options: CollaborationRuntimeOptions
  private readonly sessions = new Map<string, CollaborationSessionRuntime>()

  constructor(options: CollaborationRuntimeOptions) {
    this.options = options
  }

  forSession(sessionId: string): CollaborationSessionRuntime {
    const existing = this.sessions.get(sessionId)
    if (existing !== undefined) return existing
    const created = new CollaborationSessionRuntime(sessionId, this.options)
    this.sessions.set(sessionId, created)
    if (this.sessions.size > 64) {
      const oldest = this.sessions.keys().next().value
      if (oldest !== undefined && oldest !== sessionId) {
        this.sessions.get(oldest)?.dispose()
        this.sessions.delete(oldest)
      }
    }
    return created
  }

  dispose(): void {
    for (const runtime of this.sessions.values()) runtime.dispose()
    this.sessions.clear()
  }

  registerSource(
    inputTriggers: InputTriggerServiceContract,
    sectionLabel: (type: 'agent' | 'human') => string,
    failureLabel: (failure: RemoteFailure) => string,
    labels: {
      readonly delegate: string
      readonly notify: string
      readonly needsAccess: string
      readonly unavailable: string
    },
  ): () => void {
    const owner = this
    const codec: ReferenceCodec = {
      clipboardText: ref => {
        const reference = decodeCollaborationReference(ref)
        return reference === null ? '' : `@${reference.displayName}`
      },
      serialize: (ref, signal) => {
        const reference = decodeCollaborationReference(ref)
        if (reference === null) return Promise.reject(new CollaborationRuntimeError(
          'loop-collaboration/intent-expired',
          'This collaborator reference is invalid. Select it again.',
        ))
        const runtime = owner.forSession(reference.sessionId)
        return runtime.serializeReference(ref, signal).catch((error: unknown) => {
          if (!(error instanceof CollaborationRuntimeError && error.code === 'loop-collaboration/cancelled')) {
            runtime.showFailure(error)
          }
          throw new Error(failureLabel(
            error instanceof CollaborationRuntimeError
              ? { code: error.code, message: error.message }
              : { code: 'loop-collaboration/internal', message: '' },
          ))
        })
      },
    }
    const source: InputTriggerSource = {
      trigger: '@',
      name: 'loop-collaboration',
      order: 30,
      codec,
      async candidates(session: ClientSessionContext, req: CandidateRequest): Promise<readonly InputTriggerCandidate[]> {
        const runtime = owner.forSession(session.sessionId)
        let entries: readonly CollaborationDirectoryEntry[]
        try {
          entries = await runtime.ensureDirectory(req.query, req.signal)
        } catch (error) {
          req.signal.throwIfAborted()
          runtime.showFailure(error)
          const failure = runtime.store.getSnapshot().error
          return [{name: failureLabel(failure ?? {code: 'loop-collaboration/internal', message: ''}),
            section: 'Loop', value: 'directory-error'}]
        }
        return entries.map(entry => {
          const actions: string[] = []
          if (entry.delegable || entry.capability.assignable) actions.push(labels.delegate)
          if (entry.notifiable) actions.push(labels.notify)
          const description = entry.needsAccess
            ? labels.needsAccess
            : actions.length === 0
              ? entry.staleReason ?? labels.unavailable
              : [entry.description, actions.join(' / ')].filter(Boolean).join(' · ')
          return {
            name: entry.displayName,
            label: entry.displayName,
            description,
            section: sectionLabel(entry.targetType),
            hint: [entry.workspaceName, entry.projectName].filter(Boolean).join(' / ') || undefined,
            value: runtime.candidateValue(entry),
          }
        })
      },
      warm: session => {
        void owner.forSession(session.sessionId).warm()
      },
      onPick: pick => {
        const runtime = owner.forSession(pick.session.sessionId)
        if (pick.candidate.value === 'directory-error') {
          runtime.showDirectoryError()
          return 'handled'
        }
        return runtime.pickCandidate(pick)
      },
      openReference: (session, reference) => owner.forSession(session.sessionId).openReference(reference.ref),
    }
    return inputTriggers.registerSource(source)
  }
}
