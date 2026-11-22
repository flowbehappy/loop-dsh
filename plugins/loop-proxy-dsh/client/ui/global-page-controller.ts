/** Remote-backed lifecycle for the global Loop server and page. */

import { createSnapshotStore, type MutableSnapshotStore } from './store.ts'
import {
  globalWorkspaceBridgeInit,
  globalWorkspaceBridgeLocale,
  globalWorkspaceBridgeNavigate,
  isGlobalWorkspaceBridgeReady,
  newGlobalWorkspaceBridgeNonce,
  readGlobalWorkspaceBridgeRoute,
  readGlobalWorkspaceBridgeSelection,
  readGlobalWorkspaceBridgeWorkspaceCleared,
  sanitizedLoopPagePath,
  type GlobalWorkspaceSelection,
  type LoopLocale,
} from './global-workspace-bridge.ts'
import {
  LOOP_DEFAULT_PATH,
  loopModuleForPanel,
  loopPanelForPath,
  loopResourceLink,
} from './loop-navigation.ts'
import type {
  AccountLoginStatus,
  ConfigureGlobalServerResult,
  GlobalPageSession,
  GlobalServerStatus,
  LoopHostClient,
  RemoteResult,
} from './types.ts'
import {
  LoopSharedDataRuntime,
  readSharedDataMessage,
  type SharedDataIdentity,
} from './shared-data-runtime.ts'

export type GlobalPageScreen = 'idle' | 'loading' | 'ready' | 'error' | 'setup'

export interface GlobalPageFailure {
  readonly code: string
  readonly message: string
}

export interface GlobalPageState {
  readonly connection?: AccountLoginStatus
  readonly screen: GlobalPageScreen
  readonly page: GlobalPageSession | null
  readonly frameKey: number
  readonly error: GlobalPageFailure | null
  readonly serverUrl: string | null
  readonly serverRevision: string
  readonly serverDraft: string
  readonly serverBusy: boolean
  readonly serverError: GlobalPageFailure | null
  readonly loopWorkspaceId: string | null
  readonly workspaceError: GlobalPageFailure | null
  readonly activePath: string
}

export const INITIAL_GLOBAL_PAGE_STATE: GlobalPageState = Object.freeze({
  screen: 'idle',
  page: null,
  frameKey: 0,
  error: null,
  serverUrl: null,
  serverRevision: '',
  serverDraft: '',
  serverBusy: false,
  serverError: null,
  loopWorkspaceId: null,
  workspaceError: null,
  activePath: LOOP_DEFAULT_PATH,
})

export interface GlobalProjectTarget {
  readonly projectId: string
  readonly loopWorkspaceId: string
  readonly serviceBaseUrl: string
}

export interface GlobalWorksiteTarget {
  readonly loopWorkspaceId: string
  readonly serviceBaseUrl: string
}

export interface GlobalPageActions {
  open(): void
  reconnect(): void
  openProject(target: GlobalProjectTarget): void
  openWorksite(target: GlobalWorksiteTarget): void
  changeServerUrl(value: string): void
  saveServer(): void
  openModule(panelId: string): void
}

/**
 * Start the client-owned Loop page runtime from an existing server/page
 * session. This only reads persisted connection state; it never opens an OAuth
 * browser flow, and a missing server remains in setup without an iframe.
 */
export function startLoopGlobalPageRuntime(
  controller: LoopGlobalPageController,
): () => void {
  void controller.open()
  let stopped = false
  let timer: ReturnType<typeof setTimeout>
  const poll = async () => {
    await controller.refreshConnection()
    if (!stopped) timer = setTimeout(() => { void poll() }, 15000)
  }
  timer = setTimeout(() => { void poll() }, 15000)
  const onFocus = () => { void controller.refreshConnection() }
  if (typeof window !== 'undefined') window.addEventListener('focus', onFocus)
  return () => {
    stopped = true
    clearTimeout(timer)
    if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus)
    controller.dispose()
  }
}

function failureOf(result: Extract<RemoteResult<unknown>, { readonly ok: false }>): GlobalPageFailure {
  return {
    code: result.error.code,
    message: result.error.message,
  }
}

