/** Transient UI orchestration; Host remains the only credential/state owner. */
import type {LoopGlobalPageController} from './global-page-controller.ts'
import type {LoopModelController} from './model-controller.ts'
import type {LoopHostClient} from './types.ts'
import {createSnapshotStore} from './store.ts'
import type {PendingExternalLink} from './external-link.ts'
import {safeFailureText} from './failure-text.ts'

export interface AccountConnectionState {
  readonly phase: 'idle' | 'waiting' | 'connecting' | 'recovering' | 'ready' | 'error'
  readonly error: {readonly code: string; readonly message: string} | null
}

export class AccountConnectionController {
  readonly store = createSnapshotStore<AccountConnectionState>({phase: 'idle', error: null})
  private recovery = false
  private active = false
  private generation = 0
  private request: AbortController | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private scope = ''
  private challenge = ''
  private modelRetries = 0
  private external: PendingExternalLink | null = null
  private preparingModels = false
  private readonly disposers: Array<() => void>

  constructor(private readonly remote: LoopHostClient, private readonly page: LoopGlobalPageController,
    private readonly models: LoopModelController, private readonly locale: () => 'en' | 'zh',
    private readonly openExternal: (url: string) => boolean = () => false) {
    this.disposers = [page.store.subscribe(() => this.update()), page.sharedData.store.subscribe(() => this.update()),
      models.store.subscribe(() => this.updateModel())]
  }

  private errorGrant?: string
  private accessToken?:string

  start(external: PendingExternalLink | null = null, accessToken?:string): void {
    this.cancel()
    this.accessToken=accessToken
    this.external = external
    this.active = true
    this.store.set({phase: 'waiting', error: null})
    this.update()
  }

  /** Cancel any old login before sign-out or a new server selection. */
  reset(): void {
    this.cancel()
    this.store.set({phase: 'idle', error: null})
  }

  recover(external: PendingExternalLink | null = null): void {
    if (this.store.getSnapshot().error?.code !== 'loop-host/credential-unavailable') return
    this.cancel()
    this.external = external
    this.recovery = true
    this.active = true
    this.store.set({phase: 'recovering', error: null})
    this.update()
  }

  cancelRecovery(): void {
    if (this.store.getSnapshot().phase !== 'recovering') return
    this.cancel()
    this.store.set({phase: 'error', error: {code: 'loop-host/credential-unavailable', message: ''}})
  }

  dispose(): void { this.cancel(); this.disposers.forEach(dispose => dispose()) }

  private cancel(): void {
    this.accessToken=undefined
    this.active = false
    this.preparingModels = false
    this.external?.close(); this.external = null
    this.recovery = false
    this.generation += 1
    this.request?.abort()
    this.request = null
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    this.scope = ''; this.challenge = ''
    this.modelRetries = 0
  }

