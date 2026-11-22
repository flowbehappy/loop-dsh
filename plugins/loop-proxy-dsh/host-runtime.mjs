import {realpath} from "node:fs/promises"
import {
  LOOP_PRODUCT_ENTRY_PATH,
  normalizePageOrigin,
  normalizeServiceBaseURL,
} from "./host-actions-core.mjs"

const SYNC_PROFILE = /^[a-z0-9][a-z0-9._-]{0,63}$/u
const LOOP_WORKSPACE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u
const MANAGED_PROJECT_LIMIT = 200

function failure(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function stateFor(binding, reason, workspace) {
  const workspaceView = workspace ?? (binding === null
    ? undefined
    : {
        workspaceId: binding.workspaceId,
        path: binding.workspacePath,
        displayTitle: binding.workspaceTitle,
      })
  return {
    state: binding === null ? "unbound" : "active",
    revision: binding?.revision ?? "",
    workspace: workspaceView,
    ...(binding === null ? {} : {
      loop: {
        serviceBaseUrl: binding.loopServiceBaseUrl,
        workspaceId: binding.loopWorkspaceId,
        workspaceName: binding.loopWorkspaceName,
        projectId: binding.projectId,
        projectName: binding.projectName,
        defaultChannelId: binding.defaultChannelId,
        webUrl: binding.webUrl,
      },
      account: {displayName: binding.accountName},
      agent: {id: binding.agentId, displayName: binding.agentName},
    }),
    ...(reason === undefined ? {} : {reason}),
  }
}

/**
 * Host lifecycle independent of Cordis and the helper transport.
 */
export class LoopHostRuntime {
  constructor(options) {
    this.syncPreferences = {uploadDisconnectedHistory: false}
    this.harnessSkillPath = options.harnessSkillPath
    this.harnessProfile = options.harnessProfile ?? "web"
    this.store = options.store
    this.workspaces = options.workspaces
    this.sessions = options.sessions
    this.sessionQuery = options.sessionQuery
    this.actions = options.actions
    this.accountPrincipal = options.accountPrincipal ?? ""
    this.defaultServiceBaseUrl = String(options.defaultServiceBaseUrl ?? "").trim()
    this.serviceBaseUrl = ""
    this.serverRevision = ""
    this.loopWorkspaceId = ""
    this.loopWorkspaceManaged = false
    this.serverSettingsCapable = false
    this.actionsReady = this.actions === undefined ? Promise.resolve() : this.initializeActions()
    this.now = options.now ?? Date.now
    this.serverProfileListeners = new Set()
    this.modelConnectionListeners = new Set()
    this.sessionInvalidationListeners = new Set()
    this.projectSyncInFlight = null
    this.projectSyncScheduled = false
    this.projectSyncAuthorization = "unknown"
    this.projectSyncAuthorizationReason = ""
    this.autoSyncSessions = new Set()
    this.sessionUploadStatuses = new Map()
  }

  /** Replace the trusted authenticated account after login/account switch. */
  async setAccountPrincipal(principal) {
    const next = String(principal ?? "")
    const previous = this.accountPrincipal
    if (previous !== "" && next !== "" && previous !== next) {
      throw failure("loop-host/needs-auth", "The Loop account changed")
    }
    // Status/catalog responses repeatedly observe the authenticated account.
    // Resetting a healthy connection here republishes the sync profile and
    // makes telemetry replay every Session from the start on each response.
    if (previous === next && this.projectSyncAuthorization === "authorized") return
    this.accountPrincipal = next
    try {
      await this.store.setActiveAccount(next, this.serviceBaseUrl)
    } catch (error) {
      if (this.accountPrincipal === next) this.accountPrincipal = previous
      throw error
    }
    if (next !== "") await this.store.clearCompletedDisconnect(next, this.serviceBaseUrl, this.loopWorkspaceId)
    this.resetProjectSyncAuthorization()
    if (this.loopWorkspaceId !== "" && await this.store.accountDisconnectPending(next, this.serviceBaseUrl, this.loopWorkspaceId)) {
      this.projectSyncAuthorization = "needs_auth"
    }
    if (previous !== next) this.sessionUploadStatuses.clear()
    this.actions?.setAccountPrincipal?.(next)
    this.scheduleProjectSync()
    void this.publishModelConnectionsChanged()
  }

  /** Attach the trusted authorization/sync adapter after its owning plugin loads. */
  setActions(actions) {
    this.actions = actions
    this.actionsReady = this.initializeActions()
  }

  async initializeActions() {
    // A damaged optional upload setting must fail closed without taking down
    // account, model or collaboration actions. The Settings read still reports it.
    this.syncPreferences = await this.store.getSyncPreferences().catch(() => ({uploadDisconnectedHistory: false}))
    const launchAccountPrincipal = this.accountPrincipal
    this.serverSettingsCapable = typeof this.actions?.setServiceBaseUrl === "function"
    let serverState = await this.store.getGlobalServerState()
    if (serverState.serverUrl === null && this.actions?.globalPageServiceBaseUrl !== undefined) {
      try {
        const configured = normalizeServiceBaseURL(this.actions.globalPageServiceBaseUrl())
        if (configured !== "") serverState = await this.store.setGlobalServer(configured)
      } catch {
        serverState = {serverUrl: null, serverRevision: ""}
      }
    }
    this.serviceBaseUrl = serverState.serverUrl ?? ""
    this.serverRevision = serverState.serverRevision
    this.accountPrincipal = this.serviceBaseUrl === ""
      ? launchAccountPrincipal
      : await this.store.getActiveAccount(this.serviceBaseUrl) || launchAccountPrincipal
    this.actions?.setAccountPrincipal?.(this.accountPrincipal)
    this.loopWorkspaceManaged = typeof this.actions?.currentLoopWorkspaceId === "function"
    this.loopWorkspaceId = this.loopWorkspaceManaged && this.serviceBaseUrl !== ""
      ? await this.store.getLoopWorkspaceForServer(this.accountPrincipal, this.serviceBaseUrl) ?? ""
      : ""
    if (this.loopWorkspaceId === "" &&
        this.loopWorkspaceManaged &&
        this.serviceBaseUrl !== "" &&
        this.serviceBaseUrl === this.defaultServiceBaseUrl) {
      const installedWorkspaceId = this.actions.currentLoopWorkspaceId()
      if (typeof installedWorkspaceId === "string" && LOOP_WORKSPACE_ID.test(installedWorkspaceId)) {
        this.loopWorkspaceId = await this.store.setLoopWorkspaceForServer(
          this.serviceBaseUrl, installedWorkspaceId,
        )
      }
    }
    if (await this.store.accountDisconnectCompleted(this.accountPrincipal, this.serviceBaseUrl, this.loopWorkspaceId)) {
      await this.store.setActiveAccount("", this.serviceBaseUrl)
      this.accountPrincipal = ""
      this.actions?.setAccountPrincipal?.("")
    } else if (this.loopWorkspaceId !== "" && await this.store.accountDisconnectPending(this.accountPrincipal, this.serviceBaseUrl, this.loopWorkspaceId)) {
      this.projectSyncAuthorization = "needs_auth"
    }
    if (serverState.serverUrl !== null && this.actions?.setServiceBaseUrl !== undefined) {
      await this.actions.setServiceBaseUrl(serverState.serverUrl, this.loopWorkspaceId)
    }
    this.publishCurrentSyncProfile()
    this.scheduleProjectSync()
    await this.publishModelConnectionsChanged()
  }

  async waitForActions() {
    await this.actionsReady
    return this.actions
  }

  async globalServerStatus() {
    return await this.store.withServerOperation(undefined, async () => {
      const state = await this.store.getGlobalServerState()
      const actions = await this.waitForActions()
      let connection = {state: "signed_out"}
      if (state.serverUrl !== null) {
        try {
          connection = actions?.accountStatus === undefined
            ? {state: "unavailable"} : await actions.accountStatus({}, undefined)
        } catch { connection = {state: "unavailable", accountPrincipal: this.accountPrincipal || undefined} }
      }
      return {serverUrl: state.serverUrl, serverRevision: state.serverRevision, connection}
    })
  }

  async globalServerWorkspaceStatus() {
    return {loopWorkspaceId: this.loopWorkspaceId || null}
  }

  async configureGlobalServerWorkspace(request, signal) {
    if (signal?.aborted) throw failure("loop-host/cancelled", "Loop Host request was cancelled")
    const workspaceID = String(request?.workspaceId ?? "").trim()
    if (!LOOP_WORKSPACE_ID.test(workspaceID)) {
      throw failure("loop-host/invalid-request", "Loop workspace id is invalid")
    }
    return await this.store.withServerLease(signal, async () => {
      const actions = await this.waitForActions()
      if (this.serviceBaseUrl === "") {
        throw failure("loop-host/needs-auth", "Configure a Loop server in the global Loop page")
      }
      if (request?.expectedServerRevision !== this.serverRevision) {
        throw failure("loop-host/conflict", "The Loop server revision changed")
      }
      if (actions?.setServiceBaseUrl === undefined) {
        throw failure("loop-host/backend-unavailable", "Loop server settings are not available")
      }
      if (workspaceID === this.loopWorkspaceId) return {loopWorkspaceId: workspaceID}
      const previous = this.loopWorkspaceId
      await actions.setServiceBaseUrl(this.serviceBaseUrl, workspaceID)
      try {
        await this.store.setLoopWorkspaceForServer(this.serviceBaseUrl, workspaceID)
      } catch (error) {
        await actions.setServiceBaseUrl(this.serviceBaseUrl, previous).catch(() => {})
        throw error
      }
      this.loopWorkspaceId = workspaceID
      this.resetProjectSyncAuthorization()
      this.scheduleProjectSync()
      void this.publishModelConnectionsChanged()
      return {loopWorkspaceId: workspaceID}
    })
  }

  async configureGlobalServer(request, signal) {
    if (signal?.aborted) throw failure("loop-host/cancelled", "Loop Host request was cancelled")
    return await this.store.withServerLease(signal, async () => {
      const serviceBaseUrl = normalizeServiceBaseURL(request?.serverUrl)
      const actions = await this.waitForActions()
      if (actions?.probeGlobalPage === undefined || actions?.setServiceBaseUrl === undefined) {
        throw failure("loop-host/backend-unavailable", "Loop server settings are not available")
      }
      const page = await actions.probeGlobalPage(serviceBaseUrl, signal)
      if (signal?.aborted) throw failure("loop-host/cancelled", "Loop Host request was cancelled")
      const accountPrincipal = await this.store.getActiveAccount(serviceBaseUrl)
      const loopWorkspaceId = await this.store.getLoopWorkspaceForServer(
        accountPrincipal, serviceBaseUrl,
      ) ?? ""
      const previousState = await this.store.getGlobalServerState()
      const previousServiceBaseUrl = this.serviceBaseUrl
      const previousLoopWorkspaceId = this.loopWorkspaceId
      const nextState = await this.store.setGlobalServer(serviceBaseUrl)
      try {
        await actions.setServiceBaseUrl(serviceBaseUrl, loopWorkspaceId)
      } catch (error) {
        try {
          await this.store.restoreGlobalServerState(previousState)
        } catch {
          throw failure("loop-host/backend-unavailable", "Loop server cutover failed and rollback was incomplete")
        }
        if (previousServiceBaseUrl !== "") {
          try {
            await actions.setServiceBaseUrl(previousServiceBaseUrl, previousLoopWorkspaceId)
          } catch {
            throw failure("loop-host/backend-unavailable", "Loop server cutover failed and helper rollback was incomplete")
          }
        }
        throw error
      }
      this.serviceBaseUrl = serviceBaseUrl
      this.serverRevision = nextState.serverRevision
      this.accountPrincipal = accountPrincipal
      this.actions?.setAccountPrincipal?.(accountPrincipal)
      this.loopWorkspaceId = loopWorkspaceId
      this.resetProjectSyncAuthorization()
      this.publishCurrentSyncProfile()
      this.scheduleProjectSync()
      void this.publishModelConnectionsChanged()
      return {serverUrl: serviceBaseUrl, serverRevision: nextState.serverRevision, page}
    })
  }

  async projectSyncSettings() {
    return await this.projectSyncSettingsLocked()
  }

  async modelStatus(_request, signal) {
    const actions = await this.waitForActions()
    if (actions?.modelStatus === undefined) {
      return {state: "unavailable", connections: [], reason: "Loop model access is unavailable in this Host build"}
    }
    return await actions.modelStatus({}, signal)
  }

  async refreshModelConnections(_request, signal) {
    const actions = await this.waitForActions()
    if (actions?.refreshModelConnections === undefined) {
      throw failure("loop-host/backend-unavailable", "Loop model access is unavailable in this Host build")
    }
    const result = await actions.refreshModelConnections({}, signal)
    await this.publishModelConnectionsChanged()
    return result
  }

  async disconnectModelConnection(request, signal) {
    const actions = await this.waitForActions()
    if (actions?.disconnectModelConnection === undefined) {
      throw failure("loop-host/backend-unavailable", "Loop model access is unavailable in this Host build")
    }
    const result = await actions.disconnectModelConnection({connectionId: request.connectionId}, signal)
    await this.publishModelConnectionsChanged()
    return result
  }

  addModelConnectionListener(listener) {
    if (typeof listener !== "function") throw new TypeError("model connection listener is required")
    this.modelConnectionListeners.add(listener)
    return () => { this.modelConnectionListeners.delete(listener) }
  }

  async publishModelConnectionsChanged() {
    await Promise.all([...this.modelConnectionListeners].map(listener => listener()))
  }

  async projectSyncSettingsLocked() {
    if (this.serviceBaseUrl === "") {
      return projectSyncView({
        enabled: true,
        defaultRoot: this.store.defaultProjectSyncRoot(),
        lastSyncedAt: "",
        lastError: "",
      }, [], {
        serverUrl: null,
        loopWorkspaceId: this.loopWorkspaceId || null,
        authorization: this.projectSyncAuthorization,
        authorizationReason: this.projectSyncAuthorizationReason,
      })
    }
    const settings = await this.store.getProjectSyncSettings(this.serviceBaseUrl)
    const disconnectPending = this.loopWorkspaceId !== "" && await this.store.accountDisconnectPending(this.accountPrincipal, this.serviceBaseUrl, this.loopWorkspaceId)
    return {...projectSyncView({...settings, enabled: true}, [], {
      serverUrl: this.serviceBaseUrl,
      loopWorkspaceId: this.loopWorkspaceId || null,
      authorization: this.projectSyncAuthorization,
      authorizationReason: this.projectSyncAuthorizationReason,
    }), canDisconnect: this.accountPrincipal !== "", canReconnectWorkspaceBindings: !!this.accountPrincipal && !!this.actions?.reconcileWorkspaceBinding && !disconnectPending, disconnectPending}
  }

  resetProjectSyncAuthorization() {
    this.projectSyncAuthorization = "unknown"
    this.projectSyncAuthorizationReason = ""
  }

  // Older loaded clients may still call these methods during an upgrade.
  // Keep the wire error explicit; never recreate retired directory workflows.
  async setProjectSyncSettings() {
    throw failure("loop-host/workflow-retired", "Workspace upload is automatic; reload Harness to update Loop settings")
  }

  async changeProjectDirectory() {
    throw failure("loop-host/workflow-retired", "Manage local workspaces in Harness; reload to update Loop settings")
  }

  /**
   * One coalesced catalog refresh. No interval or per-project polling loop is
   * installed; lifecycle events schedule at most one background attempt.
   */
  async syncProjects(request, signal, options = {}) {
    if (signal?.aborted) throw failure("loop-host/cancelled", "Loop Host request was cancelled")
    // An older loaded client can still request an existing-bindings-only pass.
    if (request?.reconcileWorkspaceBinding === true && options.background !== true) {
      await this.requireAccount()
      const principal = this.accountPrincipal
      return await this.store.withConnectionLease(principal, signal, async () => {
        if (request.expectedServerRevision !== this.serverRevision || principal !== this.accountPrincipal) {
          throw failure("loop-host/conflict", "The Loop connection changed")
        }
        return await this.syncProjectsLocked(signal, {background: true, existingBindingsOnly: true, expectedGrantId: request.expectedGrantId})
      })
    }
    if (this.projectSyncInFlight !== null) return await this.projectSyncInFlight
    const operation = (async () => {
      await this.waitForActions()
      const principal = this.accountPrincipal
      const sync = () => {
        if (this.accountPrincipal !== principal) throw failure("loop-host/conflict", "The Loop connection changed")
        return this.syncProjectsLocked(signal, options)
      }
      return principal === ""
        ? await this.store.withServerOperation(signal, sync)
        : await this.store.withConnectionLease(principal, signal, sync)
    })()
    const inFlight = operation.finally(() => {
      if (this.projectSyncInFlight === inFlight) this.projectSyncInFlight = null
    })
    this.projectSyncInFlight = inFlight
    return await this.projectSyncInFlight
  }

  async syncProjectsLocked(signal, options = {}) {
    const existingBindingsOnly = options.existingBindingsOnly === true
    const canReconcile = typeof this.actions?.reconcileWorkspaceBinding === "function"
    if (this.loopWorkspaceId !== "" && await this.store.accountDisconnectPending(this.accountPrincipal, this.serviceBaseUrl, this.loopWorkspaceId)) {
      if (existingBindingsOnly) throw failure("loop-host/conflict", "Loop sign-out is pending")
      return {...await this.projectSyncSettingsLocked(), imported: 0, updated: 0, skipped: 0}
    }
    if (this.serviceBaseUrl === "" || this.loopWorkspaceId === "") {
      return {
        ...await this.projectSyncSettingsLocked(),
        state: "needs_config",
        reason: "Select a Loop server and workspace in Loop settings",
        imported: 0,
        updated: 0,
        skipped: 0,
      }
    }
    if (existingBindingsOnly && !canReconcile) throw failure("loop-host/unsupported", "This Host cannot repair Workspace bindings")
    if (this.actions?.projectSyncCatalog === undefined ||
        (!existingBindingsOnly && this.actions?.prepareProjectSync === undefined)) {
      throw failure("loop-host/backend-unavailable", "Loop project sync is not available")
    }
    let imported = 0
    let updated = 0
    let skipped = 0
    let failures = 0
    let firstFailureReason = ""
    try {
      const startingPrincipal = this.accountPrincipal
      const catalog = await this.localWorkspaceCatalog(options.background === true, signal)
      // The authorization adapter may publish the newly discovered principal
      // while returning the catalog. A previously known account may not change.
      if ((startingPrincipal !== "" && startingPrincipal !== this.accountPrincipal) ||
          (catalog.state === "active" && this.accountPrincipal !== "" && this.accountPrincipal !== catalog.accountPrincipal)) {
        throw failure("loop-host/conflict", "The Loop connection changed")
      }
      if (catalog.state === "needs_auth") {
        const reason = catalog.reason ?? "Complete Loop authorization once to synchronize projects"
        if (existingBindingsOnly) throw failure("loop-host/needs-auth", reason)
        await this.store.setProjectSyncSettings(this.serviceBaseUrl, {lastError: ""})
        this.projectSyncAuthorization = "needs_auth"
        this.projectSyncAuthorizationReason = reason
        return {
          ...await this.projectSyncSettingsLocked(),
          state: "needs_auth",
          reason,
          ...(catalog.challenge === undefined ? {} : {challenge: catalog.challenge}),
          imported,
          updated,
          skipped,
        }
      }
      const newlyAuthorized = this.projectSyncAuthorization !== "authorized"
      const refreshWorkspaces = async () => {
        if (startingPrincipal === "") {
          if (await this.store.accountDisconnectPending(catalog.accountPrincipal, this.serviceBaseUrl, this.loopWorkspaceId)) {
            throw failure("loop-host/conflict", "Loop sign-out is pending")
          }
          if (this.accountPrincipal === "") await this.setAccountPrincipal(catalog.accountPrincipal)
        }
        if (this.accountPrincipal !== catalog.accountPrincipal) throw failure("loop-host/conflict", "The Loop connection changed")
        if (!existingBindingsOnly) {
          this.projectSyncAuthorization = "authorized"
          this.projectSyncAuthorizationReason = ""
        }
        for (const workspace of this.workspaces.list()) {
          signal?.throwIfAborted()
          try {
            const existing = await this.store.getBinding(catalog.accountPrincipal, workspace.id, workspace.path, this.serviceBaseUrl)
            if (existing?.placementKind === "channel_session") {
              if (canReconcile && await this.reconcileWorkspaceBinding(workspace, existing, catalog, signal, existingBindingsOnly ? options.expectedGrantId : catalog.grantId)) updated++
              else skipped++
              continue
            }
            if (existingBindingsOnly) {
              if (!existing && options.expectedGrantId && this.actions.checkWorkspaceBinding) {
                let nativeTarget
                try {
                  nativeTarget = await this.actions.checkWorkspaceBinding({workspaceId:workspace.id, accountPrincipal:catalog.accountPrincipal}, signal)
                } catch (error) {
                  if (error?.code !== "loop-host/conflict") throw error
                  throw failure("loop-host/conflict", "Restore the original Host workspace mapping before reconnecting " + workspace.id)
                }
                if (nativeTarget) throw failure("loop-host/conflict", "Refresh Workspace sync to restore the local mapping for " + workspace.id)
              }
              skipped++
              continue
            }
            const result = await this.actions.prepareProjectSync({
              workspace: {workspaceId: workspace.id, path: workspace.path, displayTitle: workspace.title || workspace.id},
              accountPrincipal: catalog.accountPrincipal,
              agentId: catalog.agent.agentId,
              localWorkspace: true,
            }, signal)
            await this.store.putBinding(catalog.accountPrincipal, {
              workspaceId: workspace.id, workspacePath: workspace.path,
              workspaceTitle: workspace.title || workspace.id,
              target: result.binding, expectedRevision: existing?.revision ?? null,
            })
            imported++
          } catch (error) {
            signal?.throwIfAborted()
            failures++
            firstFailureReason ||= boundedRuntimeError(error)
          }
        }
      }
      // Initial discovery already holds the server operation; add the now-known
      // account lease before touching bindings, just like an authenticated refresh.
      if (startingPrincipal === "") await this.store.withAccountLease(catalog.accountPrincipal, signal, refreshWorkspaces)
      else await refreshWorkspaces()
      if (!existingBindingsOnly && newlyAuthorized) {
        this.autoSyncSessions.clear()
        this.publishCurrentSyncProfile()
      }
      const reason = failures === 0
        ? ""
        : `${failures} local workspace${failures === 1 ? "" : "s"} could not be uploaded` +
          (firstFailureReason === "" ? "" : `: ${firstFailureReason}`)
      if (!existingBindingsOnly || options.expectedGrantId) {
        await this.store.setProjectSyncSettings(this.serviceBaseUrl, {
          lastSyncedAt: new Date(this.now()).toISOString(),
          lastError: reason,
        })
      }
      return {
        ...await this.projectSyncSettingsLocked(),
        ...(failures !== 0 ? {state: "partial", reason} : existingBindingsOnly ? {state: "ready", reason: undefined} : {}),
        imported,
        updated,
        skipped,
      }
    } catch (error) {
      if (existingBindingsOnly) throw error
      if (error?.code === "loop-host/needs-auth" && error.challenge !== undefined) {
        await this.store.setProjectSyncSettings(this.serviceBaseUrl, {lastError: ""})
        this.projectSyncAuthorization = "needs_auth"
        this.projectSyncAuthorizationReason = error.message
        return {
          ...await this.projectSyncSettingsLocked(),
          state: "needs_auth",
          reason: error.message,
          challenge: error.challenge,
          imported,
          updated,
          skipped,
        }
      }
      await this.store.setProjectSyncError(this.serviceBaseUrl, boundedRuntimeError(error))
      throw error
    }
  }

  async localWorkspaceCatalog(background, signal) {
    const {accountPrincipal, serviceBaseUrl, loopWorkspaceId} = this
    return validateProjectSyncCatalog(await this.actions.projectSyncCatalog({accountPrincipal, background, localWorkspaces: true}, signal),
      {accountPrincipal, serviceBaseUrl, loopWorkspaceId})
  }

  async reconcileWorkspaceBinding(workspace, binding, catalog, signal, expectedGrantId) {
    const {loopServiceBaseUrl, loopWorkspaceId, agentId, placementKind, defaultChannelId, projectId} = binding
    if (binding.unbinding || loopServiceBaseUrl !== this.serviceBaseUrl || loopWorkspaceId !== this.loopWorkspaceId ||
        agentId !== catalog.agent.agentId || !defaultChannelId || projectId !== "" || placementKind !== "channel_session") {
      throw failure("loop-host/conflict", "Workspace binding is disconnecting or belongs to another connection")
    }
    const input = {
      workspace: {workspaceId: workspace.id, path: workspace.path, displayTitle: workspace.title || workspace.id},
      accountPrincipal: catalog.accountPrincipal, agentId, ...(expectedGrantId ? {expectedGrantId} : {}),
      expectedTarget: {loopServiceBaseUrl, loopWorkspaceId, agentId, placementKind, defaultChannelId, projectId},
    }
    const probe = await this.actions.reconcileWorkspaceBinding({...input, confirm: false}, signal)
    const noChange = probe?.changed === false && !probe.needsConfirmation
    if (noChange && probe.owned === false) throw failure("loop-host/conflict", "Saved Workspace binding is missing; repair remains pending")
    if (noChange) {
      if (!binding.repairPending) return false
      if (probe.owned !== true) throw failure("loop-host/conflict", "Saved Workspace binding is missing; repair remains pending")
    } else if (probe?.needsConfirmation !== true || typeof probe.expectedRecord !== "string" || !probe.expectedRecord) {
      throw failure("loop-host/backend-invalid", "Invalid Workspace binding repair probe")
    }
    signal?.throwIfAborted()
    const affected = await this.store.workspaceRemovalPlan(input.accountPrincipal, workspace.id, loopServiceBaseUrl, {allRevisions: true})
    const fenced = binding.repairPending ? binding : await this.store.putBinding(input.accountPrincipal, {
      workspaceId: workspace.id, workspacePath: binding.workspacePath, workspaceTitle: binding.workspaceTitle,
      target: binding, expectedRevision: binding.revision, fencePreviousConsent: true, resumeActions: Boolean(expectedGrantId),
    })
    const ids = [...new Set([...affected.sessionIds, ...workspace.sessionIds])]
    for (const id of ids) { this.autoSyncSessions.delete(id); this.sessionUploadStatuses.delete(id) }
    await this.publishInvalidatedSessions(ids)
    signal?.throwIfAborted()
    if (!noChange) {
      const result = await this.actions.reconcileWorkspaceBinding({...input, confirm: true, expectedRecord: probe.expectedRecord}, signal)
      if (result?.changed !== true) throw failure("loop-host/conflict", "Workspace binding repair was not confirmed")
    }
    await this.store.finishBindingRepair(input.accountPrincipal, fenced)
    return true
  }

  scheduleProjectSync() {
    if (this.projectSyncScheduled) return
    this.projectSyncScheduled = true
    queueMicrotask(() => {
      this.projectSyncScheduled = false
      void this.backgroundProjectSync()
    })
  }

  async backgroundProjectSync() {
    try {
      await this.waitForActions()
      if (this.serviceBaseUrl === "" || this.loopWorkspaceId === "" || this.accountPrincipal === "") return
      await this.syncProjects({}, undefined, {background: true})
    } catch (error) {
      await this.store.setProjectSyncError(this.serviceBaseUrl, boundedRuntimeError(error)).catch(() => {})
    }
  }

  async withConnectionLease(signal, operation) {
    await this.waitForActions()
    if (this.accountPrincipal === "") {
      return await this.store.withServerOperation(signal, operation)
    }
    return await this.store.withConnectionLease(this.accountPrincipal, signal, operation)
  }

  async workspace(ref) {
    const workspace = this.workspaces.get(ref.workspaceId)
    if (workspace === undefined) throw failure("loop-host/workspace-unavailable", "The Workspace is no longer registered")
    let expected
    let actual
    try {
      [expected, actual] = await Promise.all([realpath(workspace.path), realpath(ref.path)])
    } catch {
      throw failure("loop-host/workspace-unavailable", "The Workspace path is unavailable")
    }
    if (expected !== actual) throw failure("loop-host/workspace-conflict", "The Workspace identity does not match its path")
    return workspace
  }

  async restoreAccount() {
    await this.waitForActions()
    if (this.accountPrincipal === "") {
      this.accountPrincipal = this.serviceBaseUrl === "" && this.serverSettingsCapable
        ? ""
        : await this.store.getActiveAccount(this.serviceBaseUrl)
    }
  }

  async requireAccount() {
    await this.restoreAccount()
    if (this.accountPrincipal === "") {
      throw failure("loop-host/needs-auth", "Loop authorization is required")
    }
  }

  async status(request, signal) {
    return await this.withConnectionLease(signal, () => this.statusLocked(request, signal))
  }

  async statusLocked(request, signal) {
    const workspace = await this.workspace(request)
    await this.restoreAccount()
    if (this.serviceBaseUrl === "" && this.serverSettingsCapable) {
      return {
        ...stateFor(null, "Configure a Loop server in the global Loop page", {
          workspaceId: workspace.id,
          path: workspace.path,
          displayTitle: request.displayTitle,
        }),
        state: "needs_auth",
      }
    }
    if (this.accountPrincipal === "" && await this.store.hasBindingForWorkspace(
      workspace.id, workspace.path, this.serviceBaseUrl,
    )) {
      return {
        ...stateFor(null, "This Workspace is connected to a different Loop server; reconnect it to use the selected server", {
          workspaceId: workspace.id,
          path: workspace.path,
          displayTitle: request.displayTitle,
        }),
        state: "needs_auth",
      }
    }
    if (this.accountPrincipal === "") {
      return {
        ...stateFor(null, "Loop authorization is required", {
          workspaceId: workspace.id,
          path: workspace.path,
          displayTitle: request.displayTitle,
        }),
        state: "needs_auth",
      }
    }
    const binding = await this.store.getBinding(
      this.accountPrincipal, workspace.id, workspace.path, this.serviceBaseUrl,
    )
    if (binding === null) {
      const previous = await this.store.getBindingForWorkspace(
        this.accountPrincipal, workspace.id, workspace.path,
      )
      if (previous !== null) {
        return {
          ...stateFor(previous, "This Workspace is connected to a different Loop server; reconnect it to use the selected server", {
            workspaceId: workspace.id,
            path: workspace.path,
            displayTitle: request.displayTitle,
          }),
          state: "needs_auth",
        }
      }
    }
    if (binding !== null && this.actions?.status !== undefined) {
      const checked = await this.actions.status({
        workspace: {workspaceId: workspace.id, path: workspace.path, displayTitle: request.displayTitle},
        accountPrincipal: this.accountPrincipal,
        binding: helperBinding(binding),
      }, signal)
      if (!["active", "needs_auth", "waiting_for_access", "target_unavailable", "revoked"].includes(checked?.state)) {
        throw failure("loop-host/backend-invalid", "Loop authorization returned an invalid binding state")
      }
      if (checked.state !== "active") {
        return {
          ...stateFor(binding, checked?.reason, {
            workspaceId: workspace.id,
            path: workspace.path,
            displayTitle: request.displayTitle,
          }),
          state: checked.state,
        }
      }
      return stateFor(binding, checked.reason, {
        workspaceId: workspace.id,
        path: workspace.path,
        displayTitle: request.displayTitle,
      })
    }
    return stateFor(binding, undefined, {
      workspaceId: workspace.id,
      path: workspace.path,
      displayTitle: request.displayTitle,
    })
  }

  async connectAccount(request, signal) {
    return this.store.withServerLease(signal, async () => {
      const actions = await this.waitForActions()
      if (request.expectedServerRevision !== this.serverRevision || (request.workspaceId !== undefined && request.workspaceId !== this.loopWorkspaceId)) {
        throw failure("loop-host/conflict", "The Loop server or workspace changed")
      }
      if (actions?.connectAccount === undefined) throw failure("loop/host-update-required", "Update the Loop Host")
      const result = await actions.connectAccount({...(request.requestPageAccess ? {requestPageAccess:true} : {}), ...(request.accessToken ? {accessToken:request.accessToken} : {}),principalId: request.principalId, locale: request.locale, ...(request.recoverCredentials === true ? {recoverCredentials: true} : {})}, signal)
      if (result.state === "connected") {
        if (request.principalId !== undefined && result.accountPrincipal !== request.principalId) throw failure("loop-host/conflict", "The Loop account changed")
        if (result.workspaceId && result.workspaceId !== this.loopWorkspaceId) {
          const previous = this.loopWorkspaceId
          await actions.setServiceBaseUrl(this.serviceBaseUrl, result.workspaceId)
          try { await this.store.setLoopWorkspaceForServer(this.serviceBaseUrl, result.workspaceId) }
          catch (error) { await actions.setServiceBaseUrl(this.serviceBaseUrl, previous); throw error }
          this.loopWorkspaceId = result.workspaceId
          this.resetProjectSyncAuthorization()
        }
        // Publish the verified account after the workspace/helper cutover.
        // No iframe identity or background catalog response is needed.
        this.resetProjectSyncAuthorization()
        await this.setAccountPrincipal(result.accountPrincipal)
      }
      return result
    })
  }

  async beginBind(request, signal) {
    const workspace = await this.workspace(request)
    await this.waitForActions()
    await this.restoreAccount()
    if (this.serviceBaseUrl === "" && this.serverSettingsCapable) {
      throw failure("loop-host/needs-auth", "Configure a Loop server in the global Loop page")
    }
    if (this.loopWorkspaceManaged && this.serviceBaseUrl !== "" && this.loopWorkspaceId === "") {
      throw failure("loop-host/workspace-required", "Select a Loop workspace for the configured server")
    }
    if (this.actions?.beginBind === undefined) {
      throw failure("loop-host/backend-unavailable", "Loop authorization is not available in this installation")
    }
    return await this.withConnectionLease(
      signal,
      () => this.beginBindLocked(request, workspace, signal),
    )
  }

  async beginBindLocked(request, workspace, signal) {
    await this.restoreAccountFromHelper(workspace, signal)
    const response = await this.actions.beginBind({
      workspace: {workspaceId: workspace.id, path: workspace.path, displayTitle: request.displayTitle},
      accountPrincipal: this.accountPrincipal,
      mode: request.mode,
      ...(request.locale === undefined ? {} : {locale: request.locale}),
      ...(request.choice === undefined ? {} : {choice: request.choice}),
    }, signal)
    if (response === null || typeof response !== "object") {
      throw failure("loop-host/backend-invalid", "Loop authorization returned an invalid response")
    }
    if (!["needs_auth", "select_target", "active"].includes(response.state)) {
      throw failure("loop-host/backend-invalid", "Loop authorization returned an invalid response state")
    }
    if (response.state === "active" && response.binding !== undefined) {
      const binding = await this.persistTarget(request, response.binding, request.expectedRevision ?? null)
      return {
        state: "active",
        binding: stateFor(binding, undefined, {
          workspaceId: workspace.id,
          path: workspace.path,
          displayTitle: request.displayTitle,
        }),
      }
    }
    const projects = response.projects === undefined ? undefined : validateProjectChoices(response.projects)
    const agents = response.agents === undefined ? undefined : validateAgentChoices(response.agents)
    const challenge = response.challenge === undefined ? undefined : validateChallenge(response.challenge)
    const current = this.accountPrincipal === ""
      ? null
      : await this.store.getBinding(
          this.accountPrincipal, workspace.id, workspace.path, this.serviceBaseUrl,
        ) ?? await this.store.getBindingForWorkspace(
          this.accountPrincipal, workspace.id, workspace.path,
        )
    const binding = stateFor(current, response.reason ?? (current === null ? "Loop authorization is required" : undefined), {
      workspaceId: workspace.id,
      path: workspace.path,
      displayTitle: request.displayTitle,
    })
    if (current === null && response.state === "needs_auth") binding.state = "needs_auth"
    return {
      state: response.state,
      binding,
      ...(challenge === undefined ? {} : {challenge}),
      ...(projects === undefined ? {} : {projects}),
      ...(agents === undefined ? {} : {agents}),
      ...(response.reason === undefined ? {} : {reason: response.reason}),
    }
  }

  async restoreAccountFromHelper(workspace, signal) {
    if (this.accountPrincipal !== "" || this.actions?.status === undefined) return
    const checked = await this.actions.status({
      workspace: {
        workspaceId: workspace.id,
        path: workspace.path,
        displayTitle: workspace.displayTitle,
      },
      accountPrincipal: "",
    }, signal)
    if (checked?.state !== "active" ||
        typeof checked.accountPrincipal !== "string" ||
        checked.accountPrincipal === "") {
      return
    }
    if (checked.accountPrincipal === this.accountPrincipal) return
    await this.setAccountPrincipal(checked.accountPrincipal)
  }

  async completeBind(request, signal) {
    await this.waitForActions()
    await this.requireAccount()
    const workspace = await this.workspace(request)
    if (this.actions?.completeBind === undefined) {
      throw failure("loop-host/backend-unavailable", "Loop authorization is not available in this installation")
    }
    return await this.withConnectionLease(
      signal,
      () => this.completeBindLocked(request, workspace, signal),
    )
  }

  async completeBindLocked(request, workspace, signal) {
    const current = await this.store.getBinding(
      this.accountPrincipal, workspace.id, workspace.path, this.serviceBaseUrl,
    )
    if (request.expectedRevision !== null) {
      if (current === null || current.revision !== request.expectedRevision) {
        throw failure("loop-host/conflict", "The binding revision changed")
      }
    }
    const response = await this.actions.completeBind({
      workspace: {workspaceId: workspace.id, path: workspace.path, displayTitle: request.displayTitle},
      accountPrincipal: this.accountPrincipal,
      challengeId: request.challengeId,
      projectId: request.projectId,
      agentId: request.agentId,
    }, signal)
    const binding = await this.persistTarget(
      request,
      response?.binding,
      request.expectedRevision ?? current?.revision ?? null,
    )
    return {binding: stateFor(binding)}
  }

  async persistTarget(request, target, expectedRevision) {
    if (target === null || typeof target !== "object") {
      throw failure("loop-host/backend-invalid", "Loop authorization returned no binding target")
    }
    if (this.serviceBaseUrl !== "" &&
        normalizeServiceBaseURL(target.loopServiceBaseUrl) !== this.serviceBaseUrl) {
      throw failure("loop-host/conflict", "Loop authorization belongs to a different server")
    }
    if (this.loopWorkspaceManaged) {
      if (this.loopWorkspaceId === "") {
        throw failure("loop-host/workspace-required", "Select a Loop workspace for the configured server")
      }
      if (target.loopWorkspaceId !== this.loopWorkspaceId) {
        throw failure("loop-host/conflict", "Loop authorization belongs to a different workspace")
      }
    }
    const workspace = await this.workspace(request)
    const binding = await this.store.putBinding(this.accountPrincipal, {
      workspaceId: workspace.id,
      workspacePath: workspace.path,
      workspaceTitle: request.displayTitle,
      expectedRevision,
      target,
    })
    if (this.loopWorkspaceManaged) {
      await this.store.setLoopWorkspaceForServer(this.serviceBaseUrl, this.loopWorkspaceId)
    }
    return binding
  }

  async disconnectAccount(request, signal) {
    await this.restoreAccount()
    if (this.accountPrincipal === "") return {state: "signed_out"}
    if (typeof this.actions?.disconnectAccount !== "function") {
      throw failure("loop-host/backend-unavailable", "Update the Loop plugin to sign out")
    }
    return this.withConnectionLease(signal, async () => {
      const principal = this.accountPrincipal
      if (!await this.store.accountDisconnectCompleted(principal, this.serviceBaseUrl, this.loopWorkspaceId)) {
        const sessionIds = await this.store.beginAccountDisconnect(principal, this.serviceBaseUrl, this.loopWorkspaceId)
        this.projectSyncAuthorization = "needs_auth"
        this.projectSyncAuthorizationReason = "Loop sign-out is pending"
        this.sessionUploadStatuses.clear()
        // First-message admission may still be pending, without a stored Session
        // binding yet. Fence those local Sessions at the same logout boundary.
        const localSessionIds = this.workspaces?.list().flatMap(workspace => workspace.sessionIds) ?? []
        await this.publishInvalidatedSessions([...new Set([...sessionIds, ...localSessionIds])])
        try {
          await this.actions.disconnectAccount({accountPrincipal: principal, ...request}, signal)
        } catch (error) {
          if (error?.code === "loop-host/disconnect-auth-required" && error.challenge) {
            return {state: "needs_confirmation", challenge: validateProjectSyncChallenge(error.challenge, true)}
          }
          throw error
        }
      }
      await this.store.finishAccountDisconnect(principal, this.serviceBaseUrl, this.loopWorkspaceId)
      this.autoSyncSessions.clear()
      await this.setAccountPrincipal("")
      return {state: "signed_out"}
    })
  }

  async unbind(request, signal) {
    await this.waitForActions()
    await this.requireAccount()
    const workspace = await this.workspace(request)
    if (this.actions?.unbind === undefined) {
      throw failure("loop-host/backend-unavailable", "Loop authorization is not available in this installation")
    }
    return await this.withConnectionLease(
      signal,
      () => this.unbindLocked(request, workspace, signal),
    )
  }

  async unbindLocked(request, workspace, signal) {
    const current = await this.store.getBinding(
      this.accountPrincipal, workspace.id, workspace.path, this.serviceBaseUrl,
    )
    if (current === null || current.revision !== request.expectedRevision) {
      throw failure("loop-host/conflict", "The binding revision changed")
    }
    await this.store.beginUnbinding(
      this.accountPrincipal,
      workspace.id,
      workspace.path,
      request.expectedRevision,
      this.serviceBaseUrl,
    )
    const currentServer = await this.store.getBinding(
      this.accountPrincipal, workspace.id, workspace.path, this.serviceBaseUrl,
    )
    if (currentServer === null) throw failure("loop-host/conflict", "The Workspace is not bound to the selected Loop server")
    const removal = await this.store.workspaceRemovalPlan(this.accountPrincipal, workspace.id, this.serviceBaseUrl)
    await this.publishInvalidatedSessions(removal.sessionIds)
    await this.actions.unbind({
      workspace: {workspaceId: workspace.id, path: workspace.path, displayTitle: request.displayTitle},
      accountPrincipal: this.accountPrincipal,
      expectedRevision: request.expectedRevision,
      hasRemainingBindings: removal.hasRemainingBindings,
      sessionIds: removal.sessionIds,
      ...(request.recoveryMode === undefined ? {} : {recoveryMode: request.recoveryMode}),
    }, signal)
    await this.store.removeBinding(
      this.accountPrincipal, workspace.id, workspace.path, request.expectedRevision, this.serviceBaseUrl,
    )
    await this.store.removeManagedProjectByWorkspace(
      this.accountPrincipal,
      workspace.id,
      this.serviceBaseUrl,
    )
    return {
      binding: stateFor(null, undefined, {
        workspaceId: workspace.id,
        path: workspace.path,
        displayTitle: request.displayTitle,
      }),
    }
  }

  async captureSession(workspaceId, sessionId) {
    await this.restoreAccount()
    if (this.loopWorkspaceId !== "" && await this.store.accountDisconnectPending(this.accountPrincipal, this.serviceBaseUrl, this.loopWorkspaceId)) return null
    if (this.accountPrincipal === "") return null
    const {workspace, session, associated} = await this.sessionWorkspace(workspaceId, sessionId)
    if (!associated) return null
    const createdAt = Number(session.header?.createdAt)
    if (!Number.isFinite(createdAt)) return null
    const binding = await this.store.getBinding(
      this.accountPrincipal, workspace.id, workspace.path, this.serviceBaseUrl,
    )
    if (binding === null || binding.unbinding === true) return null
    return await this.store.captureSession(this.accountPrincipal, {
      workspaceId,
      sessionId,
      sessionCreatedAt: createdAt,
      binding,
    })
  }

  /**
   * Capture a newly created Session and prepare its project-default sync
   * intent before the first visible event reaches the telemetry admission gate.
   */
  async captureSessionForProjectSync(workspaceId, sessionId) {
    const record = await this.captureSession(workspaceId, sessionId)
    if (record?.syncEnabled === true && record.syncPreference === "project_default") {
      await this.startAutomaticSessionSync(record)
    }
    return record
  }

  async sessionContext(request) {
    return await this.sessionContextLocked(request)
  }

  async sessionContextLocked(request, {forActions = false} = {}) {
    let savedWithoutCurrentAccount = null
    if (this.accountPrincipal === "") {
      savedWithoutCurrentAccount = await this.store.getSessionForWorkspaceAnyAccount(
        request.workspaceId, request.sessionId,
      )
      if (savedWithoutCurrentAccount !== null &&
          this.serviceBaseUrl !== "" &&
          savedWithoutCurrentAccount.loopServiceBaseUrl !== this.serviceBaseUrl) {
        return {
          sessionId: request.sessionId,
          state: "needs_auth",
          bindingRevision: savedWithoutCurrentAccount.bindingRevision,
          projectId: savedWithoutCurrentAccount.projectId,
          defaultChannelId: savedWithoutCurrentAccount.defaultChannelId,
          reason: "This Session keeps its original Loop server and project context",
        }
      }
    }
    await this.requireAccount()
    const {workspace, session, associated} = await this.sessionWorkspace(request.workspaceId, request.sessionId)
    if (workspace === undefined) throw failure("loop-host/workspace-unavailable", "The Workspace is no longer registered")
    if (!associated || session === undefined) {
      throw failure("loop-host/session-unavailable", "The Session does not belong to this Workspace")
    }
    let record = await this.store.getSession(this.accountPrincipal, request.workspaceId, request.sessionId)
    record ??= await this.captureSession(request.workspaceId, request.sessionId)
    if (record === null) return {
      sessionId: request.sessionId,
      state: "unbound",
      bindingRevision: "",
      reason: await this.store.getBinding(this.accountPrincipal, workspace.id, workspace.path, this.serviceBaseUrl) === null
        ? "This Workspace has no Loop binding yet"
        : "This Session was created before the current Workspace binding",
    }
    const binding = record.legacyBinding ?? await this.store.getBinding(
      this.accountPrincipal, request.workspaceId, workspace.path, this.serviceBaseUrl,
    )
    const sessionServer = record.loopServiceBaseUrl ?? ""
    // A verified reconnection can restore actions on the verified channel.
    // Upload checks continue to require the original consent revision.
    const restored = forActions && record.actionRevision && record.actionRevision === binding?.revision &&
      binding.loopWorkspaceId === this.loopWorkspaceId && binding.defaultChannelId === record.defaultChannelId
    const current = sessionServer !== "" && binding !== null && !binding.unbinding && !binding.repairPending &&
      sessionServer === binding.loopServiceBaseUrl &&
      (binding.revision === record.bindingRevision || restored)
    return {
      sessionId: request.sessionId,
      state: current ? "inherited" : "blocked",
      bindingRevision: current ? binding.revision : record.bindingRevision,
      projectId: record.projectId,
      defaultChannelId: record.defaultChannelId,
      ...(current ? {agent: {id: binding.agentId, displayName: binding.agentName}, loopWorkspaceId: binding.loopWorkspaceId} : {}),
      ...(current ? {} : {
        reason: sessionServer === ""
          ? "This Session's original Loop server cannot be verified"
          : sessionServer !== binding?.loopServiceBaseUrl
          ? "This Session keeps its original Loop server and project context"
          : binding?.unbinding === true
          ? "This Workspace is being unbound from Loop"
          : "The Session keeps its original project binding",
      }),
    }
  }

  /**
   * Check whether one Session is currently opted into sync under the live
   * Workspace binding revision. Telemetry must call this before enqueueing.
   */
  async sessionSyncEnabled(sessionId) {
    return await this.sessionSyncTarget(sessionId) !== null
  }

  async sessionSyncTarget(sessionId) {
    if (await this.store.connectionBusy()) return null
    try {
      await this.requireAccount()
    } catch (error) {
      if (error?.code === "loop-host/needs-auth") return null
      throw error
    }
    if (this.loopWorkspaceId !== "" && await this.store.accountDisconnectPending(this.accountPrincipal, this.serviceBaseUrl, this.loopWorkspaceId)) return null
    let record = await this.store.getSessionByID(this.accountPrincipal, sessionId)
    if (record === null) {
      const workspace = await this.workspaceForSession(sessionId)
      if (workspace === undefined) return null
      const binding = await this.store.getBinding(this.accountPrincipal, workspace.id, workspace.path, this.serviceBaseUrl)
      if (binding?.placementKind !== "channel_session") {
        await this.syncProjects({}, undefined, {background: true})
      }
      record = await this.captureSession(workspace.id, sessionId)
    }
    if (record === null || record.syncEnabled !== true) return null
    const sessionServer = record.loopServiceBaseUrl ?? ""
    if (sessionServer === "" ||
        (this.serviceBaseUrl !== "" && sessionServer !== this.serviceBaseUrl)) {
      return null
    }
    const binding = record.legacyBinding ?? await this.store.getBinding(
      this.accountPrincipal,
      record.workspaceId,
      record.workspacePath,
      sessionServer,
    )
    const enabled = binding !== null && binding.unbinding !== true &&
      binding.loopServiceBaseUrl === sessionServer &&
      binding.revision === record.bindingRevision
    if (!enabled) return null
    await this.startAutomaticSessionSync(record)
    const syncProfile = await this.currentSyncProfile()
    return syncProfile === "" ? null : {
      profile: syncProfile,
      pendingContext: {
        accountPrincipal: this.accountPrincipal,
        loopWorkspaceId: binding.loopWorkspaceId,
        agentId: binding.agentId,
        projectId: record.projectId,
        defaultChannelId: record.defaultChannelId,
      },
    }
  }

  setSessionUploadStatus(sessionId, status) {
    if (status === "uploaded" || status === "idle") {
      this.sessionUploadStatuses.delete(sessionId)
    } else if (["uploading", "queued", "failed"].includes(status)) {
      this.sessionUploadStatuses.set(sessionId, status)
    }
  }

  /**
   * Materialize the existing host-sync outbox before the first source event.
   * A zero boundary includes the pending first turn; the server and bridge
   * still perform all authorization, binding, and event deduplication checks.
   */
  async startAutomaticSessionSync(record) {
    if (record.syncPreference !== "project_default" ||
        this.autoSyncSessions.has(record.sessionId) ||
        typeof this.actions?.setSync !== "function") {
      return
    }
    try {
      const started = await this.withConnectionLease(undefined, async () => {
        const current = await this.store.getSession(
          this.accountPrincipal,
          record.workspaceId,
          record.sessionId,
        )
        if (current === null ||
            current.syncEnabled !== true ||
            current.syncPreference !== "project_default") {
          return false
        }
        const binding = current.legacyBinding ?? await this.store.getBinding(
          this.accountPrincipal,
          current.workspaceId,
          current.workspacePath,
          current.loopServiceBaseUrl,
        )
        if (binding === null ||
            binding.unbinding === true ||
            binding.revision !== current.bindingRevision ||
            binding.loopServiceBaseUrl !== current.loopServiceBaseUrl) {
          return false
        }
        const sync = validateSyncStatus(await this.actions.setSync({
          workspaceId: current.workspaceId,
          sessionId: current.sessionId,
          enabled: true,
          confirmedSourceSequence: 0,
          accountPrincipal: this.accountPrincipal,
          context: syncContext({...current, agentId: binding.agentId}),
        }))
        return sync.state === "on" || sync.state === "pending"
      })
      if (started) this.autoSyncSessions.add(record.sessionId)
    } catch {
      // Leave admission retryable; a missing helper must not drop the Host event.
    }
  }

  syncCapturePolicy() {
    return {...this.syncPreferences, loggedIn: this.accountPrincipal !== "" && this.projectSyncAuthorization !== "needs_auth"}
  }

  async getSyncPreferences() {
    this.syncPreferences = await this.store.getSyncPreferences()
    return this.syncPreferences
  }

  async setSyncPreferences(value) {
    this.syncPreferences = await this.store.setSyncPreferences(value)
    this.publishCurrentSyncProfile()
    return this.syncPreferences
  }

  async currentSyncProfile() {
    await this.waitForActions()
    const value = this.actions?.currentSyncProfile?.()
    return typeof value === "string" && SYNC_PROFILE.test(value) ? value : ""
  }

  addServerProfileListener(listener) {
    if (typeof listener !== "function") throw new TypeError("server profile listener is required")
    this.serverProfileListeners.add(listener)
    return () => {
      this.serverProfileListeners.delete(listener)
    }
  }

  addSessionInvalidationListener(listener) {
    if (typeof listener !== "function") throw new TypeError("session invalidation listener is required")
    this.sessionInvalidationListeners.add(listener)
    return () => {
      this.sessionInvalidationListeners.delete(listener)
    }
  }

  publishCurrentSyncProfile() {
    const profile = this.actions?.currentSyncProfile?.()
    if (typeof profile !== "string" || !SYNC_PROFILE.test(profile)) return
    for (const listener of this.serverProfileListeners) {
      try {
        listener(profile)
      } catch {}
    }
  }

  async publishInvalidatedSessions(sessionIds) {
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) return
    const snapshot = [...sessionIds]
    await Promise.all([...this.sessionInvalidationListeners].map(listener => listener(snapshot)))
  }

  async sessionWorkspace(workspaceId, sessionId) {
    let workspace
    let session
    for (let attempt = 0; attempt < 4; attempt += 1) {
      workspace = this.workspaces.get(workspaceId)
      session = this.sessions.get(sessionId)
      if (session === undefined && workspace?.sessionIds.includes(sessionId) && this.sessionQuery !== undefined) {
        const observed = await this.sessionQuery.observeSession(sessionId, {projectionMode: "none"})
        try { session = {id: sessionId, header: observed.header} } finally { observed[Symbol.dispose]?.() }
      }
      if (workspace !== undefined && session !== undefined && workspace.sessionIds.includes(sessionId)) {
        return {workspace, session, associated: true}
      }
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 10))
    }
    return {workspace, session, associated: false}
  }

  async workspaceForSession(sessionId) {
    if (typeof this.workspaces.list !== "function") return undefined
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const workspace = this.workspaces.list().find(item => item.sessionIds.includes(sessionId))
      if (workspace !== undefined) return workspace
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 10))
    }
    return undefined
  }

  async syncStatus(request, signal) {
    // Hover details read local receipts only. They never prepare a mapping,
    // start login, or wait for the connection/upload mutation lease.
    const pending = this.sessionUploadStatuses.get(request.sessionId)
    const base = {pending: 0, historyPartial: false}
    if (this.accountPrincipal === "" || this.actions?.syncStatus === undefined) return {...base, state: "off"}
    if (pending === "failed") return {...base, state: "error", health: "error"}
    if (pending === "uploading") return {...base, state: "pending", health: "pending"}
    try {
      const record = await this.store.getSession(this.accountPrincipal, request.workspaceId, request.sessionId)
      if (record === null) return {...base, state: "pending", health: "pending"}
      return validateSyncStatus(await this.actions.syncStatus({
        ...request, accountPrincipal: this.accountPrincipal, context: syncContext(record),
      }, signal))
    } catch {
      return {...base, state: "error", health: "error"}
    }
  }

  async setSync(request, signal) {
    return await this.withConnectionLease(signal, () => this.setSyncLocked(request, signal))
  }

  async setSyncLocked(request, signal) {
    await this.requireAccount()
    const context = await this.sessionContextLocked(request)
    if (context.state !== "inherited") throw failure("loop-host/conflict", context.reason ?? "The Session is not bound")
    if (this.actions?.setSync === undefined) {
      throw failure("loop-host/backend-unavailable", "Host sync is not installed")
    }
    const sessionRecord = await this.store.getSession(
      this.accountPrincipal, request.workspaceId, request.sessionId,
    )
    const binding = sessionRecord === null
      ? null
      : await this.store.getBinding(
        this.accountPrincipal,
        sessionRecord.workspaceId,
        sessionRecord.workspacePath,
        sessionRecord.loopServiceBaseUrl,
      )
    const sourceSequence = request.enabled &&
      sessionRecord?.syncPreference !== "project_default"
      ? latestSourceSequence(this.sessions.get(request.sessionId))
      : undefined
    const sync = validateSyncStatus(await this.actions.setSync({
      ...request,
      accountPrincipal: this.accountPrincipal,
      ...(sourceSequence === undefined ? {} : {confirmedSourceSequence: sourceSequence}),
      context: syncContext({...context, agentId: binding?.agentId}),
    }, signal))
    if (!request.enabled || (sync.state !== "needs_auth" && sync.state !== "off")) {
      try {
        await this.store.setSessionSync(
          this.accountPrincipal,
          request.workspaceId,
          request.sessionId,
          request.enabled,
        )
      } catch {
        // The Sync owner's acknowledged state is authoritative; local health is a cache.
      }
    }
    return {sync}
  }

  async createProject(request, signal) {
    return await this.withConnectionLease(signal, () => this.createProjectLocked(request, signal))
  }

  async createProjectLocked(request, signal) {
    await this.requireAccount()
    const workspace = await this.workspace(request)
    if (this.actions?.createProject === undefined) {
      throw failure("loop-host/backend-unavailable", "Project creation is not available in this installation")
    }
    const project = await this.actions.createProject({
      workspace: {workspaceId: workspace.id, path: workspace.path, displayTitle: request.displayTitle},
      accountPrincipal: this.accountPrincipal,
      challengeId: request.challengeId,
      name: request.name,
      prefix: request.prefix,
    }, signal)
    validateProjectChoice(project)
    return project
  }

  /** Resolve the configured Loop service page without any Harness identity. */
  async globalPage(request, signal) {
    return await this.store.withServerOperation(signal, () => this.globalPageLocked(request, signal))
  }

  async globalPageLocked(request, signal) {
    if (signal?.aborted) throw failure("loop-host/cancelled", "Loop Host request was cancelled")
    await this.waitForActions()
    if (this.serviceBaseUrl === "" && this.serverSettingsCapable) {
      throw failure("loop-host/needs-auth", "Configure a Loop server in the global Loop page")
    }
    if (this.actions?.globalPage === undefined || this.actions?.globalPageServiceBaseUrl === undefined) {
      throw failure("loop-host/backend-unavailable", "The Loop global page is not available")
    }
    const serviceBaseUrl = normalizeServiceBaseURL(this.actions.globalPageServiceBaseUrl())
    const page = await this.actions.globalPage({}, signal)
    if (page === null || typeof page !== "object" || typeof page.url !== "string") {
      throw failure("loop-host/backend-invalid", "The Loop global page is invalid")
    }
    let url
    try {
      url = new URL(page.url)
    } catch {
      throw failure("loop-host/backend-invalid", "The Loop global page URL is invalid")
    }
    const expected = new URL(serviceBaseUrl)
    const basePath = expected.pathname.replace(/\/+$/u, "")
    const entryPath = `${basePath}/external-host/page-login`
    const fragment = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : "")
    const next = fragment.get("next")
    const ordinaryLogin = url.pathname === entryPath &&
      [...fragment.keys()].length === 1 && next === `${basePath}${LOOP_PRODUCT_ENTRY_PATH}`
    const authorizedLaunch = url.pathname === `${basePath}/external-host/page-session` &&
      validHostPageFragment(url.hash) &&
      ["/", `${basePath}${LOOP_PRODUCT_ENTRY_PATH}`].includes(next)
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
        url.origin !== expected.origin || url.search !== "" || (!ordinaryLogin && !authorizedLaunch)) {
      throw failure("loop-host/backend-invalid", "The Loop global page URL is invalid")
    }
    return {url: url.href}
  }

  async openLoopPage(request, signal) {
    return await this.withConnectionLease(signal, () => this.openLoopPageLocked(request, signal))
  }

  async openLoopPageLocked(request, signal) {
    await this.waitForActions()
    await this.requireAccount()
    const workspace = await this.workspace(request)
    const binding = await this.store.getBinding(
      this.accountPrincipal, workspace.id, workspace.path, this.serviceBaseUrl,
    )
    if (binding === null) throw failure("loop-host/conflict", "The Workspace is not bound")
    if (request.projectId !== undefined && request.projectId !== binding.projectId) {
      throw failure("loop-host/conflict", "The requested Project is not bound to this Workspace")
    }
    if (request.sessionId !== undefined) {
      const session = await this.sessionContextLocked({
        workspaceId: workspace.id,
        sessionId: request.sessionId,
      })
      if (session.state !== "inherited" || session.projectId !== binding.projectId) {
        throw failure("loop-host/conflict", "The Session is not using the current Workspace binding")
      }
    }
    if (this.actions?.openLoopPage === undefined) {
      throw failure("loop-host/backend-unavailable", "The isolated Loop page session is not available")
    }
    const page = await this.actions.openLoopPage({
      workspace: {workspaceId: workspace.id, path: workspace.path, displayTitle: request.displayTitle},
      accountPrincipal: this.accountPrincipal,
      binding: helperBinding(binding),
      ...(request.sessionId === undefined ? {} : {sessionId: request.sessionId}),
      ...(request.pagePath === undefined ? {} : {pagePath: request.pagePath}),
    }, signal)
    if (page === null || typeof page !== "object" || typeof page.url !== "string"
      || typeof page.expiresAt !== "string") {
      throw failure("loop-host/backend-invalid", "The isolated Loop page session is invalid")
    }
    let url
    try {
      url = new URL(page.url)
    } catch {
      throw failure("loop-host/backend-invalid", "The isolated Loop page URL is invalid")
    }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
        url.search !== "" || !validHostPageFragment(url.hash)) {
      throw failure("loop-host/backend-invalid", "The isolated Loop page URL is invalid")
    }
    return {url: url.href, expiresAt: page.expiresAt}
  }

  async retrySync(request, signal) {
    return await this.withConnectionLease(signal, () => this.retrySyncLocked(request, signal))
  }

  async retrySyncLocked(request, signal) {
    await this.requireAccount()
    const context = await this.sessionContextLocked(request)
    if (context.state !== "inherited") throw failure("loop-host/conflict", context.reason ?? "The Session is not bound")
    if (this.actions?.retrySync === undefined) {
      throw failure("loop-host/backend-unavailable", "Host sync is not installed")
    }
    const result = validateSyncStatus(await this.actions.retrySync({
      ...request, accountPrincipal: this.accountPrincipal, context: syncContext(context),
    }, signal))
    if (["on", "pending", "off"].includes(result.state)) {
      this.setSessionUploadStatus(request.sessionId, "uploaded")
    }
    return result
  }

  canUseAgentActions() {
    return typeof this.actions?.agentAction === "function"
      && typeof this.actions?.agentCatalog === "function"
      && typeof this.actions?.agentSchema === "function"
  }

  async humanConnectionRequest(operation, request, signal) {
    return await this.withConnectionLease(signal, async () => {
      await this.restoreAccount()
      if (!this.accountPrincipal && operation === "humanStatus") {
        return {state: "signed_out", connection: request.connection}
      }
      await this.requireAccount()
      if (typeof this.actions?.[operation] !== "function") {
        throw failure("loop-host/backend-unavailable", "The native Loop Human connection is unavailable")
      }
      if (request.serviceBaseUrl && request.serviceBaseUrl !== this.serviceBaseUrl ||
          request.accountPrincipal && request.accountPrincipal !== this.accountPrincipal ||
          request.loopWorkspaceId && this.loopWorkspaceId && request.loopWorkspaceId !== this.loopWorkspaceId) {
        throw failure("loop-host/conflict", "The original Loop account or workspace changed")
      }
      return await this.actions[operation]({...request, accountPrincipal: this.accountPrincipal, loopWorkspaceId: this.loopWorkspaceId || request.loopWorkspaceId}, signal)
    })
  }

  // Business APIs carry explicit resource IDs. Only the original connection
  // matters here. Upload settings and the conversation channel belong to sync.
  async businessWorkspace(sessionId) {
    await this.requireAccount()
    const workspace = await this.workspaceForSession(sessionId)
    if (!workspace) throw failure("loop-host/session-unavailable", "The Session does not belong to a registered Workspace")
    const {session, associated} = await this.sessionWorkspace(workspace.id, sessionId)
    if (!associated || !session) throw failure("loop-host/session-unavailable", "The Session does not belong to this Workspace")
    if (this.loopWorkspaceId && await this.store.accountDisconnectPending(this.accountPrincipal, this.serviceBaseUrl, this.loopWorkspaceId)) {
      throw failure("loop-host/needs-auth", "Loop disconnect is pending")
    }
    const conflict = () => failure("loop-host/conflict", "This Session keeps its original Loop connection")
    const record = await this.store.getSession(this.accountPrincipal, workspace.id, sessionId)
    if (!record && await this.store.getSessionForWorkspaceAnyAccount(workspace.id, sessionId)) throw conflict()
    const binding = record?.legacyBinding ?? await this.store.getBinding(this.accountPrincipal, workspace.id, workspace.path, this.serviceBaseUrl)
    if (!record && !binding && await this.store.getBindingForWorkspace(this.accountPrincipal, workspace.id, workspace.path)) throw conflict()
    if (record && (!record.loopServiceBaseUrl || this.serviceBaseUrl && record.loopServiceBaseUrl !== this.serviceBaseUrl)) throw conflict()
    const originalWorkspace = record?.loopWorkspaceId ?? binding?.loopWorkspaceId
    if (this.loopWorkspaceId && (originalWorkspace && originalWorkspace !== this.loopWorkspaceId ||
        record && !record.loopWorkspaceId && (!binding || ![record.bindingRevision, record.actionRevision].includes(binding.revision)))) throw conflict()
    return {workspace, loopWorkspaceId: this.loopWorkspaceId || originalWorkspace}
  }

  humanTaskOwner(sessionId, signal, requestedAction) {
    return this.withConnectionLease(signal, async () => {
      const {workspace} = await this.businessWorkspace(sessionId)
      let readOnly
      if (requestedAction && this.canUseAgentActions()) {
        const contract = await this.actions.agentSchema({workspaceId:workspace.id, sessionId, accountPrincipal:this.accountPrincipal,
          name:requestedAction, personalSchema:true},signal)
        readOnly = contract?.readOnly
        if (contract?.action !== requestedAction && contract?.id !== requestedAction) {
          throw failure("loop-host/invalid-request","Loop did not confirm this personal action. Discover an available action before requesting consent.")
        }
      }
      return {serviceBaseUrl:this.serviceBaseUrl, accountPrincipal:this.accountPrincipal, loopWorkspaceId:this.loopWorkspaceId || undefined,...(typeof readOnly === "boolean" ? {readOnly} : {})}
    })
  }

  async humanCommand(sessionId, command, signal, hasCurrentUserInput, taskGrant) {
    return await this.withConnectionLease(signal, async () => {
      const {workspace} = await this.businessWorkspace(sessionId)
      const {connection, verb, name, input} = command
      if (command.principal !== "human" || !["business", "apps"].includes(connection)) {
        throw failure("loop-host/invalid-request", "Select the Human business or Apps connection explicitly")
      }
      const payload = {workspaceId: workspace.id, sessionId, accountPrincipal: this.accountPrincipal,
        loopWorkspaceId: this.loopWorkspaceId || undefined, connection}
      if (taskGrant) {
        if (!hasCurrentUserInput() || taskGrant.serviceBaseUrl !== this.serviceBaseUrl || taskGrant.accountPrincipal !== payload.accountPrincipal || taskGrant.workspaceId !== this.loopWorkspaceId && this.loopWorkspaceId) {
          throw failure("loop-host/conflict", "The original task or Loop account changed")
        }
        Object.assign(payload, {policyKey:taskGrant.policyKey, expectedGrantId:taskGrant.id, loopWorkspaceId:taskGrant.workspaceId})
      }
      const mode = connection === "apps" ? "human-apps" : "human"
      if (verb === "actions") {
        const result = await this.actions.humanCatalog({...payload, prefix: name}, signal)
        if (result?.error) return {failed: true, output: boundedJSON(result)}
        if (!Array.isArray(result?.actions) || result.actions.some(id => typeof id !== "string")) {
          throw failure("loop-host/backend-invalid", "Loop Human action catalog is invalid")
        }
        return {failed: false, output: boundedJSON({principal: "human", connection, actions: result.actions})}
      }
      if (verb === "schema") {
        const result = await this.actions.humanSchema({...payload, name}, signal)
        if (!result || typeof result !== "object" || (!result.error && result.id !== name)) {
          throw failure("loop-host/backend-invalid", "Loop Human action schema is invalid")
        }
        if (!result.error && !JSON.parse(input || "{}").includeOutput) {
          const {outputSchema, ...inputDescription} = result
          return {failed: false, output: boundedJSON({...inputDescription,
            outputSchemaHint: 'Load only if needed: loop-proxy ' + mode + ' schema ' + name + ' {"includeOutput":true}'})}
        }
        return {failed: Boolean(result?.error), output: boundedJSON(result)}
      }
      if (verb === "call") {
        // A remote event or a subagent continuation cannot start a Human write.
        // The adapter also checks the live schema when this flag is set.
        const result = await this.actions.humanAction({...payload, name, arguments: JSON.parse(input),
          requireReadOnly: hasCurrentUserInput?.() !== true}, signal)
        if (result === null || typeof result !== "object" || (!Object.hasOwn(result, "data") && !result.error)) {
          throw failure("loop-host/backend-invalid", "Loop Human action result is invalid")
        }
        return {failed: Boolean(result.error), output: boundedJSON(result)}
      }
      throw failure("loop-host/invalid-request", "Loop Human command is invalid")
    })
  }

  async agentCommand(sessionId, command, signal, prepareDelegation = false) {
    return await this.withConnectionLease(signal, async () => {
      const result = await this.agentCommandLocked(sessionId, command, signal, prepareDelegation)
      if (result.delegation) result.owner = {serviceBaseUrl:this.serviceBaseUrl,accountPrincipal:this.accountPrincipal,loopWorkspaceId:this.loopWorkspaceId}
      return result
    })
  }

  // Reuse the normal local-workspace mapping on demand. Never move a saved
  // Session to another project/account/server, or enable historical uploads.
  async ensureSessionContextLocked(sessionId, signal) {
    await this.requireAccount()
    const workspace = await this.workspaceForSession(sessionId)
    if (workspace === undefined) throw failure("loop-host/session-unavailable", "The Session does not belong to a registered Workspace")
    let context = await this.sessionContextLocked({workspaceId: workspace.id, sessionId}, {forActions:true})
    if (this.actions?.checkWorkspaceBinding && (context.state === "inherited" || context.state === "blocked")) {
      const checkRoute = async () => {
        const target = await this.actions.checkWorkspaceBinding({workspaceId:workspace.id, accountPrincipal:this.accountPrincipal}, signal)
        if (!target || target.loopServiceBaseUrl !== this.serviceBaseUrl || target.loopWorkspaceId !== context.loopWorkspaceId ||
            target.agentId !== context.agent.id || target.projectId !== context.projectId ||
            (!context.projectId && target.defaultChannelId !== context.defaultChannelId)) {
          throw failure("loop-host/conflict", "Saved Workspace route cannot be verified")
        }
      }
      let routeError
      if (context.state === "inherited") {
        try { await checkRoute(); return {workspace, context} }
        catch (error) {
          if (error?.code !== "loop-host/conflict") throw error
          routeError = error
        }
      }
      const binding = await this.store.getBinding(this.accountPrincipal, workspace.id, workspace.path, this.serviceBaseUrl)
      if (this.actions.reconcileWorkspaceBinding && binding?.placementKind === "channel_session" && (routeError || binding.repairPending)) {
        const catalog = await this.localWorkspaceCatalog(true, signal)
        if (catalog.state !== "active") throw failure("loop-host/needs-auth", catalog.reason ?? "Loop authorization is required")
        if (await this.reconcileWorkspaceBinding(workspace, binding, catalog, signal, catalog.grantId)) {
          context = await this.sessionContextLocked({workspaceId: workspace.id, sessionId}, {forActions:true})
          if (context.state === "inherited") await checkRoute()
          return {workspace, context}
        }
      }
      if (routeError) throw routeError
    }
    if (context.state !== "unbound") return {workspace, context}
    const binding = await this.store.getBinding(this.accountPrincipal, workspace.id, workspace.path, this.serviceBaseUrl)
    if (binding !== null) return {workspace, context}
    const previous = await this.store.getBindingForWorkspace(this.accountPrincipal, workspace.id, workspace.path)
    const saved = await this.store.getSessionForWorkspaceAnyAccount(workspace.id, sessionId)
    if (previous !== null || saved !== null) {
      throw failure("loop-host/conflict", "This Session keeps its original Loop connection; restore that connection before continuing")
    }
    // Business actions use the live Host connection and server resource ACLs.
    // Only operations needing a conversation route prepare an upload mapping.
    if (this.actions?.checkWorkspaceBinding && await this.actions.checkWorkspaceBinding({
      workspaceId:workspace.id, accountPrincipal:this.accountPrincipal,
    }, signal)) {
      throw failure("loop-host/conflict", "The Host workspace mapping is missing. Refresh Workspace sync before using this Session")
    }
    if (!this.serviceBaseUrl || !this.loopWorkspaceId ||
        !this.actions?.projectSyncCatalog || !this.actions?.prepareProjectSync) {
      throw failure("loop-host/not-bound", context.reason)
    }
    const catalog = validateProjectSyncCatalog(await this.actions.projectSyncCatalog({
      accountPrincipal: this.accountPrincipal, background: true, localWorkspaces: true,
    }, signal), {
      accountPrincipal: this.accountPrincipal, serviceBaseUrl: this.serviceBaseUrl,
      loopWorkspaceId: this.loopWorkspaceId,
    })
    if (catalog.state !== "active") throw failure("loop-host/needs-auth", catalog.reason ?? "Loop workspace authorization is required")
    signal?.throwIfAborted()
    const result = await this.actions.prepareProjectSync({
      workspace: {workspaceId: workspace.id, path: workspace.path, displayTitle: workspace.title || workspace.id},
      accountPrincipal: this.accountPrincipal, agentId: catalog.agent.agentId, localWorkspace: true,
    }, signal)
    await this.store.putBinding(this.accountPrincipal, {
      workspaceId: workspace.id, workspacePath: workspace.path, workspaceTitle: workspace.title || workspace.id,
      target: result.binding, expectedRevision: null,
    })
    context = await this.sessionContextLocked({workspaceId: workspace.id, sessionId})
    return {workspace, context}
  }

  async withSessionContext(sessionId, signal, operation) {
    return await this.withConnectionLease(signal, async () => {
      const {workspace, context} = await this.ensureSessionContextLocked(sessionId, signal)
      if (context.state !== "inherited") throw failure("loop-host/conflict", context.reason)
      // Lease-scoped identity for internal consumers; not part of the public Session context.
      const channelMembers = async cursor => {
        const result = await this.actions.agentAction({
          workspaceId: workspace.id, sessionId, accountPrincipal: this.accountPrincipal,
          name: "channel.members", arguments: {channelId: context.defaultChannelId, limit: 100, ...(cursor ? {cursor} : {})},
        }, signal)
        if (result?.error || !result?.data?.data) {
          throw failure("loop-host/waiting-for-access", result?.error?.message || "Loop did not return the current channel's members")
        }
        return result.data.data
      }
      return await operation(context, [this.serviceBaseUrl, this.accountPrincipal, this.store.installationId], channelMembers)
    })
  }

  async agentCommandLocked(sessionId, command, signal, prepareDelegation) {
    await this.requireAccount()
    if (!this.canUseAgentActions()) {
      throw failure("loop-host/backend-unavailable", "Loop Agent actions are unavailable")
    }
    if (command.verb === "context") {
      const {context} = await this.ensureSessionContextLocked(sessionId, signal)
      if (context.state !== "inherited") throw failure("loop-host/conflict", context.reason)
      if (command.name || command.input) throw failure("loop-host/invalid-request", "Loop context accepts no arguments")
      return {failed: false, output: boundedJSON({
        projectId: context.projectId, defaultChannelId: context.defaultChannelId,
        agent: context.agent, loopWorkspaceId: context.loopWorkspaceId,
        binding: {source: "saved", resourceAccess: "not_checked"},
      })}
    }
    const {workspace, loopWorkspaceId} = await this.businessWorkspace(sessionId)
    const preparation = prepareDelegation ? {prepareDelegation:true,
      ...(command.verb === "call" ? {delegationArguments:JSON.parse(command.input)} : {})} : {}
    const permissionResult = ({error,delegation,delegationArguments,channelLabel}) => command.verb === "call"
      ? {failed:true,output:boundedJSON({error}),delegation,delegationArguments,channelLabel,agentDenied:error?.code!=="human_confirmation_required"}
      : {failed:false,output:boundedJSON({id:command.name,requiresHumanAuthorization:true,inputSchema:delegation.inputSchema,
          next:"For the user's requested operation, use loop-proxy call with these concrete arguments. The Host asks the user for approval in this conversation."})}
    if (command.verb === "actions") {
      const result = await this.actions.agentCatalog({
        workspaceId: workspace.id,
        sessionId,
        accountPrincipal: this.accountPrincipal,
        name: "",
        prefix: command.name, ...preparation,
      }, signal)
      if (result?.error) return {failed: true, output: boundedJSON(result)}
      if (!Array.isArray(result?.actions) || result.actions.some(name => typeof name !== "string")) {
        throw failure("loop-host/backend-invalid", "Loop Agent action catalog is invalid")
      }
      if (result.authorizationAvailable?.length) return {failed:false,output:boundedJSON({actions:result.actions,requiresHumanAuthorization:result.authorizationAvailable})}
      if (result.actions.length === 0) {
        if (/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u.test(command.name ?? "")) {
          const descriptor = await this.actions.agentSchema({
            workspaceId: workspace.id, sessionId, accountPrincipal: this.accountPrincipal, name: command.name, ...preparation,
          }, signal)
          if (descriptor?.delegation) return permissionResult(descriptor)
          return {failed: Boolean(descriptor?.error), output: boundedJSON(descriptor)}
        }
        return {failed: false, output: boundedJSON({actions: [],
          hint: "No authorized actions match this prefix. This does not prove an action is unsupported; use schema <exact-action-id> for its specific availability or authorization result."})}
      }
      return {failed: false, output: result.actions.join("\n")}
    }
    if (command.verb === "schema") {
      const result = await this.actions.agentSchema({
        workspaceId: workspace.id,
        sessionId,
        accountPrincipal: this.accountPrincipal,
        name: command.name, ...preparation,
      }, signal)
      if (result?.delegation) return permissionResult(result)
      if (!result?.error && result && !JSON.parse(command.input || "{}").includeOutput) {
        const {outputSchema, ...inputDescription} = result
        return {failed: false, output: boundedJSON({...inputDescription,
          outputSchemaHint: 'Output definition omitted. Load only if needed: loop-proxy schema ' + command.name + ' {"includeOutput":true}'})}
      }
      return {failed: Boolean(result?.error), output: boundedJSON(result)}
    }
    if (command.verb === "call") {
      const guard = this.feedbackGuard?.(sessionId)
      if (guard || command.implicitEmptyInput) {
        const schema = await this.actions.agentSchema({workspaceId: workspace.id, sessionId, accountPrincipal: this.accountPrincipal, name: command.name, ...preparation}, signal)
        if (command.implicitEmptyInput) {
          if (schema?.error && !schema.delegation) return {failed:true, output:boundedJSON({error:schema.error})}
          if (schema?.readOnly !== true || schema.inputSchema?.type !== "object" || schema.inputSchema.required?.length) {
            return {failed:true, output:boundedJSON({error:{code:"invalid_command", message:"This action requires explicit JSON arguments.", hint:"Read the action schema, then pass one JSON object.", dispatched:false}})}
          }
        }
        if (guard) await guard(sessionId, command, schema, signal)
        if (schema?.delegation) return permissionResult(schema)
      }
      const result = await this.actions.agentAction({
        workspaceId: workspace.id,
        sessionId,
        accountPrincipal: this.accountPrincipal,
        name: command.name,
        arguments: JSON.parse(command.input), ...preparation,
      }, signal)
      if (result?.delegation) return permissionResult(result)
      if (result === null || typeof result !== "object" || (!Object.hasOwn(result, "data") && !result.error)) {
        throw failure("loop-host/backend-invalid", "Loop Agent action result is invalid")
      }
      const args = JSON.parse(command.input)
      const data = result.data?.data
      const family = command.name === "project.list" ? "project" : command.name === "kb.list" ? "kb" : undefined
      const rows = family === "project" ? data?.projects : data?.knowledgeBases
      if (family && prepareDelegation && typeof args.name === "string" && args.name.trim() &&
          Array.isArray(rows) && rows.length === 0 && !data?.hasMore && !args.cursor) {
        return {failed:false,output:boundedJSON({...result,scope:"current_agent",next:{
          command:"loop-proxy pick "+family, description:"For a user-requested target, ask the user to choose one resource from their own Loop workspace. Only the chosen reference enters this conversation."
        }})}
      }
      const webUrl = !result.error && resultWebUrl(command.name, result.data?.data, this.serviceBaseUrl, loopWorkspaceId)
      return {
        failed: Boolean(result.error),
        output: boundedJSON(command.name === "message.history" && !result.error ? {...result,
          visibility:"Messages visible to this Agent only. Other participants may see additional messages, even when hasMore is false."}
          : webUrl ? {...result, webUrl} : result),
      }
    }
    throw failure("loop-host/invalid-request", "Loop Agent command is invalid")
  }
}

