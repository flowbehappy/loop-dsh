/** Native Settings state for Loop model authorization and the active Session selection. */

import type {
  ModelCatalog,
  ModelSelection,
  ModelSelectionProjection,
} from '@deepseek-ai/dsh-api-session-controller/types'
import type {
  HostObservable,
  StandardSourceBinding,
} from '@deepseek-ai/dsh-client-ui-slots'
import {
  LOOP_MODEL_ROUTE_PREFIX,
  loopModelPickerID,
  loopModelRouteFromDigest,
  loopModelRouteInput,
  parseLoopModelPickerID,
} from '../../model-identity.mjs'
import {createSnapshotStore, type MutableSnapshotStore} from './store.ts'
import type {
  AccountLoginStatus,
  LoopHostClient,
  LoopModelStatus,
  RemoteResult,
  SetDefaultModelRequest,
  SetDefaultModelValue,
} from './types.ts'

export interface ModelFailure {
  readonly code: string
  readonly message: string
}

export type SelectedModelSource =
  | 'loop_personal'
  | 'loop_proxy'
  | 'loop_hosted'
  | 'external'
  | 'unknown'

export type SelectedModelBilling =
  | 'personal-provider'
  | 'organization'
  | 'loop-hosted'
  | 'provider-account'
  | 'unknown'

export type SelectedModelScope = 'active-session' | 'new-session'
export type SelectedModelBasis = 'next' | 'lastUsed' | 'default'
export type ModelCatalogChange = 'refresh' | 'reset'

export interface SelectedModelView {
  readonly sessionId: string | null
  readonly scope: SelectedModelScope
  readonly basis: SelectedModelBasis
  readonly providerId: string
  readonly providerName: string
  readonly modelId: string
  readonly modelName: string
  readonly source: SelectedModelSource
  readonly billing: SelectedModelBilling
  readonly available: boolean
}

export type HarnessModelCatalog = ModelCatalog

export interface ModelReadinessScope {
  readonly serverUrl: string | null
  readonly serverRevision: string
  readonly workspaceId: string | null
  readonly sharedWorkspaceId: string | null
  readonly sharedPrincipalId: string | null
  readonly authEpoch: string | null
}

export interface ModelChoice {
  readonly kind: 'loop' | 'external'
  readonly connectionId?: string
  readonly workspaceId?: string
  readonly providerId: string
  readonly providerName: string
  readonly modelId: string
  readonly modelName: string
}

export interface ModelUiState {
  readonly screen: 'idle' | 'loading' | 'ready' | 'error'
  readonly status: LoopModelStatus | null
  readonly readiness: ModelReadiness
  readonly busy: 'read' | 'refresh' | 'select' | 'disconnect' | null
  readonly error: ModelFailure | null
  readonly disconnectConnectionId: string
  readonly selection: SelectedModelView | null
  readonly selectionLoading: boolean
  readonly selectionError: ModelFailure | null
}

export type ModelReadiness =
  | { readonly kind: 'loading' }
  | {
      readonly kind: 'loop-ready'
      readonly scopeKey: string
      readonly sessionId: string | null
      readonly selectionScope: SelectedModelScope
      readonly selectionBasis: SelectedModelBasis
      readonly connectionId: string
      readonly workspaceId: string
      readonly providerId: string
      readonly modelId: string
    }
  | {
      readonly kind: 'external-ready'
      readonly scopeKey: string
      readonly sessionId: string | null
      readonly selectionScope: SelectedModelScope
      readonly selectionBasis: SelectedModelBasis
      readonly providerId: string
      readonly modelId: string
    }
  | {
      readonly kind: 'selection-required'
      readonly scopeKey: string
      readonly sessionId: string | null
      readonly selectionScope: SelectedModelScope
      readonly selectionBasis: SelectedModelBasis
      readonly reason: 'invalid-selection' | 'workspace-mismatch'
      readonly providerId: string
      readonly modelId: string
      readonly choices: readonly ModelChoice[]
    }
  | {
      readonly kind: 'scope-required'
      readonly scopeKey: string
      readonly reason: 'workspace' | 'account'
      readonly choices: readonly ModelChoice[]
    }
  | { readonly kind: 'needs-auth'; readonly reason: string }
  | { readonly kind: 'no-models'; readonly reason: string }
  | { readonly kind: 'catalog-unavailable'; readonly error: ModelFailure | null }
  | { readonly kind: 'route-missing'; readonly reason: string }
  | { readonly kind: 'error'; readonly error: ModelFailure | null }

export const INITIAL_MODEL_STATE: ModelUiState = Object.freeze({
  screen: 'idle',
  status: null,
  readiness: { kind: 'loading' },
  busy: null,
  error: null,
  disconnectConnectionId: '',
  selection: null,
  selectionLoading: false,
  selectionError: null,
})

export interface ModelActions {
  open(): void
  select(choice: ModelChoice): void
  suspend(): void
  refresh(): void
  disconnect(connectionId: string): void
}

export interface ModelScopeSources {
  readonly globalPage: HostObservable<{
    readonly connection?: AccountLoginStatus
    readonly serverUrl: string | null
    readonly serverRevision: string
    readonly loopWorkspaceId: string | null
  }>
  readonly sharedData: HostObservable<{
    readonly identity: {
      readonly workspaceId: string
      readonly principalId: string
      readonly authEpoch: string
    } | null
  }>
}

