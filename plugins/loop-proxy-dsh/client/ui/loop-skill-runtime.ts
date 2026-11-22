import type {
  CandidateRequest,
  ClientSessionContext,
  InputTriggerCandidate,
  InputTriggerPick,
  InputTriggerServiceContract,
  InputTriggerSource,
} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import {
  catalogScopeKey,
  InputCatalogCache,
  type CatalogScopeIdentity,
} from './input-catalog-cache.ts'
import {
  asLoopSkillRuntimeError,
  LoopSkillRuntimeError,
  loopSkillError,
  withLocalizedLoopSkillMessage,
  type LoopSkillFailureFormatter,
} from './loop-skill-errors.ts'
import {
  loopSkillCandidate,
  loopSkillDisplayName,
  loopSkillCodec,
  decodeLoopSkillReference,
  decodeLoopSkillReferenceResult,
  pickedLoopSkill,
  type LoopSkillCatalogEntry,
} from './loop-skill-reference.ts'
import type {
  LoopHostClient,
  RemoteResult,
  SkillCatalogEventFrame,
  SkillCatalogValue,
  WorkspaceRef,
} from './types.ts'

interface LoopSkillRuntimeOptions {
  readonly remote: LoopHostClient
  readonly workspaceForSession: (sessionId: string) => WorkspaceRef | undefined
  readonly showFailure: (error: Error) => void
  readonly formatFailure: LoopSkillFailureFormatter
}

interface SessionLoopSkillRuntimeOptions extends LoopSkillRuntimeOptions {
  readonly subscribeCatalogEvents: (
    sessionId: string,
    signal: AbortSignal,
  ) => AsyncIterable<SkillCatalogEventFrame>
}

function resultValue<T>(result: RemoteResult<T>): T {
  if (!result.ok) throw new LoopSkillRuntimeError(result.error.code, result.error.message)
  return result.value
}

export {LoopSkillRuntimeError} from './loop-skill-errors.ts'

function scopeIdentity(value: SkillCatalogValue): CatalogScopeIdentity {
  return {
    serverBaseUrl: value.scope.serverBaseUrl,
    accountId: value.scope.accountId,
    installationId: value.scope.installationId,
    workspaceId: value.scope.workspaceId,
    hostWorkspaceId: value.scope.hostWorkspaceId,
    bindingRevision: value.scope.bindingRevision,
    projectId: value.scope.projectId,
    agentId: value.scope.agentId,
    identityFingerprint: value.scope.identityFingerprint,
  }
}

class LoopSkillSessionRuntime {
  private readonly sessionId: string
  private readonly options: SessionLoopSkillRuntimeOptions
  private readonly cache: InputCatalogCache<LoopSkillCatalogEntry>
  private hostWorkspaceId: string
  private resolvedScope = ''
  private readonly seenEventIds = new Set<string>()
  private warmController: AbortController | null = null
  private stream: AbortController | null = null
  private disposed = false

  constructor(sessionId: string, options: SessionLoopSkillRuntimeOptions) {
    this.sessionId = sessionId
    this.options = options
    const workspace = options.workspaceForSession(sessionId)
    if (workspace === undefined) {
      throw loopSkillError(
        'loop-host/workspace-required',
        'Open this Session from a workspace before using Loop Skills.',
      )
    }
    this.hostWorkspaceId = workspace.workspaceId
    this.cache = new InputCatalogCache({
      serverBaseUrl: '',
      accountId: '',
      installationId: '',
      workspaceId: workspace.workspaceId,
      hostWorkspaceId: workspace.workspaceId,
    }, async (cursor, signal) => {
      const currentWorkspace = options.workspaceForSession(sessionId)
      if (currentWorkspace === undefined) {
        throw loopSkillError(
          'loop-host/session-unavailable',
          'This Loop Skill Session no longer belongs to a Host workspace.',
        )
      }
      if (this.options.remote.skillCatalog === undefined) {
        throw loopSkillError(
          'loop-host/capability-unsupported',
          'This Loop Host needs an update to load Loop Skills.',
        )
      }
      const result = resultValue(await this.options.remote.skillCatalog({
        workspaceId: currentWorkspace.workspaceId,
        sessionId,
        ...(cursor === undefined ? {} : {cursor}),
        limit: 50,
      }, signal))
      if (result.scope.sessionId !== sessionId ||
          result.scope.hostWorkspaceId !== currentWorkspace.workspaceId) {
        throw loopSkillError(
          'loop-host/backend-invalid',
          'Loop Skills returned a different Session or workspace.',
        )
      }
      return {...result.data, identity: scopeIdentity(result)}
    })
  }