// Only typed receipts from the bound Loop server can identify a web resource.
function resultWebUrl(action, data, base, workspaceId) {
  if (!data || !/^ws_[a-z0-9_-]+$/iu.test(workspaceId ?? "")) return undefined
  const root = base + "/w/" + encodeURIComponent(workspaceId)
  if (["kb.doc-read", "kb.doc-create", "kb.doc-update"].includes(action) &&
      /^kb_[a-z0-9_-]+$/iu.test(data.kbId) && /^doc_[a-z0-9_-]+$/iu.test(data.documentId)) {
    return root + "/kb/" + data.kbId + "/documents/" + data.documentId
  }
  if (["dashboard.create", "dashboard.update", "dashboard.get"].includes(action) &&
      /^dsh_[a-z0-9_-]+$/iu.test(data.dashboard?.id)) {
    return root + "/dashboards/" + data.dashboard.id
  }
  if (action === "message.thread-create" && /^chn_[a-z0-9_-]+$/iu.test(data.threadChannelId)) {
    return root + "/inbox/thread/" + data.threadChannelId
  }
  if (["drive.head", "drive.upload", "drive.mv", "drive.cp"].includes(action) &&
      /^drv_[a-z0-9_-]+$/iu.test(data.node?.driveId) && /^obj_[a-z0-9_-]+$/iu.test(data.node?.id)) {
    return root + "/drives/" + data.node.driveId + "/files/" + data.node.id
  }
  if (["task.get", "task.create", "task.update"].includes(action)) {
    const task = data.detail?.task ?? data.task
    if (/^chn_[a-z0-9_-]+$/iu.test(task?.channelRef) && Number.isSafeInteger(task.taskNumber) && task.taskNumber > 0) {
      return root + "/inbox/tasks/" + task.channelRef + "/" + task.taskNumber
    }
  }
  return undefined
}

