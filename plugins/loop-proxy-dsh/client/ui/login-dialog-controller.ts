/** Dialog lifetime only; existing Host-backed controllers own all account data. */
import type {AccountConnectionController} from './account-connection-controller.ts'
import {normalizedLoopServerUrl, type LoopGlobalPageController} from './global-page-controller.ts'
import type {LoopModelController} from './model-controller.ts'
import type {LoopProjectSyncController} from './project-sync-controller.ts'
import type {PendingExternalLink} from './external-link.ts'
import {createSnapshotStore} from './store.ts'

export interface LoginDialogState {
  readonly open: boolean
  readonly busy: boolean
}

export class LoginDialogController {
  readonly store = createSnapshotStore<LoginDialogState>({open: false, busy: false})
  private generation = 0
  private serverRevision: string
  private readonly unsubscribe: () => void

  constructor(private readonly page: LoopGlobalPageController,
    private readonly account: AccountConnectionController,
    private readonly sync: LoopProjectSyncController,
    private readonly models: LoopModelController,
    private readonly openLoop: () => void,
    private readonly prepareExternal: () => PendingExternalLink | null = () => null) {
    this.serverRevision = page.store.getSnapshot().serverRevision
    this.unsubscribe = page.store.subscribe(() => {
      const state = page.store.getSnapshot()
      if (state.serverBusy || state.screen === 'loading' || this.serverRevision === state.serverRevision) return
      this.serverRevision = state.serverRevision
      // An old server's read/confirmation must never populate the new dialog.
      sync.dispose()
      if (this.store.getSnapshot().open) void sync.open()
    })
  }

  readonly open = (): void => {
    if (this.store.getSnapshot().open) return
    this.page.changeServerUrl(this.page.store.getSnapshot().serverUrl ?? '')
    this.store.set({open: true, busy: false})
    if (this.page.store.getSnapshot().screen === 'ready') void this.page.refreshConnection()
    else void this.page.open()
    void this.sync.open()
    void this.models.open()
  }

  readonly close = (): void => {
    this.generation += 1
    this.store.set({open: false, busy: false})
  }

  readonly login = async (accessToken?:string): Promise<void> => {
    const dialog = this.store.getSnapshot()
    const sync = this.sync.store.getSnapshot()
    if (!dialog.open || dialog.busy || sync.disconnecting || sync.busy !== null) return
    const external = accessToken ? null : this.prepareExternal()
    const generation = ++this.generation
    this.store.set({open: true, busy: true})
    const before = this.page.store.getSnapshot()
    const normalize = (value: string) => normalizedLoopServerUrl(value)?.replace(/\/+$/u, '')
    const changingServer = !before.serverUrl || normalize(before.serverDraft) !== normalize(before.serverUrl)
    const recovering = !accessToken && !changingServer && this.account.store.getSnapshot().error?.code === 'loop-host/credential-unavailable'
    if (!recovering) this.account.reset()
    if (changingServer) {
      await this.page.saveServer()
    }
    if (generation !== this.generation) { external?.close(); return }
    this.store.set({open: true, busy: false})
    const page = this.page.store.getSnapshot()
    if (page.serverError !== null || page.serverUrl === null || page.serverRevision === '' ||
        (accessToken && normalize(page.serverUrl) !== normalize(before.serverDraft))) { external?.close(); return }
    if (recovering) this.account.recover(external)
    else this.account.start(external,accessToken)
  }

  readonly authorizePages = (): void => {
    this.account.start(this.prepareExternal())
  }

  readonly logout = (): void => {
    if (this.store.getSnapshot().busy || this.page.store.getSnapshot().serverBusy || this.sync.store.getSnapshot().busy !== null) return
    this.account.reset()
    this.page.suspend()
    const state = this.sync.store.getSnapshot()
    if (state.disconnecting && state.challenge !== null) {
      if (state.challengeOpened) this.sync.actions.continueAfterAuth()
      else this.sync.actions.openChallenge()
    } else {
      this.sync.actions.disconnect()
    }
  }

  dispose(): void { this.close(); this.unsubscribe() }
}
