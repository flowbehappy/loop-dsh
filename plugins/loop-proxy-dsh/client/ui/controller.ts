/** Remote-backed state machine for the DSH Loop binding and sync surfaces. */

import { createSnapshotStore, type MutableSnapshotStore } from './store.ts'
import type { PendingExternalLink } from './external-link.ts'
import type {
  AgentChoice,
  BindingView,
  LoopHostClient,
  ProjectChoice,
  RemoteResult,
  SessionContext,
  SyncState,
  WorkspaceRef,
} from './types.ts'

export type UiMode = 'inspect' | 'bind' | 'switch' | 'unbind'
export type UiScreen = 'closed' | 'loading' | 'binding' | 'active'
export type UiBusy =
  | 'status'
  | 'bind'
  | 'project'
  | 'complete'
  | 'unbind'
  | 'sync'
  | null

export interface UiFailure {
  readonly code: string
  readonly message: string
}

export interface DisconnectChallenge {
  readonly id: string
  readonly loginUrl: string
  readonly expiresAt: string
  readonly recoveryMode?: 'human_confirmed'
}

export interface LoopUiState {
  readonly screen: UiScreen
  readonly mode: UiMode
  readonly workspace: WorkspaceRef | null
  readonly sessionId: string | null
  readonly binding: BindingView | null
  readonly challengeId: string | null
  readonly loginUrl: string | null
  readonly loginOpened: boolean
  readonly projects: readonly ProjectChoice[]
  readonly agents: readonly AgentChoice[]
  readonly selectedProjectId: string
  readonly selectedAgentId: string
  readonly newProjectName: string
  readonly newProjectPrefix: string
  readonly busy: UiBusy
  readonly error: UiFailure | null
  readonly confirmUnbind: boolean
  readonly disconnectChallenge: DisconnectChallenge | null
  readonly disconnectLoginOpened: boolean
  readonly syncContext: SessionContext | null
  readonly sync: SyncState | null
  readonly syncError: UiFailure | null
  readonly syncLoginOpened: boolean
}

export const CLOSED_UI_STATE: LoopUiState = Object.freeze({
  screen: 'closed',
  mode: 'inspect',
  workspace: null,
  sessionId: null,
  binding: null,
  challengeId: null,
  loginUrl: null,
  loginOpened: false,
  projects: [],
  agents: [],
  selectedProjectId: '',
  selectedAgentId: '',
  newProjectName: '',
  newProjectPrefix: '',
  busy: null,
  error: null,
  confirmUnbind: false,
  disconnectChallenge: null,
  disconnectLoginOpened: false,
  syncContext: null,
  sync: null,
  syncError: null,
  syncLoginOpened: false,
})

export interface LoopUiActions {
  close(): void
  retry(): void
  connect(): void
  openLogin(): void
  continueAfterLogin(): void
  selectProject(projectId: string): void
  selectAgent(agentId: string): void
  changeNewProjectName(name: string): void
  changeNewProjectPrefix(prefix: string): void
  createProject(): void
  completeBind(): void
  switchProject(): void
  requestUnbind(): void
  cancelUnbind(): void
  confirmUnbind(): void
  openDisconnectLogin(): void
  checkDisconnect(): void
  openProject(): void
  toggleSync(enabled: boolean): void
  authorizeSync(): void
  openSyncLogin(): void
  refreshSync(): void
  clearError(): void
  openLoopModules(): void
}

export interface LoopUiControllerOptions {
  readonly remote: LoopHostClient
  readonly openExternal: (url: string) => boolean
  readonly prepareExternal?: () => PendingExternalLink
  readonly openLoopModules?: () => void
  readonly openLoopProject?: (target: {
    readonly projectId: string
    readonly loopWorkspaceId: string
    readonly serviceBaseUrl: string
  }) => Promise<boolean>
  readonly beginBindLocale?: () => 'zh' | 'en' | undefined
  readonly syncPollIntervalMs?: number
}

function failureOf(result: Extract<RemoteResult<unknown>, { readonly ok: false }>): UiFailure {
  return {
    code: result.error.code,
    message: result.error.message,
  }
}