function validHostPageFragment(hash) {
  if (hash === "") return false
  const raw = hash.startsWith("#") ? hash.slice(1) : hash
  if (Buffer.byteLength(raw) > 16 * 1024) return false
  let params
  try {
    params = new URLSearchParams(raw)
  } catch {
    return false
  }
  const keys = [...params.keys()]
  if (keys.length !== 3 || new Set(keys).size !== 3 ||
      !["page_launch", "page_origin", "next"].every(key => params.getAll(key).length === 1)) {
    return false
  }
  const launch = params.get("page_launch") ?? ""
  const origin = params.get("page_origin") ?? ""
  const next = params.get("next") ?? ""
  if (launch === "" || Buffer.byteLength(launch) > 512 ||
      origin === "" || Buffer.byteLength(origin) > 2048 ||
      next === "" || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return false
  }
  try {
    normalizePageOrigin(origin)
  } catch {
    return false
  }
  return true
}

function projectSyncView(settings, projects, context) {
  let state = "ready"
  let reason = context.authorization === "authorized"
    ? settings.lastError || undefined
    : undefined
  if (!settings.enabled) {
    state = "off"
    reason = undefined
  } else if (context.serverUrl === null || context.loopWorkspaceId === null) {
    state = "needs_config"
    reason = "Select a Loop server and workspace"
  } else if (context.authorization !== "authorized") {
    state = "needs_auth"
    reason = context.authorizationReason ||
      "Loop Project sync authorization has not been verified"
  } else if (settings.lastError !== "" || projects.some(project =>
    project.state === "error" || project.state === "workspace_missing")) {
    state = "partial"
    reason ??= projects.find(project =>
      project.state === "error" || project.state === "workspace_missing")?.reason
  }
  return {
    enabled: settings.enabled,
    defaultRoot: settings.defaultRoot,
    serverUrl: context.serverUrl,
    loopWorkspaceId: context.loopWorkspaceId,
    state,
    ...(settings.lastSyncedAt === "" ? {} : {lastSyncedAt: settings.lastSyncedAt}),
    ...(reason === undefined || reason === "" ? {} : {reason}),
    projects,
  }
}