export interface ModelControllerOptions {
  readonly remote: LoopHostClient
  readonly loadModelCatalog?: (signal?: AbortSignal) => Promise<RemoteResult<HarnessModelCatalog>>
  readonly subscribeCatalogEvents?: (
    listener: (change: ModelCatalogChange) => void,
  ) => () => void
  readonly routeForConnection?: (
    workspaceId: string,
    connectionId: string,
  ) => Promise<string>
  readonly scopeSources?: ModelScopeSources
  readonly selectModel?: (
    input: {
      readonly sessionId: string
      readonly choice: ModelChoice
    },
    signal?: AbortSignal,
  ) => Promise<RemoteResult<void>>
  /** Repair login connection changes and fill an empty native model selection. */
  readonly autoSelectAfterLogin?: boolean
  readonly catalogReadTimeoutMs?: number
}

export interface RequestedModelSelection {
  readonly sessionId: string | null
  readonly scope: SelectedModelScope
  readonly basis: SelectedModelBasis
  readonly selection: ModelSelection
  readonly projectionReady: boolean
}

interface ModelReadinessInput {
  readonly status: LoopModelStatus | null
  readonly catalog: HarnessModelCatalog | null
  readonly requested: RequestedModelSelection | null
  readonly scope: ModelReadinessScope
  readonly routeForConnection: (
    workspaceId: string,
    connectionId: string,
  ) => Promise<string>
  readonly statusFailure: ModelFailure | null
}

function failure(result: Extract<RemoteResult<unknown>, {readonly ok: false}>): ModelFailure {
  return {code: result.error.code, message: result.error.message}
}

async function loopProviderRoute(workspaceId: string, connectionId: string): Promise<string> {
  const bytes = new TextEncoder().encode(loopModelRouteInput(workspaceId, connectionId))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  const hex = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('')
  return loopModelRouteFromDigest(hex)
}

function catalogHasModel(
  catalog: HarnessModelCatalog,
  providerId: string,
  modelId: string,
): boolean {
  if (!catalog.routableProviders.includes(providerId)) return false
  return catalog.groups.some(group =>
    group.id === providerId &&
    group.models.some(model => model.id === modelId))
}

function modelChoiceKey(choice: Pick<ModelChoice, 'providerId' | 'modelId'>): string {
  return `${choice.providerId}\u0000${choice.modelId}`
}

export function modelScopeKey(scope: ModelReadinessScope): string {
  return JSON.stringify([
    scope.serverUrl,
    scope.serverRevision,
    scope.workspaceId,
    scope.sharedWorkspaceId,
    scope.sharedPrincipalId,
    scope.authEpoch,
  ])
}

type LoopAuthority =
  | 'host-fallback'
  | 'ready'
  | 'workspace-mismatch'
  | 'account-mismatch'

function loopAuthority(
  scope: ModelReadinessScope,
  status: LoopModelStatus | null,
): LoopAuthority {
  const sharedAbsent = scope.sharedWorkspaceId === null &&
    scope.sharedPrincipalId === null &&
    scope.authEpoch === null
  if (sharedAbsent) return 'host-fallback'
  if (scope.workspaceId === null ||
      scope.sharedWorkspaceId === null ||
      scope.sharedWorkspaceId !== scope.workspaceId) {
    return 'workspace-mismatch'
  }
  const principal = status?.accountPrincipal?.trim() ?? ''
  if (principal === '' ||
      scope.sharedPrincipalId === null ||
      scope.authEpoch === null ||
      scope.sharedPrincipalId !== principal) {
    return 'account-mismatch'
  }
  return 'ready'
}

function completeLoopScope(
  scope: ModelReadinessScope,
  status: LoopModelStatus | null,
): boolean {
  const principal = status?.accountPrincipal?.trim() ?? ''
  const authority = loopAuthority(scope, status)
  return authority !== 'workspace-mismatch' &&
    authority !== 'account-mismatch' &&
    principal !== '' &&
    scope.serverUrl !== null &&
    scope.serverRevision !== '' &&
    scope.workspaceId !== null
}

export function modelReadinessScopeKey(
  scope: ModelReadinessScope,
  status: LoopModelStatus | null,
): string {
  return JSON.stringify([modelScopeKey(scope), status?.accountPrincipal ?? null])
}

async function availableModelChoices(
  status: LoopModelStatus | null,
  catalog: HarnessModelCatalog,
  scope: ModelReadinessScope,
  routeForConnection: (
    workspaceId: string,
    connectionId: string,
  ) => Promise<string>,
): Promise<readonly ModelChoice[]> {
  const choices: ModelChoice[] = []
  const seen = new Set<string>()
  const push = (choice: ModelChoice): void => {
    const key = modelChoiceKey(choice)
    if (seen.has(key)) return
    seen.add(key)
    choices.push(choice)
  }

  for (const group of catalog.groups) {
    if (group.id.startsWith(LOOP_MODEL_ROUTE_PREFIX) ||
        !catalog.routableProviders.includes(group.id)) continue
    for (const model of group.models) {
      push({
        kind: 'external',
        providerId: group.id,
        providerName: group.name,
        modelId: model.id,
        modelName: model.name,
      })
    }
  }

  const authority = loopAuthority(scope, status)
  if (status?.state !== 'active' ||
      scope.workspaceId === null ||
      (status.accountPrincipal?.trim() ?? '') === '' ||
      authority === 'workspace-mismatch' ||
      authority === 'account-mismatch') return choices
  for (const connection of status.connections) {
    if (connection.status !== 'active' ||
        connection.workspaceId !== scope.workspaceId ||
        connection.models.length === 0) continue
    let providerId: string
    try {
      providerId = await routeForConnection(connection.workspaceId, connection.connectionId)
    } catch {
      continue
    }
    const group = catalog.groups.find(item =>
      item.id === providerId && catalog.routableProviders.includes(item.id))
    if (group === undefined) continue
    for (const descriptor of connection.models) {
      const modelId = loopModelPickerID(descriptor)
      const model = group.models.find(item => item.id === modelId)
      if (model === undefined) continue
      push({
        kind: 'loop',
        connectionId: connection.connectionId,
        workspaceId: connection.workspaceId,
        providerId,
        providerName: group.name,
        modelId,
        modelName: model.name,
      })
    }
  }
  return choices
}