function parseDisconnectChallenge(
  error: UiFailure & { readonly details?: unknown }
): DisconnectChallenge | null {
  if (error.code !== 'loop-host/disconnect-auth-required') return null
  if (error.details === null || typeof error.details !== 'object' ||
      Array.isArray(error.details)) {
    return null
  }
  const value = (error.details as Record<string, unknown>).challenge
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  if (typeof candidate.id !== 'string' || candidate.id === '' ||
      typeof candidate.loginUrl !== 'string' || candidate.loginUrl === '' ||
      typeof candidate.expiresAt !== 'string' || candidate.expiresAt === '') {
    return null
  }
  if (candidate.recoveryMode !== undefined && candidate.recoveryMode !== 'human_confirmed') {
    return null
  }
  return {
    id: candidate.id,
    loginUrl: candidate.loginUrl,
    expiresAt: candidate.expiresAt,
    ...(candidate.recoveryMode === 'human_confirmed'
      ? { recoveryMode: candidate.recoveryMode }
      : {}),
  }
}

function transportFailure(): UiFailure {
  return { code: 'loop/transport', message: '' }
}

function capabilityFailure(): UiFailure {
  return { code: 'loop/host-update-required', message: '' }
}

function defaultProject(projects: readonly ProjectChoice[], binding: BindingView): string {
  const boundProjectId = binding.loop?.projectId
  if (boundProjectId !== undefined &&
      projects.some(project => project.projectId === boundProjectId)) {
    return boundProjectId
  }
  return projects[0]?.projectId ?? boundProjectId ?? ''
}

function defaultAgent(agents: readonly AgentChoice[], binding: BindingView): string {
  return binding.agent?.id ?? agents[0]?.agentId ?? ''
}

/**
 * Owns every UI transition. Remote success is applied only from a matching,
 * non-aborted response; local optimistic state is never treated as success.
 */