function transportFailure(): GlobalPageFailure {
  return { code: 'loop/transport', message: '' }
}

function capabilityFailure(): GlobalPageFailure {
  return { code: 'loop/host-update-required', message: '' }
}

function projectPath(target: GlobalProjectTarget): string | null {
  const projectId = target.projectId.trim()
  const workspaceId = target.loopWorkspaceId.trim()
  const validId = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u
  if (!validId.test(projectId) || !validId.test(workspaceId)) return null
  return `/w/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}`
}

/**
 * Validate the public shape before involving Host. Host still owns
 * normalization, probing, persistence, cutover, and authorization isolation.
 */
export function normalizedLoopServerUrl(value: string): string | null {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  const loopbackHttp = url.protocol === 'http:' &&
    (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
      url.hostname.endsWith('.localhost'))
  if ((url.protocol !== 'https:' && !loopbackHttp) ||
      url.username !== '' || url.password !== '' ||
      url.search !== '' || url.hash !== '') {
    return null
  }
  return url.href
}

export function validServerRevision(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u.test(value)
}

/**
 * Own the global server identity and its single persistent Loop page. Requests
 * carry no Harness Workspace, Session, Project, Agent, or credential.
 */
export class LoopGlobalPageController {
  readonly store: MutableSnapshotStore<GlobalPageState>
  readonly actions: GlobalPageActions
  readonly sharedData: LoopSharedDataRuntime
  private readonly remote: LoopHostClient
  private generation = 0
  private request: AbortController | null = null
  private pendingOpen: Promise<void> | null = null
  private workspaceGeneration = 0
  private workspaceRequest: AbortController | null = null
  private workspacePendingId: string | null = null
  private bridgeFrame: Window | null = null
  private bridgeOrigin = ''
  private bridgeNonce = ''
  private bridgeServerRevision = ''
  private locale: LoopLocale = 'en'
  private workspaceBridgeSuspended = false
  private readonly modulePaths = new Map<string, string>()
  private pendingProjectsNavigation = false
  private sharedDataGeneration = 0
  private sharedDataSubscriptionId = ''
  private sharedDataTimeout: ReturnType<typeof setTimeout> | null = null
  private lastPageRecovery = 0
  private readonly onRoute: ((panelId: string, path: string) => boolean) | undefined

  constructor(
    remote: LoopHostClient,
    options: { readonly onRoute?: (panelId: string, path: string) => boolean } = {},
  ) {
    this.remote = remote
    this.onRoute = options.onRoute
    this.store = createSnapshotStore(INITIAL_GLOBAL_PAGE_STATE)
    this.sharedData = new LoopSharedDataRuntime()
    this.actions = {
      open: () => { void this.open() },
      reconnect: () => { void this.reconnect() },
      openProject: target => { void this.openProject(target) },
      openWorksite: target => { void this.openWorksite(target) },
      changeServerUrl: value => { this.changeServerUrl(value) },
      saveServer: () => { void this.saveServer() },
      openModule: panelId => { void this.openModule(panelId) },
    }
  }

  /** Load on first panel activation and retain the page across panel switches. */
  async open(): Promise<void> {
    const screen = this.store.getSnapshot().screen
    if (screen === 'loading') return this.pendingOpen ?? Promise.resolve()
    if (screen === 'ready' || screen === 'setup') return
    if (this.remote.globalServerStatus === undefined) {
      this.store.set({
        ...this.store.getSnapshot(),
        screen: 'error',
        error: capabilityFailure(),
      })
      return
    }
    await this.startOpen()
  }

  /** Clear the iframe and its projections before any sign-out request. */
  suspend(): void {
    this.nextGeneration()
    this.resetWorkspaceState()
    this.store.set({...this.store.getSnapshot(), screen: 'ready', page: null,
      connection: {state: 'signing_out'}, error: null})
  }