/**
 * Project onboarding readiness from the actual next model selection, not from
 * an arbitrary catalog entry. Loop choices are bound to the current trusted
 * server/workspace/account scope; a valid external Key selection remains
 * independent of Loop workspace configuration.
 */
export async function resolveModelReadiness(
  input: ModelReadinessInput,
): Promise<ModelReadiness> {
  const {status, catalog, requested, scope, routeForConnection, statusFailure} = input
  const scopeKey = modelReadinessScopeKey(scope, status)
  if (catalog === null) return {kind: 'catalog-unavailable', error: null}
  if (requested === null || !requested.projectionReady) return {kind: 'loading'}

  const selection = requested.selection
  const exact = catalogHasModel(catalog, selection.provider, selection.model)
  const loopSelection = selection.provider.startsWith(LOOP_MODEL_ROUTE_PREFIX)

  if (!loopSelection && exact) {
    return {
      kind: 'external-ready',
      scopeKey,
      sessionId: requested.sessionId,
      selectionScope: requested.scope,
      selectionBasis: requested.basis,
      providerId: selection.provider,
      modelId: selection.model,
    }
  }

  const choices = await availableModelChoices(status, catalog, scope, routeForConnection)
  if (!loopSelection) {
    if (choices.length > 0) {
      return {
        kind: 'selection-required',
        scopeKey,
        sessionId: requested.sessionId,
        selectionScope: requested.scope,
        selectionBasis: requested.basis,
        reason: 'invalid-selection',
        providerId: selection.provider,
        modelId: selection.model,
        choices,
      }
    }
  } else if (status?.state === 'active' && !completeLoopScope(scope, status)) {
    return {
      kind: 'scope-required',
      scopeKey,
      reason: scope.workspaceId === null ? 'workspace' : 'account',
      choices,
    }
  } else if (status?.state === 'active') {
    const currentChoice = choices.find(choice =>
      choice.kind === 'loop' &&
      choice.providerId === selection.provider &&
      choice.modelId === selection.model)
    if (exact && currentChoice !== undefined) {
      return {
        kind: 'loop-ready',
        scopeKey,
        sessionId: requested.sessionId,
        selectionScope: requested.scope,
        selectionBasis: requested.basis,
        connectionId: currentChoice.connectionId!,
        workspaceId: currentChoice.workspaceId!,
        providerId: selection.provider,
        modelId: selection.model,
      }
    }
    if (choices.length > 0) {
      return {
        kind: 'selection-required',
        scopeKey,
        sessionId: requested.sessionId,
        selectionScope: requested.scope,
        selectionBasis: requested.basis,
        reason: exact ? 'workspace-mismatch' : 'invalid-selection',
        providerId: selection.provider,
        modelId: selection.model,
        choices,
      }
    }
  }

  if (choices.length > 0) {
    return {
      kind: 'selection-required',
      scopeKey,
      sessionId: requested.sessionId,
      selectionScope: requested.scope,
      selectionBasis: requested.basis,
      reason: 'invalid-selection',
      providerId: selection.provider,
      modelId: selection.model,
      choices,
    }
  }
  if (status === null) return {kind: 'error', error: statusFailure}
  if (status.state === 'needs_auth') {
    return {kind: 'needs-auth', reason: status.reason ?? ''}
  }
  if (status.state === 'error' || status.state === 'unavailable') {
    return {
      kind: 'error',
      error: {code: 'loop/model-state', message: status.reason ?? ''},
    }
  }
  const active = status.connections.filter(connection => connection.status === 'active')
  if (active.length > 0 && active.every(connection => connection.models.length === 0)) {
    return {kind: 'no-models', reason: status.reason ?? ''}
  }
  return {
    kind: 'route-missing',
    reason: status.reason ?? '',
  }
}

/**
 * Resolve one exact Session/default selection without changing it. Loop source
 * and billing are derived only from the real provider route and picker model
 * ID emitted by the Host adapter.
 */
export async function resolveSelectedModel(
  catalog: HarnessModelCatalog,
  loopStatus: LoopModelStatus | null,
  requested: RequestedModelSelection,
  routeForConnection: (
    workspaceId: string,
    connectionId: string,
  ) => Promise<string> = loopProviderRoute,
): Promise<SelectedModelView> {
  const provider = catalog.groups.find(group => group.id === requested.selection.provider)
  const model = provider?.models.find(item => item.id === requested.selection.model)
  const available = provider !== undefined &&
    model !== undefined &&
    catalog.routableProviders.includes(provider.id)
  const base = {
    sessionId: requested.sessionId,
    scope: requested.scope,
    basis: requested.basis,
    providerId: requested.selection.provider,
    providerName: provider?.name ?? requested.selection.provider,
    modelId: requested.selection.model,
    modelName: model?.name ?? requested.selection.model,
    available,
  }
  if (!requested.selection.provider.startsWith(LOOP_MODEL_ROUTE_PREFIX)) {
    return {
      ...base,
      source: 'external',
      billing: 'provider-account',
    }
  }
  const parsed = parseLoopModelPickerID(requested.selection.model)
  if (parsed === null || loopStatus === null) {
    return {...base, source: 'unknown', billing: 'unknown'}
  }
  const routes = new Map<string, string>()
  await Promise.all(loopStatus.connections.map(async connection => {
    routes.set(
      connection.connectionId,
      await routeForConnection(connection.workspaceId, connection.connectionId),
    )
  }))
  const connection = loopStatus.connections.find(item =>
    routes.get(item.connectionId) === requested.selection.provider)
  if (connection === undefined) {
    return {...base, source: 'unknown', billing: 'unknown'}
  }
  const matches = connection.models.filter(item =>
    loopModelPickerID(item) === requested.selection.model &&
    item.wireApi === parsed.wireApi &&
    item.source === parsed.source &&
    (item.providerId ?? '') === parsed.providerId &&
    item.id === parsed.modelId)
  if (matches.length !== 1) {
    return {...base, source: 'unknown', billing: 'unknown'}
  }
  const source = matches[0]!.source
  return {
    ...base,
    source,
    billing: source === 'loop_personal'
      ? 'personal-provider'
      : source === 'loop_proxy'
        ? 'organization'
        : 'loop-hosted',
  }
}