function validateProjectSyncCatalog(value, expected) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      !["active", "needs_auth"].includes(value.state)) {
    throw failure("loop-host/backend-invalid", "Loop Project catalog is invalid")
  }
  if (value.state === "needs_auth") {
    return {
      state: "needs_auth",
      ...(value.challenge === undefined
        ? {}
        : {challenge: validateProjectSyncChallenge(value.challenge)}),
      ...(typeof value.reason === "string" && value.reason !== ""
        ? {reason: value.reason.slice(0, 512)}
        : {}),
    }
  }
  if ((expected.accountPrincipal !== "" && value.accountPrincipal !== expected.accountPrincipal) ||
      typeof value.accountPrincipal !== "string" || value.accountPrincipal === "" ||
      value.workspaceId !== expected.loopWorkspaceId ||
      !Array.isArray(value.projects) || value.projects.length > MANAGED_PROJECT_LIMIT ||
      value.agent === null || typeof value.agent !== "object" ||
      typeof value.agent.agentId !== "string" || value.agent.agentId === "" ||
      typeof value.agent.displayName !== "string" || value.agent.displayName === "" ||
      typeof value.accountName !== "string" || value.accountName === "" ||
      typeof value.workspaceName !== "string" || value.workspaceName === "") {
    throw failure("loop-host/backend-invalid", "Loop Project catalog is invalid")
  }
  const seen = new Set()
  const projects = value.projects.map(project => {
    if (project === null || typeof project !== "object" || Array.isArray(project) ||
        typeof project.projectId !== "string" || project.projectId === "" ||
        typeof project.projectName !== "string" || project.projectName === "" ||
        project.workspaceId !== expected.loopWorkspaceId ||
        typeof project.role !== "string") {
      throw failure("loop-host/backend-invalid", "Loop Project metadata is invalid")
    }
    if (seen.has(project.projectId)) {
      throw failure("loop-host/backend-invalid", "Loop Project catalog contains duplicates")
    }
    seen.add(project.projectId)
    return {
      projectId: project.projectId,
      projectName: project.projectName,
      workspaceName: value.workspaceName,
      webUrl: `${expected.serviceBaseUrl}/w/` +
        `${encodeURIComponent(expected.loopWorkspaceId)}/projects/` +
        `${encodeURIComponent(project.projectId)}/tasks`,
    }
  })
  return {
    state: "active",
    ...(typeof value.grantId === "string" && value.grantId ? {grantId: value.grantId} : {}),
    accountPrincipal: value.accountPrincipal,
    accountName: value.accountName,
    workspaceName: value.workspaceName,
    agent: {
      agentId: value.agent.agentId,
      displayName: value.agent.displayName,
    },
    projects,
  }
}

