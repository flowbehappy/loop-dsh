/** Account-level upload authorization; local workspaces need no manual mapping. */

import { createSnapshotStore, type MutableSnapshotStore } from './store.ts'
import type {
  LoopHostClient,
  ProjectSyncChallenge,
  ProjectSyncSettings,
  RemoteResult,
  SyncProjectsResult,
} from './types.ts'

export type ProjectSyncScreen = 'idle' | 'loading' | 'ready' | 'error'
export type ProjectSyncBusy = 'read' | 'sync' | 'disconnect' | null

export interface ProjectSyncFailure {
  readonly code: string
  readonly message: string
}

export interface ProjectSyncUiState {
  readonly screen: ProjectSyncScreen
  readonly settings: ProjectSyncSettings | null
  readonly busy: ProjectSyncBusy
  readonly error: ProjectSyncFailure | null
  readonly challenge: ProjectSyncChallenge | null
  readonly challengeOpened: boolean
  readonly disconnecting: boolean
}

export const INITIAL_PROJECT_SYNC_STATE: ProjectSyncUiState = Object.freeze({
  screen: 'idle',
  settings: null,
  busy: null,
  error: null,
  challenge: null,
  challengeOpened: false,
  disconnecting: false,
})

export interface ProjectSyncActions {
  open(): void
  connect(): void
  refresh(): void
  disconnect(): void
  openChallenge(): void
  continueAfterAuth(): void
}

export interface ProjectSyncControllerOptions {
  readonly remote: LoopHostClient
  readonly openExternal: (url: string) => boolean
  readonly onAuthorized?: () => void
  readonly onDisconnected?: () => void
}

function failureOf(result: Extract<RemoteResult<unknown>, { readonly ok: false }>): ProjectSyncFailure {
  return { code: result.error.code, message: result.error.message }
}

function transportFailure(): ProjectSyncFailure {
  return { code: 'loop/transport', message: '' }
}

function capabilityFailure(): ProjectSyncFailure {
  return { code: 'loop/host-update-required', message: '' }
}

export class LoopProjectSyncController {
  readonly store: MutableSnapshotStore<ProjectSyncUiState>
  readonly actions: ProjectSyncActions
  private readonly remote: LoopHostClient
  private readonly onAuthorized: (() => void) | undefined
  private readonly onDisconnected: (() => void) | undefined
  private readonly openExternal: (url: string) => boolean
  private generation = 0
  private request: AbortController | null = null
  private authorizationTimer: ReturnType<typeof setTimeout> | null = null

  constructor(options: ProjectSyncControllerOptions) {
    this.onAuthorized = options.onAuthorized
    this.onDisconnected = options.onDisconnected
    this.remote = options.remote
    this.openExternal = options.openExternal
    this.store = createSnapshotStore(INITIAL_PROJECT_SYNC_STATE)
    this.actions = {
      open: () => { void this.open() },
      connect: () => { void this.syncProjects() },
      refresh: () => { void this.syncProjects() },
      disconnect: () => { void this.disconnect() },
      openChallenge: () => { this.openChallenge() },
      continueAfterAuth: () => { void this.checkAuthorization() },
    }
  }

  async open(): Promise<void> {
    const state = this.store.getSnapshot()
    if (state.busy !== null) return
    if (state.challenge !== null && Date.parse(state.challenge.expiresAt) > Date.now()) return
    if (this.remote.projectSyncSettings === undefined) {
      this.patch({ screen: 'error', error: capabilityFailure() })
      return
    }
    const generation = this.nextGeneration()
    const request = this.beginRequest()
    this.patch({ screen: 'loading', busy: 'read', error: null })
    const result = await this.call(
      signal => this.remote.projectSyncSettings!({}, signal),
      request.signal,
    )
    if (!this.current(generation, request)) return
    if (!result.ok) {
      this.patch({ screen: 'error', busy: null, error: failureOf(result) })
      return
    }
    this.applySettings(result.value, null)
  }

  dispose(): void {
    this.generation += 1
    this.clearAuthorizationTimer()
    this.request?.abort()
    this.request = null
    this.store.set(INITIAL_PROJECT_SYNC_STATE)
  }