export class LoopModelController {
  readonly store: MutableSnapshotStore<ModelUiState>
  readonly actions: ModelActions
  private readonly remote: LoopHostClient
  private readonly loadModelCatalog: ModelControllerOptions['loadModelCatalog']
  private readonly subscribeCatalogEvents: ModelControllerOptions['subscribeCatalogEvents']
  private readonly routeForConnection: NonNullable<ModelControllerOptions['routeForConnection']>
  private readonly scopeSources: ModelControllerOptions['scopeSources']
  private readonly selectModelAction: ModelControllerOptions['selectModel']
  private readonly autoSelectAfterLogin: boolean
  private automaticSelectionAttempt = ''
  private automaticSelectionScheduled = false
  private readonly catalogReadTimeoutMs: number
  private generation = 0
  private readinessRevision = 0
  private request: AbortController | null = null
  private activeSession: HostObservable<StandardSourceBinding> | null = null
  private unsubscribeActive: (() => void) | undefined
  private unsubscribeProjection: (() => void) | undefined
  private unsubscribeScopePage: (() => void) | undefined
  private unsubscribeScopeIdentity: (() => void) | undefined
  private unsubscribeCatalogEvents: (() => void) | undefined
  private binding: StandardSourceBinding | null = null
  private catalog: HarnessModelCatalog | null = null
  private catalogFailure: ModelFailure | null = null
  private loopStatus: LoopModelStatus | null = null
  private statusFailure: ModelFailure | null = null
  private bindingRevision = 0
  private catalogGeneration = 0
  private catalogEventPending = false
  private catalogEventReset = false
  private catalogEventRunning = false
  private catalogEventDrainScheduled = false
  private catalogEventRequest: AbortController | null = null
  private selectionRevision = 0
  // A cancelled/failed write may already have changed the Host's live default.
  // A catalog read alone cannot prove that change reached its profile file.
  private defaultSaveUnknown = false
  private scope: ModelReadinessScope = {
    serverUrl: null,
    serverRevision: '',
    workspaceId: null,
    sharedWorkspaceId: null,
    sharedPrincipalId: null,
    authEpoch: null,
  }

  constructor(options: ModelControllerOptions) {
    this.autoSelectAfterLogin = options.autoSelectAfterLogin ?? false
    this.remote = options.remote
    this.loadModelCatalog = options.loadModelCatalog
    this.subscribeCatalogEvents = options.subscribeCatalogEvents
    this.routeForConnection = options.routeForConnection ?? loopProviderRoute
    this.scopeSources = options.scopeSources
    this.selectModelAction = options.selectModel
    this.catalogReadTimeoutMs = options.catalogReadTimeoutMs ?? 15_000
    this.scope = this.readScope()
    this.store = createSnapshotStore(INITIAL_MODEL_STATE)
    this.actions = {
      open: () => { void this.open() },
      select: choice => { void this.select(choice) },
      suspend: () => { this.suspend() },
      refresh: () => { void this.refresh() },
      disconnect: connectionId => { void this.disconnect(connectionId) },
    }
  }

  start(activeSession: HostObservable<StandardSourceBinding>): void {
    this.unsubscribeActive?.()
    this.activeSession = activeSession
    this.unsubscribeActive = activeSession.subscribe(() => { this.trackActiveSession() })
    this.unsubscribeCatalogEvents?.()
    this.unsubscribeCatalogEvents = this.subscribeCatalogEvents?.(change => {
      this.onCatalogEvent(change)
    })
    this.subscribeScope()
    this.trackActiveSession()
    if (this.autoSelectAfterLogin) void this.open(true)
  }

  async open(forceStatus = false): Promise<void> {
    if (this.store.getSnapshot().busy !== null) return
    const external = await this.probeExternalSelection()
    if (external === 'stale') return
    if (!forceStatus && this.defaultSaveUnknown && this.catalog !== null &&
        !this.catalog.default.provider.startsWith(LOOP_MODEL_ROUTE_PREFIX)) return
    if (external === 'ready') {
      // Loop settings still converge in the background, but an exact existing
      // external selection never waits for the Loop helper/modelStatus.
      void this.read('read', this.remote.modelStatus, {})
      return
    }
    await this.read('read', this.remote.modelStatus, {})
  }

  dispose(): void {
    this.generation += 1
    this.readinessRevision += 1
    this.selectionRevision += 1
    this.request?.abort()
    this.request = null
    this.unsubscribeActive?.()
    this.unsubscribeProjection?.()
    this.unsubscribeScopePage?.()
    this.unsubscribeScopeIdentity?.()
    this.unsubscribeCatalogEvents?.()
    this.unsubscribeActive = undefined
    this.unsubscribeProjection = undefined
    this.unsubscribeScopePage = undefined
    this.unsubscribeScopeIdentity = undefined
    this.unsubscribeCatalogEvents = undefined
    this.activeSession = null
    this.binding = null
    this.catalog = null
    this.catalogFailure = null
    this.loopStatus = null
    this.statusFailure = null
    this.catalogEventPending = false
    this.catalogEventReset = false
    this.catalogEventRequest?.abort()
    this.catalogEventRequest = null
    this.store.set(INITIAL_MODEL_STATE)
  }