function validateProjectSyncChallenge(value, allowFragment = false) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      typeof value.id !== "string" || value.id === "" ||
      typeof value.loginUrl !== "string" || typeof value.expiresAt !== "string") {
    throw failure("loop-host/backend-invalid", "Loop authorization challenge is invalid")
  }
  let url
  try {
    url = new URL(value.loginUrl)
  } catch {
    throw failure("loop-host/backend-invalid", "Loop authorization challenge is invalid")
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || (!allowFragment && url.hash)) {
    throw failure("loop-host/backend-invalid", "Loop authorization challenge is invalid")
  }
  if (value.recoveryMode !== undefined && (!allowFragment || value.recoveryMode !== "human_confirmed")) {
    throw failure("loop-host/backend-invalid", "Loop disconnect recovery mode is invalid")
  }
  return {id: value.id, loginUrl: url.href, expiresAt: value.expiresAt,
    ...(value.recoveryMode === undefined ? {} : {recoveryMode: value.recoveryMode})}
}

function boundedRuntimeError(error) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/\s+/gu, " ")
    .slice(0, 512)
}

function helperBinding(binding) {
  if (binding === null || typeof binding !== "object") return binding
  return {
    loopServiceBaseUrl: binding.loopServiceBaseUrl,
    loopWorkspaceId: binding.loopWorkspaceId,
    loopWorkspaceName: binding.loopWorkspaceName,
    ...(binding.placementKind === undefined ? {} : {placementKind: binding.placementKind}),
    projectId: binding.projectId,
    projectName: binding.projectName,
    defaultChannelId: binding.defaultChannelId,
    agentId: binding.agentId,
    agentName: binding.agentName,
    accountName: binding.accountName,
    webUrl: binding.webUrl,
  }
}

