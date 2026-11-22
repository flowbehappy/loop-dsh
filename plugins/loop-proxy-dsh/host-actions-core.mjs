import {createHash} from "node:crypto"
import {
  validateCloseModelSession,
  validateDisconnectModelConnection,
  validateModelSession,
  validateModelStatus,
  validateKnowledgeCatalog,
  validateSkillCatalog,
  validateSkillContent,
} from "./host-protocol.mjs"

const GLOBAL_PAGE_PROBE_TIMEOUT_MS = 5_000
export const LOOP_PRODUCT_ENTRY_PATH = "/workspaces"
const LOOP_WORKSPACE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u

function failure(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function absoluteHTTPURL(value, label) {
  const text = String(value ?? "").trim()
  let parsed
  try {
    parsed = new URL(text)
  } catch {
    throw new Error(`${label} must be an absolute URL`)
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password ||
      parsed.hash || parsed.search) {
    throw new Error(`${label} is invalid`)
  }
  if (parsed.protocol === "http:" &&
      !isLoopbackHostName(parsed.hostname)) {
    throw new Error(`${label} must use HTTPS or loopback HTTP`)
  }
  return parsed.href.replace(/\/+$/u, "")
}

export function normalizePageOrigin(value) {
  const text = String(value ?? "").trim()
  let parsed
  try {
    parsed = new URL(text)
  } catch {
    throw new Error("pageOrigin must be an absolute origin")
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("pageOrigin must not contain credentials, path, query, or fragment")
  }
  if (parsed.protocol === "dsh-app:") {
    if (parsed.host !== "app" || (parsed.pathname !== "" && parsed.pathname !== "/")) {
      throw new Error("Desktop pageOrigin is invalid")
    }
    return "dsh-app://app"
  }
  if (parsed.pathname !== "/") {
    throw new Error("pageOrigin must not contain credentials, path, query, or fragment")
  }
  if (parsed.protocol !== "https:" &&
      !(parsed.protocol === "http:" && isLoopbackHostName(parsed.hostname))) {
    throw new Error("pageOrigin must use HTTPS, loopback HTTP, or dsh-app://app")
  }
  return parsed.origin
}

function isLoopbackHostName(hostname) {
  return ["127.0.0.1", "localhost", "[::1]", "::1"].includes(hostname) ||
    hostname.endsWith(".localhost")
}

/** Validate the configured Loop service URL used by Host-owned page links. */
export function normalizeServiceBaseURL(value) {
  if (String(value ?? "").trim() === "") return ""
  return absoluteHTTPURL(value, "serviceBaseUrl")
}

function syncProfileForServer(baseProfile, defaultServiceBaseUrl, serviceBaseUrl) {
  const base = String(baseProfile ?? "").trim()
  if (base === "" || String(serviceBaseUrl ?? "").trim() === "") return base
  const defaultServer = normalizeServiceBaseURL(defaultServiceBaseUrl)
  const server = normalizeServiceBaseURL(serviceBaseUrl)
  if (defaultServer !== "" && server === defaultServer) return base
  const suffix = createHash("sha256").update(server).digest("hex").slice(0, 16)
  return `${base.slice(0, 47)}-${suffix}`
}

function helperConfigForServer(config, serviceBaseUrl, loopWorkspaceId = config.loopWorkspaceId) {
  return {
    ...config,
    serviceBaseUrl,
    loopWorkspaceId,
    syncProfile: syncProfileForServer(config.syncProfile, config.serviceBaseUrl, serviceBaseUrl),
  }
}

function bounded(error) {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/gu, " ").slice(0, 512)
}