  /** Reconcile authority without reloading a healthy iframe or its content. */
  async refreshConnection(): Promise<void> {
    const before = this.store.getSnapshot()
    if (before.serverBusy || before.screen === 'loading' || this.remote.globalServerStatus === undefined) return
    const generation = this.generation
    const result = await this.call(signal => this.remote.globalServerStatus!({}, signal), new AbortController().signal)
    if (generation !== this.generation || !result.ok) return
    const status = result.value
    if (status.serverRevision !== before.serverRevision) { await this.reconnect(); return }
    if (status.connection === undefined) return
    if (status.connection.deviceOnly || status.connection.state === 'signed_out' || status.connection.state === 'needs_auth' || status.connection.state === 'signing_out') {
      this.nextGeneration()
      this.resetWorkspaceState()
      this.store.set({...this.store.getSnapshot(), screen: 'ready', page: null, connection: status.connection, error: null})
    } else {
      this.store.set({...this.store.getSnapshot(), connection: status.connection, loopWorkspaceId: status.connection.workspaceId ?? before.loopWorkspaceId})
      if (status.connection.state === 'signed_in' && before.page === null) await this.loadPage(status.serverUrl, status.serverRevision)
    }
  }

  /** Retry the failed server read/page request. */
  async reconnect(): Promise<void> {
    if (this.remote.globalServerStatus !== undefined) {
      await this.startOpen()
    } else {
      this.store.set({
        ...this.store.getSnapshot(),
        screen: 'error',
        error: capabilityFailure(),
      })
    }
  }

  /**
   * Route the shared page to one confirmed binding only when it belongs to the
   * configured server. The project ID is authorization input, not a page URL.
   */
  async openProject(target: GlobalProjectTarget): Promise<boolean> {
    const path = projectPath(target)
    if (path === null) return false
    await this.open()
    const state = this.store.getSnapshot()
    const configuredServer = normalizedLoopServerUrl(state.serverUrl ?? '')
    const targetServer = normalizedLoopServerUrl(target.serviceBaseUrl)
    if (state.screen !== 'ready' ||
        configuredServer === null ||
        targetServer === null ||
        configuredServer.replace(/\/+$/u, '') !== targetServer.replace(/\/+$/u, '')) {
      return false
    }
    this.store.set({
      ...state,
      activePath: path,
    })
    this.pendingProjectsNavigation = false
    this.navigatePath(path)
    return true
  }