export class LoopUiController {
  readonly store: MutableSnapshotStore<LoopUiState>
  readonly actions: LoopUiActions
  private readonly remote: LoopHostClient
  private readonly openExternal: (url: string) => boolean
  private readonly prepareExternal: LoopUiControllerOptions['prepareExternal']
  private readonly openLoopModulesTarget: (() => void) | undefined
  private readonly openLoopProjectTarget: LoopUiControllerOptions['openLoopProject']
  private readonly beginBindLocale: LoopUiControllerOptions['beginBindLocale']
  private readonly syncPollIntervalMs: number
  private generation = 0
  private request: AbortController | null = null
  private syncPollTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: LoopUiControllerOptions) {
    this.remote = options.remote
    this.openExternal = options.openExternal
    this.prepareExternal = options.prepareExternal
    this.openLoopModulesTarget = options.openLoopModules
    this.openLoopProjectTarget = options.openLoopProject
    this.beginBindLocale = options.beginBindLocale
    this.syncPollIntervalMs = options.syncPollIntervalMs ?? 1200
    this.store = createSnapshotStore(CLOSED_UI_STATE)
    this.actions = {
      close: () => { this.close() },
      retry: () => { void this.retry() },
      connect: () => { void this.beginBind() },
      openLogin: () => { this.openLogin() },
      continueAfterLogin: () => { void this.beginBind() },
      selectProject: projectId => { this.patch({ selectedProjectId: projectId }) },
      selectAgent: agentId => { this.patch({ selectedAgentId: agentId }) },
      changeNewProjectName: name => { this.patch({ newProjectName: name }) },
      changeNewProjectPrefix: prefix => { this.patch({ newProjectPrefix: prefix }) },
      createProject: () => { void this.createProject() },
      completeBind: () => { void this.completeBind() },
      switchProject: () => { void this.openWorkspace(this.requireWorkspace(), 'switch', this.sessionId()) },
      requestUnbind: () => {
        this.patch({
          confirmUnbind: true,
          disconnectChallenge: null,
          disconnectLoginOpened: false,
          error: null,
        })
      },
      cancelUnbind: () => {
        this.patch({
          confirmUnbind: false,
          disconnectChallenge: null,
          disconnectLoginOpened: false,
        })
      },
      confirmUnbind: () => { void this.unbind() },
      openDisconnectLogin: () => { this.openDisconnectLogin() },
      checkDisconnect: () => { void this.unbind(this.store.getSnapshot().disconnectChallenge?.recoveryMode) },
      openProject: () => { void this.openProject() },
      toggleSync: enabled => { void this.toggleSync(enabled) },
      authorizeSync: () => { void this.authorizeSync() },
      openSyncLogin: () => { this.openSyncLogin() },
      refreshSync: () => { void this.refreshSync() },
      clearError: () => { this.patch({ error: null, syncError: null }) },
      openLoopModules: () => {
        this.dispose()
        this.openLoopModulesTarget?.()
      },
    }
  }

  /** Stop all in-flight UI work and hide the surface. */
  dispose(): void {
    this.clearSyncPoll()
    this.generation += 1
    this.request?.abort()
    this.request = null
    this.store.set(CLOSED_UI_STATE)
  }

  /**
   * Inspect one exact Workspace target and open the matching user surface.
   * @param workspace - immutable context-menu payload.
   * @param mode - normal inspection, first bind, or explicit project switch.
   * @param sessionId - current Session for the optional sync section.
   */
  async openWorkspace(
    workspace: WorkspaceRef,
    mode: UiMode = 'inspect',
    sessionId?: string,
  ): Promise<void> {
    this.clearSyncPoll()
    const generation = this.nextGeneration()
    const request = this.beginRequest()
    this.store.set({
      ...CLOSED_UI_STATE,
      screen: 'loading',
      mode,
      workspace: { ...workspace },
      sessionId: sessionId ?? null,
      busy: 'status',
      disconnectChallenge: null,
      disconnectLoginOpened: false,
    })
    const result = await this.call(signal => this.remote.status({ ...workspace }, signal), request.signal)
    if (!this.current(generation, request)) return
    if (!result.ok) {
      this.patch({ screen: 'binding', busy: null, error: failureOf(result) })
      return
    }
    await this.acceptStatus(result.value, mode, generation, request)
  }

  /** Re-run the current target's authoritative read. */
  async retry(): Promise<void> {
    const state = this.store.getSnapshot()
    if (state.workspace === null) return
    await this.openWorkspace(
      state.workspace,
      state.mode,
      state.sessionId ?? undefined,
    )
  }

  /** Start or resume the Host-owned login/project-selection flow. */
  async beginBind(): Promise<void> {
    const state = this.store.getSnapshot()
    if (state.workspace === null || state.busy !== null) return
    const generation = this.generation
    const request = this.beginRequest()
    this.patch({ busy: 'bind', error: null })
    const locale = this.beginBindLocale?.()
    const result = await this.call(signal => this.remote.beginBind({
      ...state.workspace as WorkspaceRef,
      mode: state.mode === 'switch' ? 'switch' : 'bind',
      ...(locale === undefined ? {} : { locale }),
    }, signal), request.signal)
    if (!this.current(generation, request)) return
    if (!result.ok) {
      this.patch({ busy: null, error: failureOf(result) })
      return
    }
    const value = result.value
    if (value.state === 'active') {
      this.patch({
        screen: 'active',
        busy: null,
        binding: value.binding,
        projects: [],
        agents: [],
        challengeId: null,
        loginUrl: null,
        error: null,
      })
      void this.loadSync(generation)
      return
    }
    if (value.state === 'needs_auth') {
      this.patch({
        screen: 'binding',
        busy: null,
        binding: value.binding,
        challengeId: value.challenge?.id ?? null,
        loginUrl: value.challenge?.loginUrl ?? null,
        projects: [],
        agents: [],
        error: value.challenge === undefined ? capabilityFailure() : null,
      })
      return
    }
    const projects = value.projects ?? []
    const agents = value.agents ?? []
    this.patch({
      screen: 'binding',
      busy: null,
      binding: value.binding,
      challengeId: value.challenge?.id ?? null,
      loginUrl: null,
      projects,
      agents,
      selectedProjectId: defaultProject(projects, value.binding),
      selectedAgentId: defaultAgent(agents, value.binding),
    })
  }

  /** Open the Host-provided login page after a direct user gesture. */
  openLogin(): void {
    const state = this.store.getSnapshot()
    if (state.loginUrl === null) {
      if (state.workspace !== null && state.busy === null) {
        void this.beginBind()
      } else {
        this.patch({ error: capabilityFailure() })
      }
      return
    }
    const opened = this.openExternal(state.loginUrl)
    this.patch(opened
      ? { loginOpened: true, error: null }
      : { error: { code: 'loop/popup-blocked', message: '' } })
  }

  /** Create and select a Project inside the current challenge. */
  async createProject(): Promise<void> {
    const state = this.store.getSnapshot()
    const workspace = state.workspace
    const name = state.newProjectName.trim()
    const prefix = state.newProjectPrefix.trim().toUpperCase()
    if (workspace === null || name === '' || state.busy !== null) return
    if (!/^[A-Z]{1,32}$/.test(prefix)) {
      this.patch({ error: { code: 'loop/project-prefix-invalid', message: '' } })
      return
    }
    if (state.challengeId === null) {
      this.patch({ error: { code: 'loop/challenge-required', message: '' } })
      return
    }
    if (this.remote.createProject === undefined) {
      this.patch({ error: capabilityFailure() })
      return
    }
    const generation = this.generation
    const request = this.beginRequest()
    this.patch({ busy: 'project', error: null })
    const result = await this.call(signal => this.remote.createProject!({
      ...workspace,
      challengeId: state.challengeId as string,
      name,
      prefix,
    }, signal), request.signal)
    if (!this.current(generation, request)) return
    if (!result.ok) {
      this.patch({ busy: null, error: failureOf(result) })
      return
    }
    const project = result.value
    this.patch({
      busy: null,
      projects: [...state.projects.filter(row => row.projectId !== project.projectId), project],
      selectedProjectId: project.projectId,
      newProjectName: '',
      newProjectPrefix: '',
    })
  }

  /** Complete a binding from the explicitly selected Project and Agent. */
  async completeBind(): Promise<void> {
    const state = this.store.getSnapshot()
    if (state.workspace === null || state.busy !== null) return
    if (state.challengeId === null) {
      this.patch({ error: { code: 'loop/challenge-required', message: '' } })
      return
    }
    if (state.selectedProjectId === '' || state.selectedAgentId === '') {
      this.patch({ error: { code: 'loop/selection-required', message: '' } })
      return
    }
    const generation = this.generation
    const request = this.beginRequest()
    this.patch({ busy: 'complete', error: null })
    const result = await this.call(signal => this.remote.completeBind({
      ...state.workspace as WorkspaceRef,
      challengeId: state.challengeId as string,
      projectId: state.selectedProjectId,
      agentId: state.selectedAgentId,
      ...(state.binding?.revision === undefined || state.binding.revision === ''
        ? {}
        : { expectedRevision: state.binding.revision }),
    }, signal), request.signal)
    if (!this.current(generation, request)) return
    if (!result.ok) {
      this.patch({ busy: null, error: failureOf(result) })
      return
    }
    this.patch({
      screen: 'active',
      busy: null,
      binding: result.value.binding,
      projects: [],
      agents: [],
      challengeId: null,
      loginUrl: null,
      error: null,
    })
    void this.loadSync(generation)
  }

  /** Remove this Workspace's project binding through the Host revision fence. */
  async unbind(recoveryMode?: 'human_confirmed'): Promise<void> {
    const state = this.store.getSnapshot()
    if (state.workspace === null || state.binding === null || state.busy !== null) return
    const generation = this.generation
    const request = this.beginRequest()
    this.patch({ busy: 'unbind', error: null })
    const result = await this.call(signal => this.remote.unbind({
      ...state.workspace as WorkspaceRef,
      expectedRevision: (state.binding as BindingView).revision,
      ...(recoveryMode === 'human_confirmed' ? { recoveryMode } : {}),
    }, signal), request.signal)
    if (!this.current(generation, request)) return
    if (!result.ok) {
      const disconnectChallenge = parseDisconnectChallenge(result.error)
      this.patch({
        busy: null,
        error: disconnectChallenge !== null
          ? null
          : failureOf(result),
        disconnectChallenge,
        disconnectLoginOpened: false,
      })
      return
    }
    const binding = result.value.binding
    this.patch({
      screen: binding.state === 'active' ? 'active' : 'binding',
      busy: null,
      confirmUnbind: false,
      disconnectChallenge: null,
      disconnectLoginOpened: false,
      binding,
      sync: null,
      syncContext: null,
      syncError: null,
      syncLoginOpened: false,
      error: null,
    })
  }

  private openDisconnectLogin(): void {
    const challenge = this.store.getSnapshot().disconnectChallenge
    if (challenge === null) return
    const opened = this.openExternal(challenge.loginUrl)
    this.patch({
      disconnectLoginOpened: opened,
      error: opened ? null : { code: 'loop/popup-blocked', message: '' },
    })
  }

  /**
   * Leave the binding surface and route the shared Loop page to one confirmed
   * project. A different server or an unavailable target keeps the overlay open.
   */
  async openProject(): Promise<void> {
    const state = this.store.getSnapshot()
    const binding = state.binding
    const loop = binding?.loop
    if (binding?.state !== 'active' || loop === undefined || state.busy !== null ||
        this.openLoopProjectTarget === undefined) {
      return
    }
    const generation = this.generation
    const request = this.beginRequest()
    this.patch({ busy: 'project', error: null })
    let opened = false
    try {
      opened = await this.openLoopProjectTarget({
        projectId: loop.projectId,
        loopWorkspaceId: loop.workspaceId,
        serviceBaseUrl: loop.serviceBaseUrl,
      })
    } catch {
      opened = false
    }
    if (!this.current(generation, request)) return
    if (opened) {
      this.dispose()
      return
    }
    this.patch({
      busy: null,
      error: { code: 'loop/project-target', message: '' },
    })
  }

  /** Toggle one Session's sync only after the Host returns the new durable state. */
  async toggleSync(enabled: boolean, prepared?: PendingExternalLink): Promise<void> {
    const state = this.store.getSnapshot()
    if (state.workspace === null || state.sessionId === null || state.busy !== null) {
      prepared?.close()
      return
    }
    const generation = this.generation
    const request = this.beginRequest()
    this.patch({ busy: 'sync', syncError: null })
    const result = await this.call(signal => this.remote.setSync({
      workspaceId: state.workspace?.workspaceId as string,
      sessionId: state.sessionId as string,
      enabled,
    }, signal), request.signal)
    if (!this.current(generation, request)) {
      prepared?.close()
      return
    }
    if (!result.ok) {
      prepared?.close()
      this.patch({ busy: null, syncError: failureOf(result) })
      return
    }
    const currentChallenge = state.sync?.challenge?.id
    const nextChallenge = result.value.sync.challenge?.id
    this.patch({
      busy: null,
      sync: result.value.sync,
      syncError: null,
      syncLoginOpened: nextChallenge !== undefined &&
        (currentChallenge === undefined || currentChallenge === nextChallenge) &&
        state.syncLoginOpened,
    })
    if (prepared !== undefined) {
      if (result.value.sync.challenge !== undefined) {
        this.openSyncAuthorization(result.value.sync, prepared)
      } else {
        prepared.close()
      }
    }
  }

  /**
   * Start the independent host-sync authorization if needed, then navigate the
   * browser window opened by this click. The prepared window keeps the browser
   * handoff inside the user gesture even when the Host is creating a challenge.
   */
  async authorizeSync(): Promise<void> {
    const state = this.store.getSnapshot()
    if (state.sync?.state === 'needs_auth' && state.sync.challenge !== undefined) {
      this.openSyncAuthorization(state.sync)
      return
    }
    if (state.workspace === null || state.sessionId === null || state.busy !== null) return
    const prepared = this.prepareExternal?.()
    await this.toggleSync(true, prepared)
  }

  /** Open the existing Loop consent page from the current Session surface. */
  openSyncLogin(): void {
    const state = this.store.getSnapshot()
    if (state.sync?.challenge === undefined) {
      this.patch({ syncError: { code: 'loop/challenge-required', message: '' } })
      return
    }
    this.openSyncAuthorization(state.sync)
  }

  private openSyncAuthorization(
    sync: SyncState,
    prepared?: PendingExternalLink,
  ): void {
    const challenge = sync.challenge
    if (challenge === undefined) {
      prepared?.close()
      this.patch({ syncError: { code: 'loop/challenge-required', message: '' } })
      return
    }
    const opened = prepared?.open(challenge.loginUrl) ?? this.openExternal(challenge.loginUrl)
    this.patch(opened
      ? { syncLoginOpened: true, syncError: null }
      : { syncLoginOpened: false, syncError: { code: 'loop/popup-blocked', message: '' } })
    if (!opened) prepared?.close()
    if (opened) this.scheduleSyncPoll(challenge.id, 0)
  }

  /** Re-read sync state, optionally invoking the Host's bounded retry bridge. */
  async refreshSync(): Promise<void> {
    await this.loadSync(this.generation, true)
  }

  private async acceptStatus(
    binding: BindingView,
    mode: UiMode,
    generation: number,
    request: AbortController,
  ): Promise<void> {
    if (!this.current(generation, request)) return
    if (binding.state === 'active') {
      if (binding.loop === undefined) {
        this.patch({
          screen: 'binding',
          busy: null,
          binding,
          error: capabilityFailure(),
        })
        return
      }
      if (mode === 'switch') {
        this.patch({ binding, busy: null, mode: 'switch' })
        await this.beginBind()
        return
      }
      this.patch({
        screen: 'active',
        busy: null,
        binding,
        error: null,
        confirmUnbind: mode === 'unbind',
      })
      void this.loadSync(generation)
      return
    }
    if (binding.state === 'needs_auth') {
      this.patch({
        screen: 'binding',
        busy: null,
        binding,
        projects: [],
        agents: [],
        error: null,
      })
      await this.beginBind()
      return
    }
    this.patch({
      screen: 'binding',
      busy: null,
      binding,
      error: null,
    })
    if (mode === 'bind' || mode === 'switch') await this.beginBind()
  }

  private async loadSync(generation: number, retry = false): Promise<void> {
    const state = this.store.getSnapshot()
    if (state.workspace === null || state.sessionId === null || generation !== this.generation) return
    if (state.busy !== null && !retry) return
    const request = this.beginRequest()
    this.patch({ busy: 'sync', syncError: null })
    const contextResult = await this.call(signal => this.remote.sessionContext({
      workspaceId: state.workspace?.workspaceId as string,
      sessionId: state.sessionId as string,
    }, signal), request.signal)
    if (!this.current(generation, request)) return
    if (!contextResult.ok) {
      this.patch({ busy: null, syncContext: null, sync: null, syncError: failureOf(contextResult) })
      return
    }
    const context = contextResult.value
    if (context.state !== 'inherited') {
      this.patch({
        busy: null,
        syncContext: context,
        sync: null,
        syncError: {
          code: `loop/sync-${context.state}`,
          message: context.reason ?? '',
        },
      })
      return
    }
    const syncResult = retry && this.remote.retrySync !== undefined
      ? await this.call(signal => this.remote.retrySync!({
        workspaceId: state.workspace?.workspaceId as string,
        sessionId: context.sessionId,
      }, signal), request.signal)
      : await this.call(signal => this.remote.syncStatus({
        workspaceId: state.workspace?.workspaceId as string,
        sessionId: context.sessionId,
      }, signal), request.signal)
    if (!this.current(generation, request)) return
    if (!syncResult.ok) {
      this.patch({ busy: null, syncContext: context, sync: null, syncError: failureOf(syncResult) })
      return
    }
    this.patch({ busy: null, syncContext: context, sync: syncResult.value, syncError: null })
  }

  private close(): void {
    this.dispose()
  }

  private scheduleSyncPoll(challengeId: string | undefined, attempt: number): void {
    this.clearSyncPoll()
    if (challengeId === undefined || attempt >= 30) return
    const generation = this.generation
    const timer = setTimeout(() => {
      this.syncPollTimer = null
      const state = this.store.getSnapshot()
      if (generation !== this.generation || !state.syncLoginOpened ||
          (state.sync?.challenge !== undefined && state.sync.challenge.id !== challengeId)) {
        return
      }
      // A concurrent status read must not consume the pending consent intent.
      // Count busy retries as well so an unresponsive Host remains bounded.
      if (state.busy !== null) {
        this.scheduleSyncPoll(challengeId, attempt + 1)
        return
      }
      void this.pollSyncAuthorization(challengeId, generation, attempt + 1)
    }, this.syncPollIntervalMs)
    timer.unref?.()
    this.syncPollTimer = timer
  }

  private async pollSyncAuthorization(
    challengeId: string,
    generation: number,
    attempt: number,
  ): Promise<void> {
    await this.toggleSync(true)
    const state = this.store.getSnapshot()
    if (generation !== this.generation || !state.syncLoginOpened ||
        (state.sync?.challenge !== undefined && state.sync.challenge.id !== challengeId)) {
      return
    }
    this.scheduleSyncPoll(challengeId, attempt)
  }

  private clearSyncPoll(): void {
    if (this.syncPollTimer !== null) clearTimeout(this.syncPollTimer)
    this.syncPollTimer = null
  }

  private requireWorkspace(): WorkspaceRef {
    return this.store.getSnapshot().workspace ?? { workspaceId: '', path: '', displayTitle: '' }
  }

  private sessionId(): string | undefined {
    return this.store.getSnapshot().sessionId ?? undefined
  }

  private nextGeneration(): number {
    this.generation += 1
    this.request?.abort()
    return this.generation
  }

  private beginRequest(): AbortController {
    this.request?.abort()
    this.request = new AbortController()
    return this.request
  }

  private current(generation: number, request: AbortController): boolean {
    return generation === this.generation && !request.signal.aborted
  }

  private patch(patch: Partial<LoopUiState>): void {
    this.store.set({ ...this.store.getSnapshot(), ...patch })
  }

  private async call<T>(
    invoke: (signal: AbortSignal) => Promise<RemoteResult<T>>,
    signal: AbortSignal,
  ): Promise<RemoteResult<T>> {
    try {
      return await invoke(signal)
    } catch {
      return { ok: false, error: transportFailure() }
    }
  }
}