  private readScope(): ModelReadinessScope {
    const page = this.scopeSources?.globalPage.getSnapshot()
    const shared = this.scopeSources?.sharedData.getSnapshot()
    const connection = page?.connection
    const workspaceId = connection === undefined ? page?.loopWorkspaceId ?? null : connection.workspaceId ?? null
    const identity = connection === undefined ? shared?.identity ?? null
      : connection.state === 'signed_in' && connection.workspaceId && connection.accountPrincipal
        ? {workspaceId: connection.workspaceId, principalId: connection.accountPrincipal,
            authEpoch: connection.grantId ?? page!.serverRevision}
        : null
    return {
      serverUrl: page?.serverUrl ?? null,
      serverRevision: page?.serverRevision ?? '',
      workspaceId,
      // Preserve a present identity even while its workspace persistence is
      // lagging behind page.loopWorkspaceId. The mismatch itself is authority.
      sharedWorkspaceId: identity?.workspaceId ?? null,
      sharedPrincipalId: identity?.principalId ?? null,
      authEpoch: identity?.authEpoch ?? null,
    }
  }

  private subscribeScope(): void {
    if (this.scopeSources === undefined) return
    this.unsubscribeScopePage?.()
    this.unsubscribeScopeIdentity?.()
    const update = (): void => { this.updateScope() }
    this.unsubscribeScopePage = this.scopeSources.globalPage.subscribe(update)
    this.unsubscribeScopeIdentity = this.scopeSources.sharedData.subscribe(update)
    this.updateScope()
  }

  private updateScope(): void {
    const next = this.readScope()
    if (modelScopeKey(next) === modelScopeKey(this.scope)) return
    this.scope = next
    this.generation += 1
    this.catalogGeneration += 1
    this.readinessRevision += 1
    this.selectionRevision += 1
    this.request?.abort()
    this.catalogEventRequest?.abort()
    this.request = null
    this.catalogEventRequest = null
    this.catalogEventPending = false
    this.catalogEventReset = false
    this.catalog = null
    this.catalogFailure = null
    this.loopStatus = null
    this.statusFailure = null
    this.automaticSelectionAttempt = ''
    this.store.set(INITIAL_MODEL_STATE)
    if (this.autoSelectAfterLogin) void this.open(true)
  }

  private trackActiveSession(): void {
    const binding = this.activeSession?.getSnapshot()
    if (binding?.key !== this.binding?.key) this.bindingRevision += 1
    this.binding = binding ?? null
    this.unsubscribeProjection?.()
    this.unsubscribeProjection = undefined
    const projection = binding?.keyedHooks.projection?.('modelSelection')
    if (projection !== undefined) {
      this.unsubscribeProjection = projection.subscribe(() => {
        this.refreshSelection()
        this.refreshCachedReadiness()
      })
    }
    this.refreshSelection()
    this.refreshCachedReadiness()
  }

  private refreshSelection(): void {
    const revision = ++this.selectionRevision
    const catalog = this.catalog
    if (catalog === null) {
      this.patch({
        selection: null,
        selectionLoading: this.catalogFailure === null,
        selectionError: this.catalogFailure,
      })
      return
    }
    const requested = this.requestedSelection(catalog)
    this.patch({selection: null, selectionLoading: true, selectionError: null})
    void resolveSelectedModel(catalog, this.loopStatus, requested, this.routeForConnection).then(
      selection => {
        if (revision !== this.selectionRevision) return
        this.patch({selection, selectionLoading: false, selectionError: null})
      },
      () => {
        if (revision !== this.selectionRevision) return
        this.patch({
          selection: null,
          selectionLoading: false,
          selectionError: {code: 'loop/model-selection', message: ''},
        })
      },
    )
  }

  private requestedSelection(catalog: HarnessModelCatalog): RequestedModelSelection {
    const sessionId = this.binding?.key
    const projectionSource = this.binding?.keyedHooks.projection?.('modelSelection')
    const projection = projectionSource?.getSnapshot() as ModelSelectionProjection | undefined
    if (sessionId !== undefined) {
      if (projection === undefined) {
        return {
          sessionId,
          scope: 'active-session',
          basis: 'default',
          selection: catalog.default,
          projectionReady: false,
        }
      }
      if (projection.next !== null) {
        return {
          sessionId,
          scope: 'active-session',
          basis: 'next',
          selection: projection.next,
          projectionReady: true,
        }
      }
      if (projection.lastUsed !== null) {
        return {
          sessionId,
          scope: 'active-session',
          basis: 'lastUsed',
          selection: projection.lastUsed,
          projectionReady: true,
        }
      }
      return {
        sessionId,
        scope: 'active-session',
        basis: 'default',
        selection: catalog.default,
        projectionReady: true,
      }
    }
    return {
      sessionId: null,
      scope: 'new-session',
      basis: 'default',
      selection: catalog.default,
      projectionReady: true,
    }
  }

  private suspend(): void {
    this.nextGeneration()
    this.catalogGeneration += 1
    this.readinessRevision += 1
    this.selectionRevision += 1
    this.catalogEventRequest?.abort()
    this.catalogEventRequest = null
    this.catalogEventPending = false
    this.catalogEventReset = false
    this.catalog = null
    this.catalogFailure = null
    this.loopStatus = null
    this.statusFailure = null
    this.store.set(INITIAL_MODEL_STATE)
  }