  async warm(): Promise<void> {
    if (this.disposed) return
    this.ensureWorkspaceIdentity()
    this.startStream()
    this.warmController?.abort()
    const controller = new AbortController()
    this.warmController = controller
    try {
      await this.cache.ensureLoaded(controller.signal)
      this.recordResolvedScope()
    } finally {
      if (this.warmController === controller) this.warmController = null
    }
  }

  async candidates(request: CandidateRequest): Promise<readonly InputTriggerCandidate[]> {
    if (this.disposed) return []
    this.ensureWorkspaceIdentity()
    this.startStream()
    const entries = await this.cache.find(
      request.query.replace(/^loop(?:\s*[·:]\s*|\s+|$)/iu, ''),
      (entry, query) =>
        loopSkillDisplayName(entry).toLocaleLowerCase().includes(query) ||
        entry.description?.toLocaleLowerCase().includes(query) === true ||
        entry.libraryName.toLocaleLowerCase().includes(query) ||
        entry.librarySlug?.toLocaleLowerCase().includes(query) === true ||
        entry.path.toLocaleLowerCase().includes(query),
      request.signal,
      2,
    )
    this.recordResolvedScope()
    const sorted = [...entries].sort((left, right) =>
      left.name.localeCompare(right.name) ||
      left.libraryName.localeCompare(right.libraryName) ||
      left.path.localeCompare(right.path))
    const counts = new Map<string, number>()
    for (const entry of sorted) {
      const key = entry.name.toLocaleLowerCase()
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    return sorted.map(entry =>
      loopSkillCandidate(this.sessionId, entry, (counts.get(entry.name.toLocaleLowerCase()) ?? 0) > 1))
  }

  pick(pick: InputTriggerPick): ReturnType<InputTriggerSource['onPick']> {
    return pickedLoopSkill(pick, this.sessionId)
  }

  codec() {
    return loopSkillCodec(this.sessionId, this.options.formatFailure)
  }

  async serialize(value: string, signal: AbortSignal): Promise<string> {
    return await this.codec().serialize(value, signal)
  }

  private startStream(): void {
    if (this.stream !== null || this.options.remote.skillCatalogEvents === undefined) return
    const controller = new AbortController()
    this.stream = controller
    void (async () => {
      try {
        for await (const frame of this.options.subscribeCatalogEvents(this.sessionId, controller.signal)) {
          if (controller.signal.aborted) break
          this.applyFrame(frame)
        }
      } catch {
        if (!controller.signal.aborted) {
          this.cache.reset()
        }
      } finally {
        if (this.stream === controller) {
          this.stream = null
          if (!controller.signal.aborted && !this.disposed) this.cache.invalidate()
        }
      }
    })()
  }

  private applyFrame(frame: SkillCatalogEventFrame): void {
    if (frame.type === 'ready') {
      if (frame.subscription.snapshotRequired ||
          frame.subscription.state === 'backoff' ||
          frame.subscription.state === 'revoked' ||
          frame.subscription.state === 'stopped') this.cache.invalidate()
      return
    }
    const event = frame.event
    if (event.sessionId !== this.sessionId) return
    if (event.eventId !== '' && this.seenEventIds.has(event.eventId)) return
    if (event.eventId !== '') {
      this.seenEventIds.add(event.eventId)
      if (this.seenEventIds.size > 256) {
        const oldest = this.seenEventIds.values().next().value
        if (oldest !== undefined) this.seenEventIds.delete(oldest)
      }
    }
    if (event.kind === 'subscription.changed') {
      if (event.status?.snapshotRequired === true ||
          event.status?.state === 'backoff' ||
          event.status?.state === 'revoked' ||
          event.status?.state === 'stopped') {
        this.cache.invalidate()
      }
      return
    }
    if (event.kind !== 'catalog.changed') return
    const eventScope = catalogScopeKey('skills', this.sessionId, {
      serverBaseUrl: event.serverBaseUrl,
      accountId: event.accountId,
      installationId: event.installationId,
      workspaceId: event.workspaceId,
      hostWorkspaceId: this.options.workspaceForSession(this.sessionId)?.workspaceId ?? '',
      bindingRevision: event.bindingRevision,
      projectId: event.projectId,
      agentId: event.agentId,
      identityFingerprint: event.identityFingerprint,
    })
    if (this.resolvedScope !== '' && eventScope !== this.resolvedScope) {
      this.cache.reset()
      this.resolvedScope = ''
      return
    }
    this.cache.invalidate()
  }

  private recordResolvedScope(): void {
    if (!this.cache.state().loaded) return
    this.resolvedScope = catalogScopeKey('skills', this.sessionId, this.cache.scopeIdentity())
  }

  private ensureWorkspaceIdentity(): void {
    const workspace = this.options.workspaceForSession(this.sessionId)
    const next = workspace?.workspaceId ?? ''
    if (next === this.hostWorkspaceId) return
    this.hostWorkspaceId = next
    this.stream?.abort()
    this.stream = null
    this.cache.setIdentity({
      serverBaseUrl: '',
      accountId: '',
      installationId: '',
      workspaceId: next,
      hostWorkspaceId: next,
    })
    this.resolvedScope = ''
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.warmController?.abort()
    this.warmController = null
    this.stream?.abort()
    this.stream = null
    this.seenEventIds.clear()
    this.cache.reset()
  }
}

/** Root registry for the Loop-owned `/` Skill source. */
export class LoopSkillRuntime {
  private readonly options: LoopSkillRuntimeOptions
  private readonly sessions = new Map<string, LoopSkillSessionRuntime>()
  private readonly streams = new Map<string, {
    readonly controller: AbortController
    readonly history: SkillCatalogEventFrame[]
    readonly listeners: Set<(frame: SkillCatalogEventFrame) => void>
  }>()