  /** Open the exact workspace Start Work route in the persistent Loop page. */
  async openWorksite(target: GlobalWorksiteTarget): Promise<boolean> {
    const workspaceId = target.loopWorkspaceId.trim()
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u.test(workspaceId)) return false
    const path = `/w/${encodeURIComponent(workspaceId)}/start-work`
    await this.open()
    const state = this.store.getSnapshot()
    const configuredServer = normalizedLoopServerUrl(state.serverUrl ?? '')
    const targetServer = normalizedLoopServerUrl(target.serviceBaseUrl)
    if (state.screen !== 'ready' ||
        configuredServer === null ||
        targetServer === null ||
        configuredServer.replace(/\/+$/u, '') !== targetServer.replace(/\/+$/u, '')) {
      return false
    }
    this.store.set({
      ...state,
      activePath: path,
    })
    this.pendingProjectsNavigation = false
    this.navigatePath(path)
    return true
  }

  /** Select one native module and synchronize the persistent Loop iframe. */
  async openModule(panelId: string, destination: 'resume' | 'home' = 'resume'): Promise<void> {
    const module = loopModuleForPanel(panelId)
    if (module === null) return
    if (this.store.getSnapshot().screen !== 'ready') await this.open()
    const rememberedPath = this.modulePaths.get(panelId)
    let targetPath = module.path
    if (rememberedPath !== undefined && loopPanelForPath(rememberedPath) === panelId) {
      // Deep links can name a workspace before the Host remembers its selection.
      const workspacePrefix = rememberedPath.match(/^\/w\/[^/?#]+(?=\/)/u)?.[0] ?? ''
      targetPath = destination === 'home' ? workspacePrefix + module.path : rememberedPath
    }
    this.pendingProjectsNavigation = false
    if (targetPath === '/projects') {
      const workspaceId = this.store.getSnapshot().loopWorkspaceId
      this.pendingProjectsNavigation = workspaceId === null
      if (workspaceId === null) return
      targetPath = `/w/${encodeURIComponent(workspaceId)}/projects`
    }
    if (this.store.getSnapshot().activePath !== targetPath) {
      this.navigatePath(targetPath)
    }
  }

  /** Claim a public resource link only when the current connection can display it. */
  openResourceLink(href: string): string | null {
    const state = this.store.getSnapshot()
    if (state.screen !== 'ready' || state.page === null || state.serverBusy ||
        this.workspaceBridgeSuspended || !validServerRevision(state.serverRevision) ||
        (state.connection !== undefined && state.connection.state !== 'signed_in')) return null
    const target = loopResourceLink(href, state.serverUrl)
    if (target === null) return null
    this.pendingProjectsNavigation = false
    this.navigatePath(target.path)
    return target.panelId
  }

  /** Open one exact Loop task route without losing the persistent iframe. */
  openTask(workspaceId: string, taskId: string): boolean {
    const validId = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u
    if (!validId.test(workspaceId) || !validId.test(taskId) ||
        this.store.getSnapshot().screen !== 'ready') {
      return false
    }
    this.navigatePath(
      `/w/${encodeURIComponent(workspaceId)}/tasks/by-id/${encodeURIComponent(taskId)}`,
    )
    return true
  }

  changeServerUrl(value: string): void {
    this.store.set({
      ...this.store.getSnapshot(),
      serverDraft: value,
      serverError: null,
    })
  }

  /**
   * Bind one native Loop page instance to the current service origin with a
   * fresh nonce. Only messages from that frame and origin are accepted.
   */
  attachWorkspacePage(frame: Window, pageUrl: string): void {
    this.detachWorkspacePage()
    this.sharedData.selectIdentity(null)
    let origin: string
    try {
      origin = new URL(pageUrl).origin
    } catch {
      return
    }
    const nonce = newGlobalWorkspaceBridgeNonce()
    this.bridgeFrame = frame
    this.bridgeOrigin = origin
    this.bridgeNonce = nonce
    this.bridgeServerRevision = this.store.getSnapshot().serverRevision
    window.addEventListener('message', this.onWorkspaceMessage)
    if (!this.workspaceBridgeSuspended) {
      this.postBridgeInit()
    }
  }

  /** Update the embedded Loop page without changing its route or browser preference. */
  setLocale(locale: LoopLocale): void {
    if (this.locale === locale) return
    this.locale = locale
    if (this.bridgeFrame === null || this.bridgeOrigin === '' ||
        !validServerRevision(this.bridgeServerRevision)) {
      return
    }
    this.bridgeFrame.postMessage(
      globalWorkspaceBridgeLocale(
        this.bridgeNonce,
        this.bridgeServerRevision,
        locale,
      ),
      this.bridgeOrigin,
    )
  }

  /** Route the persistent iframe without reloading or losing in-app state. */
  private navigatePath(rawPath: string): void {
    const path = sanitizedLoopPagePath(rawPath)
    if (path === null) return
    this.rememberModulePath(path)
    this.store.set({
      ...this.store.getSnapshot(),
      activePath: path,
    })
    if (this.bridgeFrame === null || this.bridgeOrigin === '' ||
        !validServerRevision(this.bridgeServerRevision)) {
      return
    }
    this.bridgeFrame.postMessage(
      globalWorkspaceBridgeNavigate(
        this.bridgeNonce,
        this.bridgeServerRevision,
        path,
      ),
      this.bridgeOrigin,
    )
  }

  private postBridgeInit(): void {
    if (this.bridgeFrame === null || this.bridgeOrigin === '') return
    const state = this.store.getSnapshot()
    if (!validServerRevision(this.bridgeServerRevision)) {
      this.store.set({
        ...state,
        workspaceError: capabilityFailure(),
      })
      return
    }
    this.bridgeFrame.postMessage(
      globalWorkspaceBridgeInit(
        this.bridgeNonce,
        this.bridgeServerRevision,
        state.activePath,
        this.locale,
      ),
      this.bridgeOrigin,
    )
  }

  /** Persist through Host and replace the iframe only after a safe commit. */
  async saveServer(): Promise<void> {
    const state = this.store.getSnapshot()
    if (state.serverBusy) return
    if ((state.serverUrl !== null && !validServerRevision(state.serverRevision)) ||
        this.remote.globalServerStatus === undefined) {
      this.store.set({ ...state, serverError: capabilityFailure() })
      return
    }
    if (this.remote.configureGlobalServer === undefined) {
      this.store.set({ ...state, serverError: capabilityFailure() })
      return
    }
    const serverUrl = normalizedLoopServerUrl(state.serverDraft)
    if (serverUrl === null) {
      this.store.set({
        ...state,
        serverError: { code: 'loop/server-url-invalid', message: '' },
      })
      return
    }

    this.suspendWorkspaceBridge()
    const generation = this.nextGeneration()
    const request = this.beginRequest()
    this.store.set({
      ...state,
      serverBusy: true,
      serverError: null,
    })
    const result = await this.call(signal => this.remote.configureGlobalServer!({
      serverUrl,
    }, signal), request.signal)
    if (!this.current(generation, request)) return
    if (!result.ok) {
      this.store.set({
        ...this.store.getSnapshot(),
        serverBusy: false,
        serverError: failureOf(result),
      })
      this.resumeWorkspaceBridge()
      return
    }

    const configured: ConfigureGlobalServerResult = result.value
    if (!validServerRevision(configured.serverRevision)) {
      this.store.set({
        ...this.store.getSnapshot(),
        serverBusy: false,
        serverError: capabilityFailure(),
      })
      this.resumeWorkspaceBridge()
      return
    }
    this.resetWorkspaceState()
    this.modulePaths.clear()
    this.store.set({
      screen: 'ready',
      page: state.connection === undefined ? configured.page : null,
      ...(state.connection === undefined ? {} : {connection: {state: 'signed_out' as const}}),
      frameKey: generation,
      error: null,
      serverUrl: configured.serverUrl,
      serverRevision: configured.serverRevision,
      serverDraft: configured.serverUrl,
      serverBusy: false,
      serverError: null,
      loopWorkspaceId: null,
      workspaceError: null,
      activePath: state.activePath,
    })
    if (state.connection === undefined) void this.refreshWorkspaceStatus()
    else await this.reconnect()
  }

  /** Abort in-flight resolution and return the panel to its initial state. */
  dispose(): void {
    this.generation += 1
    this.request?.abort()
    this.request = null
    this.pendingOpen = null
    this.detachWorkspacePage()
    this.workspaceGeneration += 1
    this.workspaceRequest?.abort()
    this.workspaceRequest = null
    this.workspacePendingId = null
    this.workspaceBridgeSuspended = false
    this.modulePaths.clear()
    this.pendingProjectsNavigation = false
    this.store.set(INITIAL_GLOBAL_PAGE_STATE)
    this.sharedData.reset()
  }

  private async startOpen(): Promise<void> {
    const task = this.discoverServer()
    this.pendingOpen = task
    try {
      await task
    } finally {
      if (this.pendingOpen === task) this.pendingOpen = null
    }
  }

  private async discoverServer(): Promise<void> {
    const activePath = this.store.getSnapshot().activePath
    const generation = this.nextGeneration()
    const request = this.beginRequest()
    this.store.set({
      ...INITIAL_GLOBAL_PAGE_STATE,
      screen: 'loading',
      activePath,
    })
    const result = await this.call(signal => this.remote.globalServerStatus!(
      {},
      signal,
    ), request.signal)
    if (!this.current(generation, request)) return
    if (!result.ok) {
      this.store.set({
        ...this.store.getSnapshot(),
        screen: 'error',
        error: failureOf(result),
      })
      return
    }
    const status: GlobalServerStatus = result.value
    if (status.serverUrl !== null && !validServerRevision(status.serverRevision)) {
      this.store.set({
        ...this.store.getSnapshot(),
        screen: 'error',
        serverUrl: status.serverUrl,
        serverRevision: '',
        serverDraft: status.serverUrl,
        error: capabilityFailure(),
      })
      return
    }
    if (status.serverUrl === null) {
      this.store.set({
        ...this.store.getSnapshot(),
        screen: 'setup',
        serverUrl: null,
        serverRevision: '',
        serverDraft: '',
      })
      return
    }
    this.store.set({...this.store.getSnapshot(), serverUrl: status.serverUrl,
      serverRevision: status.serverRevision, serverDraft: status.serverUrl,
      loopWorkspaceId: status.connection?.workspaceId ?? null,
      ...(status.connection === undefined ? {} : {connection: status.connection})})
    if (status.connection !== undefined && (status.connection.deviceOnly || status.connection.state !== 'signed_in')) {
      this.resetWorkspaceState()
      this.store.set({...this.store.getSnapshot(), screen: 'ready', page: null})
      return
    }
    await this.loadPage(status.serverUrl, status.serverRevision)
  }

  private async loadPage(serverUrl: string | null, serverRevision: string): Promise<void> {
    const connection = this.store.getSnapshot().connection
    const activePath = this.store.getSnapshot().activePath
    const generation = this.nextGeneration()
    const request = this.beginRequest()
    this.store.set({
      ...INITIAL_GLOBAL_PAGE_STATE,
      screen: 'loading',
      ...(connection === undefined ? {} : {connection}),
      loopWorkspaceId: connection?.workspaceId ?? null,
      serverUrl,
      serverRevision,
      serverDraft: serverUrl ?? '',
      activePath,
    })

    if (this.remote.globalPage === undefined) {
      this.store.set({
        ...this.store.getSnapshot(),
        screen: 'error',
        error: capabilityFailure(),
      })
      return
    }

    const result = await this.call(signal => this.remote.globalPage!(
      {},
      signal,
    ), request.signal)
    if (!this.current(generation, request)) return
    if (!result.ok) {
      this.store.set({
        ...this.store.getSnapshot(),
        screen: 'error',
        error: failureOf(result),
      })
      return
    }
    this.store.set({
      ...this.store.getSnapshot(),
      screen: 'ready',
      page: result.value,
      frameKey: generation,
      error: null,
    })
    await this.refreshWorkspaceStatus()
  }

  private onWorkspaceMessage = (event: MessageEvent): void => {
    if (this.workspaceBridgeSuspended) return
    if (isGlobalWorkspaceBridgeReady(event, {
      origin: this.bridgeOrigin,
      source: this.bridgeFrame,
    })) {
      this.postBridgeInit()
      return
    }
    if (readGlobalWorkspaceBridgeWorkspaceCleared(event, {
      origin: this.bridgeOrigin,
      source: this.bridgeFrame,
      nonce: this.bridgeNonce,
      revision: this.bridgeServerRevision,
    })) {
      this.cancelSharedDataSubscription('workspace-cleared')
      this.sharedData.selectIdentity(null)
      this.sharedData.disconnect('transport')
      // The page cookie is a renewable projection of the Host login. Recover
      // it once per interval, without opening another authentication flow.
      if (this.store.getSnapshot().connection?.state === 'signed_in' && Date.now() - this.lastPageRecovery > 15000) {
        this.lastPageRecovery = Date.now()
        void this.reconnect()
        return
      }
      void this.refreshConnection()
      this.nextWorkspaceGeneration()
      this.workspacePendingId = null
      this.store.set({
        ...this.store.getSnapshot(),
        loopWorkspaceId: null,
      })
      return
    }
    const path = readGlobalWorkspaceBridgeRoute(event, {
      origin: this.bridgeOrigin,
      source: this.bridgeFrame,
      nonce: this.bridgeNonce,
      revision: this.bridgeServerRevision,
    })
    if (path !== null) {
      this.rememberModulePath(path)
      this.store.set({
        ...this.store.getSnapshot(),
        activePath: path,
      })
      const panelId = loopPanelForPath(path)
      if (panelId !== null) this.onRoute?.(panelId, path)
    }
    const selection = readGlobalWorkspaceBridgeSelection(event, {
      origin: this.bridgeOrigin,
      source: this.bridgeFrame,
      nonce: this.bridgeNonce,
      revision: this.bridgeServerRevision,
    })
    if (selection !== null) {
      const connection = this.store.getSnapshot().connection
      if (connection !== undefined && (connection.state !== 'signed_in' ||
          selection.principalId !== connection.accountPrincipal || selection.workspaceId !== connection.workspaceId)) return
      this.selectSharedData(selection)
      void this.configureWorkspace(selection)
    }
    const sharedMessage = this.readSharedDataMessage(event)
    if (sharedMessage !== null) {
      const accepted = this.sharedData.accept(sharedMessage)
      if (accepted !== 'ignored') this.clearSharedDataTimeout()
      if (accepted === 'resync') this.subscribeSharedData()
    }
  }

  private selectSharedData(selection: GlobalWorkspaceSelection): void {
    const identity: SharedDataIdentity | null =
      selection.principalId === undefined || selection.authEpoch === undefined
        ? null
        : {
            workspaceId: selection.workspaceId,
            principalId: selection.principalId,
            authEpoch: selection.authEpoch,
          }
    if (identity === null) {
      this.cancelSharedDataSubscription('identity-unavailable')
      this.sharedData.selectIdentity(null)
      return
    }
    if (!this.sharedData.selectIdentity(identity) &&
        this.sharedDataSubscriptionId !== '') {
      return
    }
    this.subscribeSharedData()
  }

  private readSharedDataMessage(event: MessageEvent) {
    const identity = this.sharedData.query().identity
    if (
      identity === null ||
      this.sharedDataSubscriptionId === '' ||
      event.origin !== this.bridgeOrigin ||
      event.source !== this.bridgeFrame
    ) {
      return null
    }
    return readSharedDataMessage(event, {
      nonce: this.bridgeNonce,
      revision: this.bridgeServerRevision,
      subscriptionId: this.sharedDataSubscriptionId,
      identity,
    })
  }

  private subscribeSharedData(): void {
    const identity = this.sharedData.query().identity
    if (
      identity === null ||
      this.bridgeFrame === null ||
      this.bridgeOrigin === '' ||
      !validServerRevision(this.bridgeServerRevision)
    ) {
      return
    }
    const previousSubscriptionId = this.sharedDataSubscriptionId
    this.clearSharedDataTimeout()
    this.sharedDataGeneration += 1
    const subscriptionId = `shared_${this.sharedDataGeneration}`
    this.sharedDataSubscriptionId = subscriptionId
    this.sharedData.beginSubscription(identity, subscriptionId)
    if (previousSubscriptionId !== '') {
      this.bridgeFrame.postMessage({
        channel: 'loop.global-page.v2',
        type: 'data-unsubscribe',
        nonce: this.bridgeNonce,
        revision: this.bridgeServerRevision,
        subscriptionId: previousSubscriptionId,
      }, this.bridgeOrigin)
    }
    this.bridgeFrame.postMessage({
      channel: 'loop.global-page.v2',
      type: 'data-subscribe',
      nonce: this.bridgeNonce,
      revision: this.bridgeServerRevision,
      subscriptionId,
      workspaceId: identity.workspaceId,
      principalId: identity.principalId,
      authEpoch: identity.authEpoch,
    }, this.bridgeOrigin)
    this.sharedDataTimeout = setTimeout(() => {
      this.sharedDataTimeout = null
      this.cancelSharedDataSubscription('timeout')
    }, 5_000)
  }

  private cancelSharedDataSubscription(reason: string): void {
    this.clearSharedDataTimeout()
    const subscriptionId = this.sharedDataSubscriptionId
    this.sharedDataSubscriptionId = ''
    if (
      subscriptionId !== '' &&
      this.bridgeFrame !== null &&
      this.bridgeOrigin !== ''
    ) {
      this.bridgeFrame.postMessage({
        channel: 'loop.global-page.v2',
        type: 'data-unsubscribe',
        nonce: this.bridgeNonce,
        revision: this.bridgeServerRevision,
        subscriptionId,
      }, this.bridgeOrigin)
    }
    this.sharedData.disconnect(reason)
  }

  private clearSharedDataTimeout(): void {
    if (this.sharedDataTimeout === null) return
    clearTimeout(this.sharedDataTimeout)
    this.sharedDataTimeout = null
  }

  private async configureWorkspace(selection: GlobalWorkspaceSelection): Promise<void> {
    const state = this.store.getSnapshot()
    if (state.screen !== 'ready' || state.loopWorkspaceId === selection.workspaceId) return
    if (this.remote.configureGlobalServerWorkspace === undefined) {
      this.store.set({ ...state, workspaceError: capabilityFailure() })
      return
    }
    const expectedServerRevision = this.bridgeServerRevision
    if (!validServerRevision(expectedServerRevision)) {
      this.store.set({ ...state, workspaceError: capabilityFailure() })
      return
    }
    if (this.workspacePendingId === selection.workspaceId) return
    const generation = this.nextWorkspaceGeneration()
    const request = this.beginWorkspaceRequest()
    this.workspacePendingId = selection.workspaceId
    this.store.set({ ...this.store.getSnapshot(), workspaceError: null })
    const result = await this.call(signal => this.remote.configureGlobalServerWorkspace!({
      workspaceId: selection.workspaceId,
      expectedServerRevision,
    }, signal), request.signal)
    if (!this.currentWorkspace(generation, request)) return
    this.workspacePendingId = null
    if (!result.ok) {
      this.store.set({
        ...this.store.getSnapshot(),
        workspaceError: failureOf(result),
      })
      return
    }
    this.modulePaths.clear()
    this.store.set({
      ...this.store.getSnapshot(),
      loopWorkspaceId: result.value.loopWorkspaceId,
      workspaceError: null,
    })
    if (this.pendingProjectsNavigation && result.value.loopWorkspaceId !== null) {
      this.pendingProjectsNavigation = false
      this.navigatePath(`/w/${encodeURIComponent(result.value.loopWorkspaceId)}/projects`)
    }
  }

  private async refreshWorkspaceStatus(): Promise<void> {
    if (this.remote.globalServerWorkspaceStatus === undefined) return
    if (!validServerRevision(this.store.getSnapshot().serverRevision)) return
    const generation = this.nextWorkspaceGeneration()
    const request = this.beginWorkspaceRequest()
    const result = await this.call(signal => this.remote.globalServerWorkspaceStatus!(
      {},
      signal,
    ), request.signal)
    if (!this.currentWorkspace(generation, request)) return
    if (!result.ok) {
      this.store.set({
        ...this.store.getSnapshot(),
        workspaceError: failureOf(result),
      })
      return
    }
    this.store.set({
      ...this.store.getSnapshot(),
      loopWorkspaceId: result.value.loopWorkspaceId,
      workspaceError: null,
    })
  }

  private detachWorkspacePage(): void {
    this.cancelSharedDataSubscription('page-detached')
    if (this.bridgeFrame === null) return
    window.removeEventListener('message', this.onWorkspaceMessage)
    this.bridgeFrame = null
    this.bridgeOrigin = ''
    this.bridgeNonce = ''
    this.bridgeServerRevision = ''
  }

  private rememberModulePath(path: string): void {
    const panelId = loopPanelForPath(path)
    if (panelId !== null) this.modulePaths.set(panelId, path)
  }

  private resetWorkspaceState(): void {
    this.workspaceGeneration += 1
    this.workspaceRequest?.abort()
    this.workspaceRequest = null
    this.workspacePendingId = null
    this.workspaceBridgeSuspended = false
    this.detachWorkspacePage()
  }

  private suspendWorkspaceBridge(): void {
    this.workspaceBridgeSuspended = true
    this.workspaceGeneration += 1
    this.workspaceRequest?.abort()
    this.workspaceRequest = null
    this.workspacePendingId = null
  }

  private resumeWorkspaceBridge(): void {
    this.workspaceBridgeSuspended = false
    if (this.bridgeFrame === null || this.bridgeOrigin === '') return
    this.bridgeNonce = newGlobalWorkspaceBridgeNonce()
    this.postBridgeInit()
  }

  private nextWorkspaceGeneration(): number {
    this.workspaceGeneration += 1
    this.workspaceRequest?.abort()
    return this.workspaceGeneration
  }

  private beginWorkspaceRequest(): AbortController {
    const request = new AbortController()
    this.workspaceRequest = request
    return request
  }

  private currentWorkspace(generation: number, request: AbortController): boolean {
    return generation === this.workspaceGeneration && !request.signal.aborted
  }

  private nextGeneration(): number {
    this.generation += 1
    this.request?.abort()
    return this.generation
  }

  private beginRequest(): AbortController {
    const request = new AbortController()
    this.request = request
    return request
  }

  private current(generation: number, request: AbortController): boolean {
    return generation === this.generation && !request.signal.aborted
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