  /** Use the native selection owner; never maintain a separate selected model. */
  ensureSelection(): void {
    const state = this.store.getSnapshot()
    const readiness = state.readiness
    if (state.busy !== null || state.error !== null || this.defaultSaveUnknown || this.catalog === null ||
        this.loopStatus?.state !== 'active' || !completeLoopScope(this.scope, this.loopStatus)) return
    if (readiness.kind === 'loop-ready' || readiness.kind === 'external-ready') {
      this.automaticSelectionAttempt = ''
      return
    }
    if (readiness.kind !== 'selection-required') return
    const requested = this.requestedSelection(this.catalog)
    // A native picker click or Session switch can precede its async readiness
    // projection. Never overwrite that newer selection with an old fallback.
    if (!requested.projectionReady || requested.sessionId !== readiness.sessionId ||
        requested.selection.provider !== readiness.providerId || requested.selection.model !== readiness.modelId) return
    // The helper can finish login before its provider appears in DSH's catalog.
    // Do not mistake that startup gap (or a failed catalog read) for no Loop models.
    if (this.catalog.failures.some(provider => provider.id === readiness.providerId)) return
    const hasLoopModels = this.loopStatus.connections.some(connection => connection.status === 'active' &&
      connection.workspaceId === this.scope.workspaceId && connection.models.length > 0)
    if (hasLoopModels && !readiness.choices.some(choice => choice.kind === 'loop')) return
    const previousLoopModel = readiness.providerId.startsWith(LOOP_MODEL_ROUTE_PREFIX)
      ? readiness.choices.filter(choice => choice.kind === 'loop' && choice.modelId === readiness.modelId)
      : []
    // Login may rotate the connection route. Match the complete model identity
    // (source + provider + model), not its display name, before choosing a fallback.
    const choice = (previousLoopModel.length === 1 ? previousLoopModel[0] : undefined) ??
      readiness.choices.find(choice => choice.kind === 'loop') ?? readiness.choices[0]
    if (choice === undefined) return
    const attempt = JSON.stringify([readiness.scopeKey, requested.sessionId,
      readiness.providerId, readiness.modelId, modelChoiceKey(choice)])
    if (this.automaticSelectionAttempt === attempt) return
    this.automaticSelectionAttempt = attempt
    void this.select(choice)
  }

  private async select(choice: ModelChoice): Promise<void> {
    const state = this.store.getSnapshot()
    if (state.busy !== null) return
    const readiness = state.readiness
    if ((readiness.kind !== 'selection-required' && readiness.kind !== 'scope-required') ||
        !readiness.choices.some(item => modelChoiceKey(item) === modelChoiceKey(choice))) {
      this.patch({error: {code: 'loop/model-selection-stale', message: ''}})
      return
    }
    const generation = this.nextGeneration()
    const bindingRevision = this.bindingRevision
    const catalogGeneration = this.catalogGeneration
    const request = this.beginRequest()
    this.patch({busy: 'select', error: null})
    const sessionId = this.binding?.key
    let result: RemoteResult<unknown>
    let defaultResult: RemoteResult<SetDefaultModelValue> | null = null
    let defaultSavePrevious: boolean | null = null
    if (sessionId !== undefined) {
      if (this.selectModelAction === undefined) {
        this.patch({busy: null, error: {code: 'loop/host-update-required', message: ''}})
        return
      }
      result = await this.call(
        signal => this.selectModelAction!({sessionId, choice}, signal),
        request.signal,
      )
    } else {
      if (this.remote.setDefaultModel === undefined) {
        this.patch({busy: null, error: {code: 'loop/host-update-required', message: ''}})
        return
      }
      const expectedAccountPrincipal = state.status?.accountPrincipal?.trim() ?? ''
      const next: SetDefaultModelRequest = choice.kind === 'loop'
        ? {
            kind: 'loop',
            provider: choice.providerId,
            model: choice.modelId,
            connectionId: choice.connectionId ?? '',
            workspaceId: choice.workspaceId ?? '',
            expectedServerRevision: this.scope.serverRevision,
            expectedAccountPrincipal,
          }
        : {
            kind: 'external',
            provider: choice.providerId,
            model: choice.modelId,
          }
      if (next.kind === 'loop' &&
          (next.connectionId === '' ||
            next.workspaceId === '' ||
            next.expectedServerRevision === '' ||
            next.expectedAccountPrincipal === '')) {
        this.patch({busy: null, error: {code: 'loop/model-selection-stale', message: ''}})
        return
      }
      const previouslyUnknown = this.defaultSaveUnknown
      defaultSavePrevious = previouslyUnknown
      this.defaultSaveUnknown = true
      defaultResult = await this.call(
        signal => this.remote.setDefaultModel!(next, signal),
        request.signal,
      )
      result = defaultResult
    }
    if (!this.current(generation, request)) return
    if (catalogGeneration !== this.catalogGeneration) {
      this.patch({busy: null})
      return
    }
    if (defaultResult !== null) {
      if (defaultResult.ok) this.defaultSaveUnknown = false
      else if ([
        'loop-host/model-default-scope', 'loop-host/model-default-unavailable',
        'loop-host/model-default-readonly', 'loop-host/model-default-save',
        'loop-host/model-default-not-persisted', 'loop-host/invalid-request',
      ].includes(defaultResult.error.code)) {
        this.defaultSaveUnknown = defaultSavePrevious ?? false
      }
    }
    if (bindingRevision !== this.bindingRevision) {
      this.patch({busy: null})
      return
    }
    if (defaultResult?.ok &&
        (defaultResult.value.selection.provider !== choice.providerId ||
          defaultResult.value.selection.model !== choice.modelId)) {
      this.defaultSaveUnknown = true
      this.patch({busy: null, error: {code: 'loop-host/model-default-unknown', message: ''}})
      return
    }
    if (!result.ok) {
      this.patch({busy: null, error: defaultResult !== null && this.defaultSaveUnknown
        ? {code: 'loop-host/model-default-unknown', message: ''}
        : failure(result)})
      return
    }
    if (choice.kind === 'external') {
      await this.probeExternalSelection()
    } else {
      await this.read('read', this.remote.modelStatus, {})
    }
  }