  constructor(options: LoopSkillRuntimeOptions) {
    this.options = options
  }

  private forSession(sessionId: string): LoopSkillSessionRuntime {
    const existing = this.sessions.get(sessionId)
    if (existing !== undefined) return existing
    const created = new LoopSkillSessionRuntime(sessionId, {
      ...this.options,
      subscribeCatalogEvents: (id, signal) => this.catalogEvents(id, signal),
    })
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

  private localizedFailure(error: unknown, fallbackCode: string): LoopSkillRuntimeError {
    return withLocalizedLoopSkillMessage(
      asLoopSkillRuntimeError(error, fallbackCode),
      this.options.formatFailure,
    )
  }

  private ensureStream(
    workspaceId: string,
    sessionId: string,
  ): {
    readonly controller: AbortController
    readonly history: SkillCatalogEventFrame[]
    readonly listeners: Set<(frame: SkillCatalogEventFrame) => void>
  } {
    const existing = this.streams.get(workspaceId)
    if (existing !== undefined) return existing
    if (this.streams.size >= 16) {
      throw loopSkillError('loop-host/queue-full', 'Too many Loop Skill Host workspaces are active.')
    }
    if (this.options.remote.skillCatalogEvents === undefined) {
      throw loopSkillError(
        'loop-host/capability-unsupported',
        'This Loop Host needs an update to receive Loop Skill updates.',
      )
    }
    const controller = new AbortController()
    const entry = {
      controller,
      history: [] as SkillCatalogEventFrame[],
      listeners: new Set<(frame: SkillCatalogEventFrame) => void>(),
    }
    this.streams.set(workspaceId, entry)
    void (async () => {
      try {
        for await (const frame of this.options.remote.skillCatalogEvents!({
          workspaceId,
          sessionId,
        }, controller.signal)) {
          if (controller.signal.aborted) break
          entry.history.push(frame)
          if (entry.history.length > 64) entry.history.shift()
          for (const listener of [...entry.listeners]) listener(frame)
        }
      } catch {
        // The next explicit catalog request reports connection failures.
      } finally {
        entry.controller.abort()
        if (this.streams.get(workspaceId) === entry) this.streams.delete(workspaceId)
      }
    })()
    return entry
  }

  catalogEvents(
    sessionId: string,
    signal: AbortSignal,
  ): AsyncIterable<SkillCatalogEventFrame> {
    const workspace = this.options.workspaceForSession(sessionId)
    if (workspace === undefined) {
      throw loopSkillError(
        'loop-host/workspace-required',
        'Open this Session from a workspace before using Loop Skill updates.',
      )
    }
    return this.workspaceCatalogEvents(workspace.workspaceId, sessionId, signal)
  }

  private async *workspaceCatalogEvents(
    workspaceId: string,
    sessionId: string,
    signal: AbortSignal,
  ): AsyncIterable<SkillCatalogEventFrame> {
    const entry = this.ensureStream(workspaceId, sessionId)
    const queue = entry.history.map(frame => this.forSessionFrame(frame, sessionId))
    let wake: (() => void) | undefined
    const notify = () => {
      const resolve = wake
      wake = undefined
      resolve?.()
    }
    const listener = (frame: SkillCatalogEventFrame) => {
      queue.push(this.forSessionFrame(frame, sessionId))
      notify()
    }
    const abort = () => notify()
    signal.addEventListener('abort', abort, {once: true})
    entry.controller.signal.addEventListener('abort', abort, {once: true})
    entry.listeners.add(listener)
    try {
      while (!signal.aborted && (queue.length > 0 || !entry.controller.signal.aborted)) {
        if (queue.length === 0) {
          await new Promise<void>(resolve => { wake = resolve })
          continue
        }
        yield queue.shift()!
      }
    } finally {
      signal.removeEventListener('abort', abort)
      entry.controller.signal.removeEventListener('abort', abort)
      entry.listeners.delete(listener)
      if (entry.listeners.size === 0) {
        entry.controller.abort()
        if (this.streams.get(workspaceId) === entry) this.streams.delete(workspaceId)
      }
    }
  }

  private forSessionFrame(
    frame: SkillCatalogEventFrame,
    sessionId: string,
  ): SkillCatalogEventFrame {
    if (frame.type !== 'change') return frame
    return {
      ...frame,
      event: {...frame.event, sessionId},
    }
  }

  registerSource(
    inputTriggers: InputTriggerServiceContract,
    section: string,
  ): () => void {
    const owner = this
    const source: InputTriggerSource = {
      trigger: '/',
      name: 'loop-skills',
      order: 25,
      showGroupTitle: false,
      codec: {
        clipboardText: value => {
          const reference = decodeLoopSkillReference(value)
          return reference === null ? '' : `/${reference.name}`
        },
        serialize: async (value, signal) => {
          const decoded = decodeLoopSkillReferenceResult(value)
          if (decoded instanceof Error) {
            throw owner.localizedFailure(decoded, 'loop-skill/invalid-reference')
          }
          const runtime = this.sessions.get(decoded.sessionId)
          if (runtime === undefined) {
            const error = loopSkillError(
              'loop-skill/session-inactive',
              'This Loop Skill reference belongs to an inactive Session.',
            )
            throw owner.localizedFailure(error, 'loop-skill/internal')
          }
          return await runtime.serialize(value, signal)
        },
      },
      async candidates(session: ClientSessionContext, request: CandidateRequest) {
        try {
          const runtime = owner.forSession(session.sessionId)
          const rows = await runtime.candidates(request)
          return rows.map(row => ({...row, section}))
        } catch (error) {
          if (request.signal.aborted) return []
          const failure = owner.localizedFailure(error, 'loop-skill/internal')
          owner.options.showFailure(failure)
          throw failure
        }
      },
      warm: session => {
        try {
          // Preloading is speculative. An explicit menu request reports failures;
          // focus changes and cancelled searches must not interrupt the user.
          void owner.forSession(session.sessionId).warm().catch(() => {})
        } catch {}
      },
      onPick: pick => {
        try {
          return owner.forSession(pick.session.sessionId).pick(pick)
        } catch (error) {
          owner.options.showFailure(owner.localizedFailure(error, 'loop-skill/internal'))
          return undefined
        }
      },
    }
    return inputTriggers.registerSource(source)
  }

  dispose(): void {
    for (const runtime of this.sessions.values()) runtime.dispose()
    this.sessions.clear()
    for (const stream of this.streams.values()) stream.controller.abort()
    this.streams.clear()
  }
}