  private update(): void {
    const page = this.page.store.getSnapshot()
    if (!this.active) {
      if (this.store.getSnapshot().phase === 'error' && page.connection?.state === 'signed_in' &&
          page.connection.grantId && page.connection.grantId !== this.errorGrant) this.reset()
      return
    }
    const key = page.serverRevision
    if (this.scope !== '' && (page.serverBusy || (key !== '' && key !== this.scope))) {
      this.cancel()
      this.store.set({phase: 'error', error: {code: 'loop-host/conflict', message: ''}})
      return
    }
    if (this.scope !== '' || page.serverUrl === null || key === '' || page.serverBusy) return
    this.scope = key
    const generation = this.generation
    const requestPageAccess = !this.accessToken && !this.recovery && page.connection?.deviceOnly === true && page.connection.state === "signed_in"
    const input = {...(requestPageAccess ? {requestPageAccess: true as const} : {}), expectedServerRevision: page.serverRevision, locale: this.locale()}
    let pageChallengeExpiry = 0
    const poll = async (): Promise<void> => {
      if (generation !== this.generation) return
      if (pageChallengeExpiry && Date.now() >= pageChallengeExpiry) {
        this.fail('loop-host/challenge-expired')
        return
      }
      if (this.remote.connectAccount === undefined) { this.fail('loop/host-update-required'); return }
      this.request = new AbortController()
      try {
        const accessToken=this.accessToken
        this.accessToken=undefined
        const recoverCredentials = this.recovery
        this.recovery = false // An explicit click authorizes one attempt, never a polling loop.
        const result = await this.remote.connectAccount({...input,...(accessToken ? {accessToken} : {}),
          ...(recoverCredentials ? {recoverCredentials: true as const} : {})}, this.request.signal)
        if (generation !== this.generation) return
        if (!result.ok) { this.fail(result.error.code, result.error.message); return }
        if (result.value.state === 'connected') {
          this.active = false
          this.external?.close(); this.external = null
          this.preparingModels = true
          this.store.set({phase: 'ready', error: null})
          // Credential publication is complete. Content and catalog work is
          // independent, recoverable, and must not delay login completion.
          void this.page.reconnect()
          void this.models.open(true).then(() => this.updateModel())
          return
        }
        if(accessToken){this.fail("loop/host-update-required");return}
        const challenge = result.value.challenge
        if (requestPageAccess) pageChallengeExpiry = Date.parse(challenge.expiresAt)
        if (this.challenge !== challenge.id) {
          if (!(this.external?.open(challenge.loginUrl) ?? this.openExternal(challenge.loginUrl))) { this.fail('loop/popup-blocked'); return }
          this.challenge = challenge.id
        }
        this.store.set({phase: 'connecting', error: null})
        this.timer = setTimeout(() => { this.timer = null; void poll() }, 800)
      } catch (error) {
        if (generation === this.generation) this.fail('loop/transport', error instanceof Error ? error.message : '')
      }
    }
    void poll()
  }

  private updateModel(): void {
    if (!this.preparingModels) return
    const state = this.models.store.getSnapshot()
    const readiness = state.readiness
    if (state.busy !== null || readiness.kind === 'loading') return
    if (readiness.kind === 'loop-ready' || readiness.kind === 'external-ready') {
      this.preparingModels = false
      if (this.timer !== null) clearTimeout(this.timer)
      this.timer = null
      this.store.set({phase: 'ready', error: null})
    } else if (readiness.kind === 'selection-required' && state.busy === null && state.error === null) {
      this.models.ensureSelection()
    } else if (state.error !== null) {
      this.modelFailure(state.error.code, state.error.message)
    } else if (readiness.kind === 'no-models') {
      // The first local catalog may still be empty. Observe its background
      // update without polling or holding the completed login open.
      return
    } else if (readiness.kind === 'error' || readiness.kind === 'catalog-unavailable') {
      this.modelFailure(readiness.error?.code ?? 'loop/transport', readiness.error?.message)
    }
  }

  private modelFailure(code: string, message = ''): void {
    // Saving the native default emits a catalog reset. Let that read settle
    // before reporting its superseded request as a failed account connection.
    if ((code === 'loop/transport' || code === 'loop/catalog-timeout') && this.modelRetries < 3) {
      if (this.timer !== null) return
      this.modelRetries += 1
      const generation = this.generation
      this.timer = setTimeout(() => {
        this.timer = null
        if (!this.preparingModels || generation !== this.generation) return
        void this.models.open(true).then(() => this.updateModel(), () => {
          if (this.preparingModels && generation === this.generation) this.modelFailure('loop/transport')
        })
      }, 500)
      return
    }
    this.preparingModels = false
  }

  private fail(code: string, message = ''): void {
    this.errorGrant = this.page.store.getSnapshot().connection?.grantId
    console.warn('[Loop sign-in]', code, safeFailureText(message))
    this.active = false
    this.store.set({phase: 'error', error: {code, message}})
    this.external?.close(); this.external = null
  }
}