  private async refresh(): Promise<void> {
    if (this.store.getSnapshot().busy !== null) return
    const refresh = this.remote.refreshModelConnections ?? this.remote.modelStatus
    if (refresh === undefined) {
      this.patch({error: {code: 'loop/host-update-required', message: ''}})
      return
    }
    await this.read(
      this.remote.refreshModelConnections === undefined ? 'read' : 'refresh',
      refresh,
      {},
    )
  }

  private async disconnect(connectionId: string): Promise<void> {
    if (this.store.getSnapshot().busy !== null) return
    if (this.remote.disconnectModelConnection === undefined) {
      this.patch({error: {code: 'loop/host-update-required', message: ''}})
      return
    }
    this.patch({disconnectConnectionId: connectionId})
    await this.read(
      'disconnect',
      (_input, signal) => this.remote.disconnectModelConnection!({connectionId}, signal),
      {},
    )
    this.patch({disconnectConnectionId: ''})
  }

  private onCatalogEvent(change: ModelCatalogChange): void {
    this.catalogEventPending = true
    if (change === 'reset') {
      this.catalogEventReset = true
      this.catalogGeneration += 1
      this.catalogEventRequest?.abort()
      this.catalogEventRequest = null
      this.catalog = null
      this.catalogFailure = null
      this.loopStatus = null
      this.statusFailure = null
      this.readinessRevision += 1
      this.selectionRevision += 1
      this.patch({
        selection: null,
        selectionLoading: true,
        selectionError: null,
        readiness: {kind: 'loading'},
      })
    }
    this.scheduleCatalogDrain()
  }

  private scheduleCatalogDrain(): void {
    if (this.catalogEventDrainScheduled) return
    this.catalogEventDrainScheduled = true
    queueMicrotask(() => {
      this.catalogEventDrainScheduled = false
      this.drainCatalogEvents()
    })
  }

  private drainCatalogEvents(): void {
    if (this.catalogEventRunning ||
        !this.catalogEventPending ||
        this.store.getSnapshot().busy !== null) return
    this.catalogEventPending = false
    const reset = this.catalogEventReset
    this.catalogEventReset = false
    if (reset || this.autoSelectAfterLogin) {
      void this.open(true)
      return
    }
    const generation = this.catalogGeneration
    const request = new AbortController()
    const scopeKey = modelScopeKey(this.scope)
    this.catalogEventRequest = request
    this.catalogEventRunning = true
    void this.readCatalog(request.signal).then(result => {
      if (generation !== this.catalogGeneration ||
          request.signal.aborted ||
          scopeKey !== modelScopeKey(this.scope) ||
          scopeKey !== modelScopeKey(this.readScope())) return
      this.applyCatalog(result)
      void this.resolveReadiness(
        result,
        this.loopStatus,
        this.statusFailure,
        scopeKey,
      )
    }).finally(() => {
      if (this.catalogEventRequest === request) this.catalogEventRequest = null
      this.catalogEventRunning = false
      this.scheduleCatalogDrain()
    })
  }

  private async read(
    busy: Exclude<ModelUiState['busy'], null>,
    invoke: ((input: Record<never, never>, signal?: AbortSignal) => Promise<RemoteResult<LoopModelStatus>>) | undefined,
    input: Record<never, never>,
  ): Promise<void> {
    if (invoke === undefined) {
      this.patch({screen: 'error', error: {code: 'loop/host-update-required', message: ''}})
      return
    }
    const generation = this.nextGeneration()
    const request = this.beginRequest()
    const scopeKey = modelScopeKey(this.scope)
    const catalogGeneration = this.catalogGeneration
    this.patch({screen: this.store.getSnapshot().status === null ? 'loading' : 'ready', busy, error: null})
    const result = await this.call(signal => invoke(input, signal), request.signal)
    if (!this.current(generation, request) || scopeKey !== modelScopeKey(this.readScope())) return
    if (catalogGeneration !== this.catalogGeneration) {
      this.finishStaleStatusRead(result)
      return
    }
    const catalogResult = await this.readCatalog(request.signal)
    if (!this.current(generation, request) || scopeKey !== modelScopeKey(this.readScope())) return
    if (catalogGeneration !== this.catalogGeneration) {
      this.finishStaleStatusRead(result)
      return
    }
    this.applyCatalog(catalogResult)
    if (!result.ok) {
      this.loopStatus = null
      this.statusFailure = failure(result)
      this.patch({
        screen: this.store.getSnapshot().status === null ? 'error' : 'ready',
        busy: null,
        error: failure(result),
        selection: null,
        selectionLoading: false,
      })
      void this.resolveReadiness(catalogResult, null, this.statusFailure, scopeKey)
      return
    }
    this.statusFailure = null
    this.applyStatus(result.value)
    void this.resolveReadiness(catalogResult, result.value, null, scopeKey)
  }

  private finishStaleStatusRead(result: RemoteResult<LoopModelStatus>): void {
    this.patch({
      busy: null,
      error: result.ok ? null : failure(result),
      ...(result.ok ? {
        screen: 'ready' as const,
        status: result.value,
      } : {}),
    })
  }