/** Production adapter attached to `loopHostService.setActions(...)`. */
export function createLoopHostActions(config, options = {}) {
  const baseConfig = config
  const createHelper = options.createHelper
  if (typeof createHelper !== "function") throw new Error("A native Loop Host adapter is required")
  let helper = createHelper(helperConfigForServer(baseConfig, baseConfig.serviceBaseUrl ?? ""), options)
  const collaborationEventListeners = new Set()
  const skillCatalogEventListeners = new Set()
  const attachCollaborationEvents = target => target.addEventListener(message => {
    for (const listener of [...collaborationEventListeners]) {
      try {
        listener(message)
      } catch {}
    }
  })
  let detachCollaborationEvents = attachCollaborationEvents(helper)
  let detachSkillCatalogEvents = helper.addSkillCatalogEventListener(message => {
    for (const listener of [...skillCatalogEventListeners]) {
      try {
        listener(message)
      } catch {}
    }
  })
  let serviceBaseUrl = helper.config.serviceBaseUrl
  let loopWorkspaceId = helper.config.loopWorkspaceId
  const fetchImpl = options.fetch ?? globalThis.fetch
  let accountPrincipal = helper.accountPrincipal
  let notify = options.onAccountPrincipal
  helper.accountPrincipal = accountPrincipal
  const onAccountPrincipal = async principal => {
    await notify?.(principal)
    accountPrincipal = principal
  }
  helper.onAccountPrincipal = onAccountPrincipal
  const call = (action, input, signal) => helper.request(action, input, signal)

  const probeGlobalPageURL = async (url, signal) => {
    const base = normalizeServiceBaseURL(url)
    if (base === "") throw failure("loop-host/invalid-request", "Loop service URL is required")
    const basePath = new URL(base).pathname.replace(/\/+$/u, "")
    const fragment = new URLSearchParams({next: `${basePath}${LOOP_PRODUCT_ENTRY_PATH}`})
    const probeSignal = AbortSignal.timeout(GLOBAL_PAGE_PROBE_TIMEOUT_MS)
    const requestSignal = signal === undefined
      ? probeSignal
      : AbortSignal.any([signal, probeSignal])
    let response
    try {
      response = await fetchImpl(
        new URL("api/v1/public/config", base + "/"),
        {method: "GET", redirect: "error", signal: requestSignal},
      )
    } catch (error) {
      if (signal?.aborted) throw failure("loop-host/cancelled", "Loop Host request was cancelled")
      throw failure("loop-host/backend-unavailable", `Loop service is unavailable: ${bounded(error)}`)
    }
    await response.body?.cancel().catch(() => {})
    if (!response.ok) throw failure("loop-host/backend-unavailable", "Loop service is unavailable")
    return {url: new URL(base + "/external-host/page-login#" + fragment).href}
  }

  return Object.freeze({
    currentAccountPrincipal() {
      return accountPrincipal
    },
    setAccountPrincipal(principal) {
      const next = String(principal ?? "")
      accountPrincipal = next
      helper.accountPrincipal = next
    },
    setAccountListener(listener) {
      notify = listener
    },
    addCollaborationEventListener(listener) {
      collaborationEventListeners.add(listener)
      return () => { collaborationEventListeners.delete(listener) }
    },
    addSkillCatalogEventListener(listener) {
      skillCatalogEventListeners.add(listener)
      return () => { skillCatalogEventListeners.delete(listener) }
    },
    globalPageServiceBaseUrl() {
      return serviceBaseUrl
    },
    currentSyncProfile() {
      return helper.config.syncProfile
    },
    createSyncWriter(config, onStatus = () => {}) {
      const owners = new Map()
      let activeProfile = config.profile
      const current = () => {
        if (typeof helper.createSyncWriter !== "function") throw failure("loop-host/unsupported", "Native sync writer is unavailable")
        let writer = owners.get(helper)
        if (!writer) {
          writer = helper.createSyncWriter({...config, profile: helper.config.syncProfile}, onStatus)
          owners.set(helper, writer)
        }
        return writer
      }
      return {
        get totalQueued() { return [...owners.values()].reduce((total, writer) => total + writer.totalQueued, 0) },
        enqueue(session, event, profile = activeProfile, context = null) {
          if (profile !== helper.config.syncProfile) throw failure("loop-host/conflict", "Sync server changed before capture")
          current().enqueue(session, event, profile, context)
        },
        start() { current().start() },
        flushHint() { for (const writer of owners.values()) writer.flushHint() },
        setActiveProfile(profile) { activeProfile = profile; if (profile === helper.config.syncProfile) current().setActiveProfile(profile) },
        async fenceSessions(sessions) { await Promise.all([...owners.values()].map(writer => writer.fenceSessions(sessions))) },
        async shutdown() { await Promise.all([...owners.values()].map(writer => writer.shutdown())); owners.clear() },
      }
    },
    currentLoopWorkspaceId() {
      return loopWorkspaceId
    },
    async probeGlobalPage(url, signal) {
      return await probeGlobalPageURL(url, signal)
    },
    async setServiceBaseUrl(url, workspaceId = undefined) {
      const normalized = normalizeServiceBaseURL(url)
      if (normalized === "") throw failure("loop-host/invalid-request", "Loop service URL is required")
      const nextWorkspaceId = workspaceId === undefined
        ? loopWorkspaceId
        : String(workspaceId ?? "").trim()
      if (nextWorkspaceId !== "" && !LOOP_WORKSPACE_ID.test(nextWorkspaceId)) {
        throw failure("loop-host/invalid-request", "Loop workspace id is invalid")
      }
      if (normalized === serviceBaseUrl && nextWorkspaceId === loopWorkspaceId) return
      const previous = helper
      detachCollaborationEvents()
      detachSkillCatalogEvents()
      helper = createHelper(helperConfigForServer(baseConfig, normalized, nextWorkspaceId), options)
      detachCollaborationEvents = attachCollaborationEvents(helper)
      detachSkillCatalogEvents = helper.addSkillCatalogEventListener(message => {
        for (const listener of [...skillCatalogEventListeners]) {
          try {
            listener(message)
          } catch {}
        }
      })
      serviceBaseUrl = normalized
      loopWorkspaceId = nextWorkspaceId
      accountPrincipal = ""
      helper.accountPrincipal = ""
      helper.onAccountPrincipal = onAccountPrincipal
      await previous.dispose()
    },
    globalPage(_input, signal) {
      return call("openGlobalPage", {}, signal)
    },
    accountStatus(_input, signal) {
      return call("accountStatus", {}, signal)
    },
    worksiteStart(input, signal) {
      return call("worksiteStart", input, signal)
    },
    worksiteStop(input = {}, signal) {
      return call("worksiteStop", input, signal)
    },
    worksiteStatus(input = {}, signal) {
      return call("worksiteStatus", input, signal)
    },
    status(input, signal) {
      return call("status", input, signal)
    },
    connectAccount(input, signal) {
      return call("connectAccount", input, signal)
    },
    beginBind(input, signal) {
      return call("beginBind", input, signal)
    },
    completeBind(input, signal) {
      return call("completeBind", input, signal)
    },
    disconnectAccount(input, signal) {
      return call("disconnectAccount", input, signal)
    },
    unbind(input, signal) {
      return call("unbind", input, signal)
    },
    createProject(input, signal) {
      return call("createProject", input, signal)
    },
    openLoopPage(input, signal) {
      return call("openLoopPage", input, signal)
    },
    openGlobalPage(input = {}, signal) {
      return call("openGlobalPage", input, signal)
    },
    syncStatus(input, signal) {
      return call("syncStatus", input, signal)
    },
    setSync(input, signal) {
      return call("setSync", input, signal)
    },
    retrySync(input, signal) {
      return call("retrySync", input, signal)
    },
    projectSyncCatalog(input = {}, signal) {
      return call("projectSyncCatalog", input, signal)
    },
    ...(options.nativeWorkspaceReconciliation === true ? {
      checkWorkspaceBinding(input, signal) { return call("checkWorkspaceBinding", input, signal) },
      reconcileWorkspaceBinding(input, signal) {
        return call("reconcileWorkspaceBinding", input, signal)
      },
    } : {}),
    prepareProjectSync(input, signal) {
      return call("prepareProjectSync", input, signal)
    },
    refreshProjectSyncMetadata(input, signal) {
      return call("refreshProjectSyncMetadata", input, signal)
    },
    agentAction(input, signal) {
      return call("agentAction", input, signal)
    },
    agentCatalog(input, signal) {
      return call("agentCatalog", input, signal)
    },
    agentSchema(input, signal) {
      return call("agentSchema", input, signal)
    },
    humanStatus(input, signal) {
      return call("humanStatus", input, signal)
    },
    beginHumanLogin(input, signal) {
      return call("beginHumanLogin", input, signal)
    },
    completeHumanLogin(input, signal) {
      return call("completeHumanLogin", input, signal)
    },
    cancelHumanLogin(input, signal) {
      return call("cancelHumanLogin", input, signal)
    },
    disconnectHuman(input, signal) {
      return call("disconnectHuman", input, signal)
    },
    humanCatalog(input, signal) {
      return call("humanCatalog", input, signal)
    },
    humanSchema(input, signal) {
      return call("humanSchema", input, signal)
    },
    humanAction(input, signal) {
      return call("humanAction", input, signal)
    },
    collaborationStatus(input, signal) {
      return call("collaborationStatus", input, signal)
    },
    collaborationReconcile(input, signal) {
      return call("collaborationReconcile", input, signal)
    },
    collaborationBoards(input, signal) {
      return call("collaborationBoards", input, signal)
    },
    collaborationBind(input, signal) {
      return call("collaborationBind", input, signal)
    },
    collaborationDirectory(input, signal) {
      return call("collaborationDirectory", input, signal)
    },
    knowledgeCatalog(input, signal) {
      return call("knowledgeCatalog", validateKnowledgeCatalog(input), signal)
    },
    skillCatalog(input, signal) {
      return call("skillCatalog", validateSkillCatalog(input), signal)
    },
    skillContent(input, signal) {
      return call("skillContent", validateSkillContent(input), signal)
    },
    skillCatalogWatch(input = {}, signal) {
      return call("skillCatalogWatch", input, signal)
    },
    collaborationPrepareIntent(input, signal) {
      return call("collaborationPrepareIntent", input, signal)
    },
    collaborationBindIntent(input, signal) {
      return call("collaborationBindIntent", input, signal)
    },
    collaborationContinuation(input, signal) {
      return call("collaborationContinuation", input, signal)
    },
    collaborationBindings(input, signal) {
      return call("collaborationBindings", input, signal)
    },
    collaborationActivateIntent(input, signal) {
      return call("collaborationActivateIntent", input, signal)
    },
    collaborationAction(input, signal) {
      return call("collaborationAction", input, signal)
    },
    collaborationCancel(input, signal) {
      return call("collaborationCancel", input, signal)
    },
    collaborationAccept(input, signal) {
      return call("collaborationAccept", input, signal)
    },
    collaborationAuthorize(input, signal) {
      return call("collaborationAuthorize", input, signal)
    },
    collaborationWaitStatus(input, signal) {
      return call("collaborationWaitStatus", input, signal)
    },
    collaborationWatch(input, signal) {
      return call("collaborationWatch", input, signal)
    },
    modelStatus(input = {}, signal) {
      return call("modelStatus", validateModelStatus(input), signal)
    },
    refreshModelConnections(input = {}, signal) {
      return call("refreshModelConnections", validateModelStatus(input), signal)
    },
    disconnectModelConnection(input, signal) {
      return call("disconnectModelConnection", validateDisconnectModelConnection(input), signal)
    },
    modelRuntimeCatalog(input = {}, signal) {
      return call("modelRuntimeCatalog", validateModelStatus(input), signal)
    },
    ensureModelSession(input, signal) {
      return call("ensureModelSession", validateModelSession(input), signal)
    },
    closeModelHostSession(input, signal) {
      return call("closeModelHostSession", validateCloseModelSession(input), signal)
    },
    closeAllModelSessions(input = {}, signal) {
      return call("closeAllModelSessions", validateModelStatus(input), signal)
    },
    dispose() {
      return helper.dispose()
    },
  })
}