function syncContext(context) {
  return {
    projectId: context.projectId,
    defaultChannelId: context.defaultChannelId,
    agentId: context.agentId,
  }
}

function latestSourceSequence(session) {
  const nextSequence = Number(session?.seq)
  if (!Number.isSafeInteger(nextSequence) || nextSequence < 0) return undefined
  return Math.max(0, nextSequence - 1)
}

export {stateFor}

function validateProjectChoice(project) {
  if (project === null || typeof project !== "object" || Array.isArray(project)
    || typeof project.projectId !== "string" || project.projectId === ""
    || (project.defaultChannelId !== undefined && typeof project.defaultChannelId !== "string")
    || typeof project.projectName !== "string" || project.projectName === ""
    || typeof project.workspaceId !== "string" || project.workspaceId === ""
    || typeof project.workspaceName !== "string" || project.workspaceName === ""
    || typeof project.role !== "string") {
    throw failure("loop-host/backend-invalid", "Project choice is invalid")
  }
}

function validateProjectChoices(projects) {
  if (!Array.isArray(projects) || projects.length > 100) {
    throw failure("loop-host/backend-invalid", "Project choices are invalid")
  }
  for (const project of projects) validateProjectChoice(project)
  return projects
}

function validateAgentChoices(agents) {
  if (!Array.isArray(agents) || agents.length > 100) {
    throw failure("loop-host/backend-invalid", "Agent choices are invalid")
  }
  for (const agent of agents) {
    if (agent === null || typeof agent !== "object" || Array.isArray(agent)
      || typeof agent.agentId !== "string" || agent.agentId === ""
      || typeof agent.displayName !== "string" || agent.displayName === "") {
      throw failure("loop-host/backend-invalid", "Agent choices are invalid")
    }
  }
  return agents
}