  private async probeExternalSelection(): Promise<'stale' | 'ready' | 'continue'> {
    const generation = this.nextGeneration()
    const request = this.beginRequest()
    const scopeKey = modelScopeKey(this.scope)
    const catalogGeneration = this.catalogGeneration
    this.patch({
      screen: this.store.getSnapshot().status === null ? 'loading' : 'ready',
      busy: 'read',
      error: null,
    })
    const catalogResult = await this.readCatalog(request.signal)
    if (!this.current(generation, request) ||
        scopeKey !== modelScopeKey(this.readScope())) return 'stale'
    if (catalogGeneration !== this.catalogGeneration) {
      this.patch({busy: null})
      return 'stale'
    }
    if (!catalogResult.ok) {
      this.applyCatalog(catalogResult)
      void this.resolveReadiness(
        catalogResult,
        this.loopStatus,
        this.statusFailure,
        scopeKey,
      )
      this.patch({busy: null})
      return 'continue'
    }
    const requested = this.requestedSelection(catalogResult.value)
    const externalReady = requested.projectionReady &&
      !requested.selection.provider.startsWith(LOOP_MODEL_ROUTE_PREFIX) &&
      catalogHasModel(catalogResult.value, requested.selection.provider, requested.selection.model)
    this.applyCatalog(catalogResult)
    if (!externalReady) {
      this.patch({busy: null})
      if (this.defaultSaveUnknown) await this.resolveReadiness(catalogResult, null, null, scopeKey)
      return 'continue'
    }
    this.patch({busy: null})
    await this.resolveReadiness(catalogResult, null, null, scopeKey)
    return this.store.getSnapshot().readiness.kind === 'external-ready'
      ? 'ready'
      : 'continue'
  }

  private applyStatus(status: LoopModelStatus): void {
    this.loopStatus = status
    this.statusFailure = null
    this.patch({
      screen: 'ready',
      status,
      busy: null,
      error: null,
    })
    this.refreshSelection()
  }

  private async readCatalog(
    signal: AbortSignal,
  ): Promise<RemoteResult<HarnessModelCatalog>> {
    if (this.loadModelCatalog === undefined) {
      return {ok: false, error: {code: 'loop/host-update-required', message: ''}}
    }
    return await new Promise(resolve => {
      let settled = false
      const finish = (result: RemoteResult<HarnessModelCatalog>): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        resolve(result)
      }
      const onAbort = (): void => {
        finish({ok: false, error: {code: 'loop/transport', message: ''}})
      }
      const timer = setTimeout(() => {
        finish({ok: false, error: {code: 'loop/catalog-timeout', message: ''}})
      }, this.catalogReadTimeoutMs)
      signal.addEventListener('abort', onAbort, {once: true})
      if (signal.aborted) {
        onAbort()
        return
      }
      Promise.resolve()
        .then(() => {
          if (settled || signal.aborted) {
            return {ok: false, error: {code: 'loop/transport', message: ''}}
          }
          return this.loadModelCatalog!(signal)
        })
        .then(finish, () => {
          finish({ok: false, error: {code: 'loop/transport', message: ''}})
        })
    })
  }

  private applyCatalog(result: RemoteResult<HarnessModelCatalog>): void {
    if (!result.ok) {
      this.catalog = null
      this.catalogFailure = failure(result)
      this.selectionRevision += 1
      this.patch({
        selection: null,
        selectionLoading: false,
        selectionError: this.catalogFailure,
      })
      return
    }
    this.catalog = result.value
    this.catalogFailure = null
    this.patch({selectionError: null})
    this.refreshSelection()
  }

  private refreshCachedReadiness(): void {
    if (this.catalog === null) return
    void this.resolveReadiness(
      {ok: true, value: this.catalog},
      this.loopStatus,
      this.statusFailure,
      modelScopeKey(this.scope),
    )
  }

  private async resolveReadiness(
    catalogResult: RemoteResult<HarnessModelCatalog>,
    status: LoopModelStatus | null,
    statusFailure: ModelFailure | null,
    scopeKey: string,
  ): Promise<void> {
    const revision = ++this.readinessRevision
    const catalog = catalogResult.ok ? catalogResult.value : null
    const requested = catalog === null ? null : this.requestedSelection(catalog)
    let readiness = await resolveModelReadiness({
      status,
      catalog,
      requested,
      scope: this.scope,
      routeForConnection: this.routeForConnection,
      statusFailure,
    })
    if (revision !== this.readinessRevision ||
        scopeKey !== modelScopeKey(this.scope) ||
        scopeKey !== modelScopeKey(this.readScope())) return
    if (this.defaultSaveUnknown && requested?.scope === 'new-session' && catalog !== null) {
      const choices = await availableModelChoices(status, catalog, this.scope, this.routeForConnection)
      if (revision !== this.readinessRevision || scopeKey !== modelScopeKey(this.readScope())) return
      readiness = {
        kind: 'selection-required',
        scopeKey: modelReadinessScopeKey(this.scope, status),
        sessionId: null,
        selectionScope: 'new-session',
        selectionBasis: 'default',
        reason: 'invalid-selection',
        providerId: requested.selection.provider,
        modelId: requested.selection.model,
        choices,
      }
      this.patch({error: {code: 'loop-host/model-default-unknown', message: ''}})
    }
    this.patch({readiness})
  }

  private nextGeneration(): number {
    this.generation += 1
    this.request?.abort()
    return this.generation
  }

  private beginRequest(): AbortController {
    this.request = new AbortController()
    return this.request
  }

  private current(generation: number, request: AbortController): boolean {
    return generation === this.generation && !request.signal.aborted
  }

  private patch(patch: Partial<ModelUiState>): void {
    const previous = this.store.getSnapshot()
    const next = {...previous, ...patch}
    this.store.set(next)
    if (this.autoSelectAfterLogin && !this.automaticSelectionScheduled) {
      this.automaticSelectionScheduled = true
      queueMicrotask(() => {
        this.automaticSelectionScheduled = false
        this.ensureSelection()
      })
    }
    if (previous.busy !== null && next.busy === null) this.scheduleCatalogDrain()
  }

  private async call<T>(
    invoke: (signal: AbortSignal) => Promise<RemoteResult<T>>,
    signal: AbortSignal,
  ): Promise<RemoteResult<T>> {
    try {
      return await invoke(signal)
    } catch {
      return {ok: false, error: {code: 'loop/transport', message: ''}}
    }
  }
}