  private async syncProjects(): Promise<void> {
    const state = this.store.getSnapshot()
    if (state.busy !== null) return
    if (this.remote.syncProjects === undefined) {
      this.patch({ error: capabilityFailure() })
      return
    }
    const generation = this.generation
    const request = this.beginRequest()
    this.patch({ busy: 'sync', error: null })
    const result = await this.call(
      signal => this.remote.syncProjects!({}, signal),
      request.signal,
    )
    if (!this.current(generation, request)) return
    if (!result.ok) {
      this.patch({ busy: null, error: failureOf(result) })
      this.clearAuthorizationTimer()
      return
    }
    this.applySettings(result.value, result.value)
    if ((state.challenge !== null || state.settings?.state === 'needs_auth') &&
        (result.value.state === 'ready' || result.value.state === 'partial')) {
      this.onAuthorized?.()
    }
  }

  private checkAuthorization(): void {
    if (this.store.getSnapshot().disconnecting) void this.disconnect()
    else void this.syncProjects()
  }

  private async disconnect(): Promise<void> {
    const state = this.store.getSnapshot()
    if (state.busy !== null) return
    if (this.remote.disconnectAccount === undefined) {
      this.patch({error: capabilityFailure()})
      return
    }
    const generation = this.generation
    const request = this.beginRequest()
    this.clearAuthorizationTimer()
    this.patch({busy: 'disconnect', disconnecting: true, error: null})
    const result = await this.call(signal => this.remote.disconnectAccount!(state.challengeOpened && state.challenge?.recoveryMode ? {recoveryMode: state.challenge.recoveryMode} : {}, signal), request.signal)
    if (!this.current(generation, request)) return
    if (!result.ok) {
      this.patch({busy: null, error: failureOf(result)})
      return
    }
    if (result.value.state === 'signed_out') {
      this.patch({busy: null, challenge: null, challengeOpened: false, disconnecting: false, settings: null})
      this.onDisconnected?.()
      await this.open()
      return
    }
    const challenge = result.value.challenge ?? null
    this.patch({busy: null, challenge,
      challengeOpened: challenge !== null && challenge.id === state.challenge?.id && challenge.loginUrl === state.challenge.loginUrl && state.challengeOpened})
    this.scheduleAuthorizationCheck()
  }

  private openChallenge(): void {
    const challenge = this.store.getSnapshot().challenge
    if (challenge === null) return
    if (!(Date.parse(challenge.expiresAt) > Date.now())) {
      this.patch({challenge: null, challengeOpened: false, error: {code: 'loop-host/challenge-expired', message: ''}})
      return
    }
    const opened = this.openExternal(challenge.loginUrl)
    this.patch(opened
      ? { challengeOpened: true, error: null }
      : { error: { code: 'loop/popup-blocked', message: '' } })
    if (opened) this.scheduleAuthorizationCheck()
  }

  private applySettings(
    settings: ProjectSyncSettings,
    synced: SyncProjectsResult | null,
  ): void {
    const previous = this.store.getSnapshot()
    const challenge = synced?.challenge ?? null
    this.patch({
      screen: 'ready', settings, busy: null, error: null, challenge,
      disconnecting: settings.disconnectPending === true,
      challengeOpened: challenge !== null && challenge.id === previous.challenge?.id && challenge.loginUrl === previous.challenge.loginUrl && previous.challengeOpened,
    })
    this.scheduleAuthorizationCheck()
  }

  private clearAuthorizationTimer(): void {
    if (this.authorizationTimer !== null) clearTimeout(this.authorizationTimer)
    this.authorizationTimer = null
  }

  private scheduleAuthorizationCheck(): void {
    this.clearAuthorizationTimer()
    const state = this.store.getSnapshot()
    if (!state.challengeOpened || state.challenge === null) return
    const remaining = Date.parse(state.challenge.expiresAt) - Date.now()
    if (!Number.isFinite(remaining) || remaining <= 0) {
      this.patch({challenge: null, challengeOpened: false, error: {code: 'loop-host/challenge-expired', message: ''}})
      return
    }
    this.authorizationTimer = setTimeout(() => {
      this.authorizationTimer = null
      this.checkAuthorization()
    }, Math.min(1500, remaining))
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

  private patch(patch: Partial<ProjectSyncUiState>): void {
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