function validateChallenge(challenge) {
  if (challenge === null || typeof challenge !== "object" || Array.isArray(challenge)
    || typeof challenge.id !== "string" || challenge.id === ""
    || typeof challenge.loginUrl !== "string" || typeof challenge.expiresAt !== "string") {
    throw failure("loop-host/backend-invalid", "Login challenge is invalid")
  }
  let url
  try {
    url = new URL(challenge.loginUrl)
  } catch {
    throw failure("loop-host/backend-invalid", "Login challenge URL is invalid")
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw failure("loop-host/backend-invalid", "Login challenge URL is invalid")
  }
  if (url.hash !== "") {
    const fragment = new URLSearchParams(url.hash.slice(1))
    const keys = [...fragment.keys()]
    if (!url.pathname.endsWith("/external-host/page-reauthorize") ||
        keys.some(key => !["challenge", "state", "locale"].includes(key)) ||
        new Set(keys).size !== keys.length ||
        !["challenge", "state"].every(key => fragment.get(key)) ||
        (keys.includes("locale") && fragment.get("locale") === "")) {
      throw failure("loop-host/backend-invalid", "Login challenge URL is invalid")
    }
  }
  return {id: challenge.id, loginUrl: url.href, expiresAt: challenge.expiresAt}
}

function validateSyncStatus(sync) {
  if (sync === null || typeof sync !== "object" || Array.isArray(sync)
    || !["off", "on", "pending", "retrying", "error", "needs_auth"].includes(sync.state)
    || !Number.isSafeInteger(sync.pending) || sync.pending < 0
    || typeof sync.historyPartial !== "boolean") {
    throw failure("loop-host/backend-invalid", "Host sync returned an invalid state")
  }
  if (sync.destination !== undefined) {
    if (sync.destination === null || typeof sync.destination !== "object"
      || typeof sync.destination.channelId !== "string" || sync.destination.channelId === ""
      || (sync.destination.topicId !== undefined && typeof sync.destination.topicId !== "string")
      || (sync.destination.webUrl !== undefined && typeof sync.destination.webUrl !== "string")) {
      throw failure("loop-host/backend-invalid", "Host sync returned an invalid destination")
    }
  }
  if (sync.lastReceipt !== undefined) {
    if (sync.lastReceipt === null || typeof sync.lastReceipt !== "object"
      || !Number.isSafeInteger(sync.lastReceipt.sourceSequence)
      || sync.lastReceipt.sourceSequence < 0
      || typeof sync.lastReceipt.acceptedAt !== "string") {
      throw failure("loop-host/backend-invalid", "Host sync returned an invalid receipt")
    }
  }
  if (sync.challenge !== undefined) {
    validateChallenge(sync.challenge)
  }
  return sync
}

function boundedJSON(value) {
  const encoded = JSON.stringify(value)
  if (typeof encoded !== "string" || Buffer.byteLength(encoded) > (2 << 20)) {
    throw failure("loop-host/backend-invalid", "Loop Agent action output is invalid or oversized")
  }
  return encoded
}
