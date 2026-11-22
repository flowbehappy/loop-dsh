import {checkWindowsPath} from "./private-path.mjs"
import {createHash, randomUUID} from "node:crypto"
import {
  chmod,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  unlink,
} from "node:fs/promises"
import {homedir} from "node:os"
import {dirname, isAbsolute, join, resolve} from "node:path"

const STATE_VERSION = 1
const MAX_STATE_BYTES = 256 << 10
const PROJECT_SYNC_VERSION = 1
const MAX_PROJECT_SYNC_BYTES = 1 << 20
const MAX_PROJECT_SYNC_PROJECTS = 200
const LEASE_WAIT_MS = 60_000
const LEASE_STALE_MS = 2 * 60_000
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/
const ACCOUNT = /^[\x21-\x7e]{1,512}$/
const REVISION = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/

function invalid(message) {
  const error = new Error(message)
  error.code = "loop-host/invalid-request"
  return error
}

function assertID(value, label) {
  if (typeof value !== "string" || !ID.test(value)) throw invalid(`${label} is invalid`)
  return value
}

function assertAccount(value) {
  if (typeof value !== "string" || !ACCOUNT.test(value)) throw invalid("account principal is invalid")
  return value
}

function assertRevision(value) {
  if (typeof value !== "string" || !REVISION.test(value)) throw invalid("binding revision is invalid")
  return value
}

function assertAbsolutePath(value) {
  if (typeof value !== "string" || !isAbsolute(value) || value.includes("\0")) {
    throw invalid("workspace path must be absolute")
  }
  return resolve(value)
}

function publicBinding(record, defaultServiceBaseUrl = "") {
  if (record === undefined) return null
  return structuredClone({
    workspaceId: record.workspaceId,
    workspacePath: record.workspacePath,
    workspaceTitle: record.workspaceTitle,
    revision: record.revision,
    loopServiceBaseUrl: resolvedBindingServer(record, defaultServiceBaseUrl),
    loopWorkspaceId: record.loopWorkspaceId,
    loopWorkspaceName: record.loopWorkspaceName,
    placementKind: record.placementKind,
    projectId: record.projectId,
    projectName: record.projectName,
    defaultChannelId: record.projectId ? "" : record.defaultChannelId,
    agentId: record.agentId,
    agentName: record.agentName,
    accountName: record.accountName,
    webUrl: record.webUrl,
    boundAt: record.boundAt,
    updatedAt: record.updatedAt,
    unbinding: record.unbinding === true,
    ...(record.repairPending === true ? {repairPending: true} : {}),
  })
}

function publicSession(record, serviceBaseUrl) {
  if (record === undefined) return null
  return structuredClone({
    ...record,
    ...(record.legacyBinding?.projectId && record.legacyBinding.defaultChannelId
      ? {legacyBinding: {...record.legacyBinding, defaultChannelId: ""}}
      : {}),
    // Old project-default records described an inherited destination. Only a
    // per-Session opt-in can retain that destination for an existing upload.
    ...(record.projectId && record.syncPreference !== "on"
      ? {defaultChannelId: "", syncEnabled: false, syncPreference: "off"}
      : {}),
    ...(serviceBaseUrl === "" ? {} : {loopServiceBaseUrl: serviceBaseUrl}),
  })
}

function managedProjectKey(record) {
  return projectSyncKey(record.serverUrl, record.loopWorkspaceId, record.projectId)
}

function publicManagedProject(record) {
  return structuredClone({
    projectId: record.projectId,
    projectName: record.projectName,
    agentId: record.agentId,
    ...(record.workspaceId === "" ? {} : {workspaceId: record.workspaceId}),
    workspacePath: record.workspacePath,
    workspaceTitle: record.workspaceTitle,
    ...(record.bindingRevision === "" ? {} : {bindingRevision: record.bindingRevision}),
    state: record.state,
    ...(record.reason === "" ? {} : {reason: record.reason}),
    updatedAt: record.updatedAt,
  })
}

function serviceBaseURL(value, label = "Loop service URL") {
  if (value === undefined || value === null || value === "") return ""
  if (typeof value !== "string" || value.length > 2048) throw invalid(`${label} is invalid`)
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw invalid(`${label} is invalid`)
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password ||
      parsed.search || parsed.hash ||
      (parsed.protocol === "http:" &&
        !["127.0.0.1", "localhost", "[::1]", "::1"].includes(parsed.hostname) &&
        !parsed.hostname.endsWith(".localhost"))) {
    throw invalid(`${label} is invalid`)
  }
  return parsed.href.replace(/\/+$/u, "")
}

function bindingKey(workspaceId, serviceBaseUrl) {
  return `${serviceBaseUrl}\u0000${workspaceId}`
}

function scopedStateName(prefix, serviceBaseUrl) {
  if (serviceBaseUrl === "") return `${prefix}.json`
  const digest = createHash("sha256").update(serviceBaseUrl).digest("hex")
  return `${prefix}-${digest}.json`
}

function serverWorkspaceStateName(serviceBaseUrl) {
  const digest = createHash("sha256").update(serviceBaseUrl).digest("hex")
  return `loop-workspace-${digest}.json`
}

function projectSyncSettingsName(serviceBaseUrl) {
  const digest = createHash("sha256").update(serviceBaseUrl).digest("hex")
  return `project-sync-settings-${digest}.json`
}

function projectCatalogName(accountPrincipal) {
  const digest = createHash("sha256").update(accountPrincipal).digest("hex")
  return `project-sync-${digest}.json`
}

function projectSyncKey(serviceBaseUrl, loopWorkspaceId, projectId) {
  return JSON.stringify([serviceBaseUrl, loopWorkspaceId, projectId])
}

function hasExplicitServiceBaseUrl(value) {
  return value !== undefined && value !== null && value !== ""
}

function exactServiceBaseUrl(value) {
  if (!hasExplicitServiceBaseUrl(value)) return ""
  try {
    return serviceBaseURL(value)
  } catch {
    return ""
  }
}

function resolvedBindingServer(binding, defaultServiceBaseUrl) {
  if (hasExplicitServiceBaseUrl(binding?.loopServiceBaseUrl)) {
    return exactServiceBaseUrl(binding.loopServiceBaseUrl)
  }
  return defaultServiceBaseUrl
}

function matchingSessionServers(state, session, defaultServiceBaseUrl) {
  const servers = new Set()
  for (const binding of Object.values(state.bindings)) {
    if (binding.workspaceId !== session?.workspaceId ||
        binding.workspacePath !== session?.workspacePath ||
        binding.revision !== session?.bindingRevision ||
        (session.projectId !== undefined && binding.projectId !== session.projectId) ||
        (session.defaultChannelId !== undefined &&
          binding.defaultChannelId !== session.defaultChannelId)) {
      continue
    }
    const server = resolvedBindingServer(binding, defaultServiceBaseUrl)
    if (server !== "") servers.add(server)
  }
  return servers
}

function resolvedSessionServer(state, session, defaultServiceBaseUrl) {
  if (hasExplicitServiceBaseUrl(session?.loopServiceBaseUrl)) {
    return exactServiceBaseUrl(session.loopServiceBaseUrl)
  }
  const servers = matchingSessionServers(state, session, defaultServiceBaseUrl)
  return servers.size === 1 ? [...servers][0] : ""
}

function sessionMatchesBindingRemoval(
  state,
  session,
  targetServiceBaseUrl,
  defaultServiceBaseUrl,
) {
  if (hasExplicitServiceBaseUrl(session?.loopServiceBaseUrl)) {
    const explicit = exactServiceBaseUrl(session.loopServiceBaseUrl)
    if (explicit !== "") return explicit === targetServiceBaseUrl
  }
  const servers = matchingSessionServers(state, session, defaultServiceBaseUrl)
  return servers.size > 0 && servers.has(targetServiceBaseUrl)
}

function locateBinding(bindings, workspaceId, serviceBaseUrl, defaultServiceBaseUrl) {
  if (serviceBaseUrl !== undefined) {
    const matched = Object.entries(bindings)
      .find(([, binding]) => binding.workspaceId === workspaceId &&
        resolvedBindingServer(binding, defaultServiceBaseUrl) === serviceBaseUrl)
    if (matched !== undefined) return {key: matched[0], binding: matched[1]}
    return undefined
  }
  if (bindings[workspaceId] !== undefined) return {key: workspaceId, binding: bindings[workspaceId]}
  const matched = Object.entries(bindings).find(([, binding]) => binding.workspaceId === workspaceId)
  return matched === undefined ? undefined : {key: matched[0], binding: matched[1]}
}

/**
 * Durable Host-side Workspace and Session mapping. The store contains routing
 * metadata only; credentials and OAuth state never enter this file.
 */
export class BindingStore {
  /**
   * @param {object} options
   * @param {string} options.root Dedicated Host mapping root.
   * @param {string} [options.installationId] Stable DSH installation identity.
   * @param {() => Date} [options.now]
   * @param {() => string} [options.randomID]
   */
  constructor(options) {
    if (!options || typeof options.root !== "string" || !isAbsolute(options.root)) {
      throw new TypeError("binding store root must be absolute")
    }
    this.root = resolve(options.root)
    this.installationId = options.installationId === undefined
      ? ""
      : assertID(options.installationId, "host installation id")
    this.defaultServiceBaseUrl = serviceBaseURL(options.defaultServiceBaseUrl, "default Loop service URL")
    this.defaultProjectRoot = assertAbsolutePath(
      options.defaultProjectRoot ?? join(homedir(), "Documents", "Loop Projects"),
    )
    this.now = options.now ?? (() => new Date())
    this.randomID = options.randomID ?? randomUUID
    this.initialized = null
    this.writeTail = Promise.resolve()
  }

  async init() {
    this.initialized ??= this.initialize()
    return await this.initialized
  }

  async getSyncPreferences() {
    await this.init()
    try {
      const raw = await readFile(join(this.root, "sync-preferences.json"))
      if (raw.byteLength > 4096) throw new Error("Sync preferences are oversized")
      const value = JSON.parse(raw.toString("utf8"))
      if (value.version !== 1 || typeof value.uploadDisconnectedHistory !== "boolean") {
        throw new Error("Sync preferences are invalid")
      }
      return {uploadDisconnectedHistory: value.uploadDisconnectedHistory}
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
      return {uploadDisconnectedHistory: false}
    }
  }

  async setSyncPreferences(value) {
    if (typeof value?.uploadDisconnectedHistory !== "boolean" ||
        Object.keys(value).some(key => key !== "uploadDisconnectedHistory")) {
      throw invalid("Sync preferences are invalid")
    }
    await this.init()
    const next = {uploadDisconnectedHistory: value.uploadDisconnectedHistory}
    await this.serialize(() => this.atomicWrite(join(this.root, "sync-preferences.json"),
      Buffer.from(`${JSON.stringify({version: 1, ...next})}\n`)))
    return next
  }

  async getGlobalServer() {
    const state = await this.getGlobalServerState()
    return state.serverUrl
  }

  async getGlobalServerState() {
    await this.init()
    try {
      const raw = await readFile(join(this.root, "global-server.json"))
      if (raw.byteLength > 4096) throw new Error("global Loop server record is oversized")
      const record = JSON.parse(raw.toString("utf8"))
      if (record?.version !== 1) throw new Error("global Loop server record is invalid")
      const serverUrl = serviceBaseURL(record.serverUrl) || null
      if (serverUrl === null) throw new Error("global Loop server record is invalid")
      if (record.serverRevision !== undefined) {
        return {serverUrl, serverRevision: assertRevision(record.serverRevision)}
      }
      return await this.serialize(async () => {
        const current = JSON.parse((await readFile(join(this.root, "global-server.json"))).toString("utf8"))
        if (current?.version === 1 && current.serverRevision !== undefined) {
          return {
            serverUrl: serviceBaseURL(current.serverUrl) || null,
            serverRevision: assertRevision(current.serverRevision),
          }
        }
        return await this.writeGlobalServerState(serverUrl, this.randomID())
      })
    } catch (error) {
      if (error?.code === "ENOENT" && this.defaultServiceBaseUrl !== "") {
        return await this.serialize(() => this.writeGlobalServerState(
          this.defaultServiceBaseUrl, this.randomID(),
        ))
      }
      if (error?.code === "ENOENT") return {serverUrl: null, serverRevision: ""}
      throw error
    }
  }

  async setGlobalServer(serverUrl) {
    await this.init()
    const normalized = serviceBaseURL(serverUrl)
    if (normalized === "") throw invalid("Loop service URL is invalid")
    return await this.serialize(async () => {
      const current = await this.readGlobalServerState()
      const revision = current.serverUrl === normalized && current.serverRevision !== ""
        ? current.serverRevision
        : this.randomID()
      return await this.writeGlobalServerState(normalized, revision)
    })
  }

  async restoreGlobalServerState(state) {
    await this.init()
    if (state?.serverUrl === null) {
      await this.clearGlobalServer()
      return {serverUrl: null, serverRevision: ""}
    }
    return await this.serialize(() => this.writeGlobalServerState(
      serviceBaseURL(state?.serverUrl),
      assertRevision(state?.serverRevision),
    ))
  }

  async clearGlobalServer() {
    await this.init()
    await this.serialize(() => unlink(join(this.root, "global-server.json")).catch(error => {
      if (error?.code !== "ENOENT") throw error
    }))
  }

  async readGlobalServerState() {
    try {
      const raw = await readFile(join(this.root, "global-server.json"))
      if (raw.byteLength > 4096) throw new Error("global Loop server record is oversized")
      const record = JSON.parse(raw.toString("utf8"))
      if (record?.version !== 1) throw new Error("global Loop server record is invalid")
      return {
        serverUrl: serviceBaseURL(record.serverUrl) || null,
        serverRevision: record.serverRevision === undefined
          ? ""
          : assertRevision(record.serverRevision),
      }
    } catch (error) {
      if (error?.code === "ENOENT") {
        return {
          serverUrl: this.defaultServiceBaseUrl || null,
          serverRevision: "",
        }
      }
      throw error
    }
  }

  async writeGlobalServerState(serverUrl, serverRevision) {
    const normalized = serviceBaseURL(serverUrl)
    if (normalized === "") throw invalid("Loop service URL is invalid")
    const revision = assertRevision(serverRevision)
    await this.atomicWrite(
      join(this.root, "global-server.json"),
      Buffer.from(`${JSON.stringify({
        version: 1,
        serverUrl: normalized,
        serverRevision: revision,
      })}\n`),
    )
    return {serverUrl: normalized, serverRevision: revision}
  }

  async getLoopWorkspaceForServer(accountPrincipal, serviceBaseUrl) {
    await this.init()
    const service = serviceBaseURL(serviceBaseUrl)
    if (service === "") return null
    const path = join(this.root, serverWorkspaceStateName(service))
    try {
      const raw = await readFile(path)
      if (raw.byteLength > 4096) throw new Error("Loop workspace selection is oversized")
      const record = JSON.parse(raw.toString("utf8"))
      if (record?.version !== 1 || record.serverUrl !== service) {
        throw new Error("Loop workspace selection is invalid")
      }
      return assertID(record.loopWorkspaceId, "Loop workspace id")
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
    }
    if (accountPrincipal === undefined || accountPrincipal === "") return null
    const state = await this.readAccount(accountPrincipal)
    const candidates = new Set()
    for (const binding of Object.values(state.bindings)) {
      if (resolvedBindingServer(binding, this.defaultServiceBaseUrl) !== service) continue
      const workspaceID = exactStringID(binding.loopWorkspaceId)
      if (workspaceID !== "") candidates.add(workspaceID)
    }
    if (candidates.size !== 1) return null
    const workspaceID = [...candidates][0]
    await this.setLoopWorkspaceForServer(service, workspaceID)
    return workspaceID
  }

  async setLoopWorkspaceForServer(serviceBaseUrl, loopWorkspaceId) {
    await this.init()
    const service = serviceBaseURL(serviceBaseUrl)
    const workspaceID = assertID(loopWorkspaceId, "Loop workspace id")
    if (service === "") throw invalid("Loop service URL is invalid")
    await this.serialize(() => this.atomicWrite(
      join(this.root, serverWorkspaceStateName(service)),
      Buffer.from(`${JSON.stringify({
        version: 1,
        serverUrl: service,
        loopWorkspaceId: workspaceID,
      })}\n`),
    ))
    return workspaceID
  }

  async getProjectSyncSettings(serviceBaseUrl) {
    await this.init()
    const service = serviceBaseURL(serviceBaseUrl)
    if (service === "") throw invalid("Loop service URL is invalid")
    try {
      const raw = await readFile(join(this.root, projectSyncSettingsName(service)))
      if (raw.byteLength > 16 << 10) throw new Error("Project sync settings are oversized")
      const record = JSON.parse(raw.toString("utf8"))
      if (record?.version !== PROJECT_SYNC_VERSION || record.serverUrl !== service) {
        throw new Error("Project sync settings are invalid")
      }
      return {
        enabled: record.enabled === true,
        defaultRoot: assertAbsolutePath(record.defaultRoot),
        lastSyncedAt: typeof record.lastSyncedAt === "string" ? record.lastSyncedAt : "",
        lastError: typeof record.lastError === "string" ? record.lastError : "",
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
      return {enabled: true, defaultRoot: this.defaultProjectRoot, lastSyncedAt: "", lastError: ""}
    }
  }

  defaultProjectSyncRoot() {
    return this.defaultProjectRoot
  }

  async setProjectSyncSettings(serviceBaseUrl, input) {
    await this.init()
    const service = serviceBaseURL(serviceBaseUrl)
    if (service === "") throw invalid("Loop service URL is invalid")
    if (input === null || typeof input !== "object" || Array.isArray(input)) {
      throw invalid("Project sync settings are invalid")
    }
    const allowed = new Set(["enabled", "defaultRoot", "lastSyncedAt", "lastError"])
    if (Object.keys(input).some(key => !allowed.has(key))) {
      throw invalid("Project sync settings have an unknown field")
    }
    if (input.enabled !== undefined && typeof input.enabled !== "boolean") {
      throw invalid("Project sync enabled must be boolean")
    }
    return await this.serialize(async () => {
      const current = await this.getProjectSyncSettings(service)
      const next = {
        enabled: input.enabled ?? current.enabled,
        defaultRoot: input.defaultRoot === undefined
          ? current.defaultRoot
          : assertAbsolutePath(input.defaultRoot),
        lastSyncedAt: input.lastSyncedAt === undefined
          ? current.lastSyncedAt
          : typeof input.lastSyncedAt === "string"
          ? input.lastSyncedAt
          : (() => { throw invalid("Project sync timestamp is invalid") })(),
        lastError: input.lastError === undefined
          ? current.lastError
          : typeof input.lastError === "string" && Buffer.byteLength(input.lastError) <= 512
          ? input.lastError
          : (() => { throw invalid("Project sync error is invalid") })(),
      }
      if (next.defaultRoot === "/" || next.defaultRoot.includes("\0")) {
        throw invalid("Project sync root is invalid")
      }
      await this.atomicWrite(
        join(this.root, projectSyncSettingsName(service)),
        Buffer.from(`${JSON.stringify({
          version: PROJECT_SYNC_VERSION,
          serverUrl: service,
          ...next,
        })}\n`),
      )
      return next
    })
  }

  async listManagedProjects(accountPrincipal, serviceBaseUrl, loopWorkspaceId) {
    await this.init()
    const state = await this.readProjectCatalog(accountPrincipal)
    const service = serviceBaseURL(serviceBaseUrl)
    const loopWorkspace = assertID(loopWorkspaceId, "Loop workspace id")
    return state.projects
      .filter(project => project.serverUrl === service && project.loopWorkspaceId === loopWorkspace)
      .sort((left, right) => left.projectName.localeCompare(right.projectName) ||
        left.projectId.localeCompare(right.projectId))
      .map(publicManagedProject)
  }

  async getManagedProject(accountPrincipal, serviceBaseUrl, loopWorkspaceId, projectId) {
    await this.init()
    const state = await this.readProjectCatalog(accountPrincipal)
    const key = projectSyncKey(
      serviceBaseURL(serviceBaseUrl),
      assertID(loopWorkspaceId, "Loop workspace id"),
      assertID(projectId, "project id"),
    )
    const project = state.projects.find(candidate => managedProjectKey(candidate) === key)
    return project === undefined ? null : publicManagedProject(project)
  }

  async removeManagedProjectByWorkspace(accountPrincipal, workspaceId, serviceBaseUrl) {
    await this.init()
    const id = assertID(workspaceId, "workspace id")
    const service = serviceBaseURL(serviceBaseUrl)
    return await this.serialize(async () => {
      const state = await this.readProjectCatalog(accountPrincipal)
      const next = state.projects.filter(candidate =>
        candidate.workspaceId !== id || candidate.serverUrl !== service)
      if (next.length === state.projects.length) return false
      state.projects = next
      await this.writeProjectCatalog(accountPrincipal, state)
      return true
    })
  }

  /**
   * Record ownership before creating a Workspace or remote binding. The stable
   * key is server + account + Loop workspace + Loop project, never a name/path.
   */
  async beginManagedProject(accountPrincipal, input) {
    await this.init()
    const service = serviceBaseURL(input.serverUrl)
    const loopWorkspaceId = assertID(input.loopWorkspaceId, "Loop workspace id")
    const workspacePath = input.workspacePath === undefined
      ? input.directory
      : input.workspacePath
    const record = {
      serverUrl: service,
      loopWorkspaceId,
      projectId: assertID(input.projectId, "project id"),
      projectName: boundedText(input.projectName, 255, "project name"),
      agentId: assertID(input.agentId, "agent id"),
      directory: assertAbsolutePath(input.directory ?? workspacePath),
      workspaceId: input.workspaceId === undefined
        ? ""
        : assertID(input.workspaceId, "workspace id"),
      workspacePath: assertAbsolutePath(workspacePath),
      workspaceTitle: input.workspaceTitle === undefined
        ? boundedText(input.projectName, 255, "workspace title")
        : boundedText(input.workspaceTitle, 255, "workspace title"),
      bindingRevision: input.bindingRevision === undefined
        ? ""
        : assertRevision(input.bindingRevision),
      defaultChannelId: "",
      state: ["pending", "synced", "error", "workspace_missing"].includes(input.state)
        ? input.state
        : (() => { throw invalid("managed project state is invalid") })(),
      reason: input.reason === undefined || input.reason === ""
        ? ""
        : boundedText(input.reason, 512, "managed project reason"),
    }
    return await this.upsertManagedProject(accountPrincipal, record)
  }

  async markManagedProjectError(accountPrincipal, input) {
    const current = await this.getManagedProject(
      accountPrincipal, input.serverUrl, input.loopWorkspaceId, input.projectId,
    )
    if (current === null) return null
    return await this.beginManagedProject(accountPrincipal, {
      ...current,
      serverUrl: input.serverUrl,
      loopWorkspaceId: input.loopWorkspaceId,
      state: "error",
      reason: input.reason,
    })
  }

  async setProjectSyncLastRun(serviceBaseUrl, timestamp = this.now().toISOString()) {
    await this.setProjectSyncSettings(serviceBaseUrl, {lastSyncedAt: timestamp, lastError: ""})
  }

  async setProjectSyncError(serviceBaseUrl, reason) {
    await this.setProjectSyncSettings(serviceBaseUrl, {lastError: reason})
  }

  async upsertManagedProject(accountPrincipal, record) {
    await this.init()
    return await this.serialize(async () => {
      const state = await this.readProjectCatalog(accountPrincipal)
      const key = managedProjectKey(record)
      const index = state.projects.findIndex(candidate => managedProjectKey(candidate) === key)
      const timestamp = this.now().toISOString()
      const previous = index === -1 ? undefined : state.projects[index]
      const next = {
        ...record,
        createdAt: previous?.createdAt ?? timestamp,
        updatedAt: timestamp,
      }
      if (index === -1) {
        if (state.projects.length >= MAX_PROJECT_SYNC_PROJECTS) {
          throw invalid("managed project catalog is full")
        }
        state.projects.push(next)
      } else {
        state.projects[index] = next
      }
      await this.writeProjectCatalog(accountPrincipal, state)
      return publicManagedProject(next)
    })
  }

  async getBinding(accountPrincipal, workspaceId, workspacePath, requestedServiceBaseUrl) {
    await this.init()
    const state = await this.readAccount(accountPrincipal)
    const id = assertID(workspaceId, "workspace id")
    const service = requestedServiceBaseUrl === undefined
      ? undefined
      : serviceBaseURL(requestedServiceBaseUrl) || undefined
    let located = service === undefined
      ? locateBinding(state.bindings, id)
      : locateBinding(state.bindings, id, service, this.defaultServiceBaseUrl)
    let binding = located?.binding
    if (binding === undefined) return null
    if (binding.placementKind !== "channel_session" && binding.workspacePath !== assertAbsolutePath(workspacePath)) return null
    if (service !== undefined &&
        resolvedBindingServer(binding, this.defaultServiceBaseUrl) !== service) return null
    return publicBinding(binding, this.defaultServiceBaseUrl)
  }

  async getBindingForWorkspace(accountPrincipal, workspaceId, workspacePath) {
    await this.init()
    const state = await this.readAccount(accountPrincipal)
    const id = assertID(workspaceId, "workspace id")
    const path = assertAbsolutePath(workspacePath)
    return Object.values(state.bindings)
      .filter(binding => binding.workspaceId === id && binding.workspacePath === path)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(binding => publicBinding(binding, this.defaultServiceBaseUrl))[0] ?? null
  }

  async hasBindingForWorkspace(workspaceId, workspacePath, excludedServiceBaseUrl) {
    await this.init()
    const id = assertID(workspaceId, "workspace id")
    const path = assertAbsolutePath(workspacePath)
    const excluded = excludedServiceBaseUrl === undefined
      ? undefined
      : serviceBaseURL(excludedServiceBaseUrl)
    const files = (await readdir(this.root))
      .filter(name => /^account-[a-f0-9]{64}\.json$/u.test(name))
    for (const name of files) {
      let state
      try {
        const raw = await readFile(join(this.root, name))
        if (raw.byteLength > MAX_STATE_BYTES) continue
        state = JSON.parse(raw.toString("utf8"))
      } catch {
        continue
      }
      if (state?.bindings === null || typeof state?.bindings !== "object" || Array.isArray(state.bindings)) continue
      if (Object.values(state.bindings).some(binding =>
        binding.workspaceId === id &&
        binding.workspacePath === path &&
        (excluded === undefined ||
          resolvedBindingServer(binding, this.defaultServiceBaseUrl) !== excluded))) {
        return true
      }
    }
    return false
  }

  async getActiveAccount(serviceBaseUrl) {
    await this.init()
    const service = serviceBaseUrl === undefined ? "" : serviceBaseURL(serviceBaseUrl)
    try {
      const raw = await readFile(join(this.root, scopedStateName("active-account", service)))
      if (raw.byteLength > 2048) throw new Error("active account record is oversized")
      const record = JSON.parse(raw.toString("utf8"))
      if (record?.version !== 1) throw new Error("active account record is invalid")
      return record.accountPrincipal === "" ? "" : assertAccount(record.accountPrincipal)
    } catch (error) {
      if (error?.code === "ENOENT" && service !== "" && service === this.defaultServiceBaseUrl) {
        return await this.getActiveAccount()
      }
      if (error?.code === "ENOENT") return ""
      throw error
    }
  }

  async setActiveAccount(accountPrincipal, serviceBaseUrl) {
    await this.init()
    const key = accountPrincipal === "" ? "" : assertAccount(accountPrincipal)
    const service = serviceBaseUrl === undefined ? "" : serviceBaseURL(serviceBaseUrl)
    await this.serialize(() => this.atomicWrite(
      join(this.root, scopedStateName("active-account", service)),
      Buffer.from(`${JSON.stringify({version: 1, accountPrincipal: key})}\n`),
    ))
  }

  /**
   * Replace a Workspace binding only when the caller names the current revision.
   * @param {string} accountPrincipal
   * @param {{workspaceId: string, workspacePath: string, workspaceTitle: string,
   * expectedRevision: string | null, target: object, fencePreviousConsent?: boolean, resumeActions?: boolean}} input
   */
  async putBinding(accountPrincipal, input) {
    await this.init()
    const workspaceId = assertID(input.workspaceId, "workspace id")
    const workspacePath = assertAbsolutePath(input.workspacePath)
    const target = validateTarget(input.target)
    return await this.serialize(async () => {
      const state = await this.readAccount(accountPrincipal)
      const service = serviceBaseURL(target.loopServiceBaseUrl)
      const key = bindingKey(workspaceId, service)
      let current = state.bindings[key]
      if (current !== undefined &&
          resolvedBindingServer(current, this.defaultServiceBaseUrl) !== service) {
        current = undefined
      }
      if (current === undefined) {
        const legacy = state.bindings[workspaceId]
        if (resolvedBindingServer(legacy, this.defaultServiceBaseUrl) === service) current = legacy
      }
      if (input.expectedRevision === null) {
        if (current !== undefined) {
          if (current.workspacePath === workspacePath &&
              sameTarget(current, target, this.defaultServiceBaseUrl)) {
            return publicBinding(current, this.defaultServiceBaseUrl)
          }
          throw conflict("binding revision changed")
        }
      } else if (current === undefined
        || current.workspacePath !== workspacePath
        || current.revision !== assertRevision(input.expectedRevision)) {
        throw conflict("binding revision changed")
      }
      if (current?.repairPending) throw conflict("binding repair is pending")
      if (input.fencePreviousConsent === true) {
        if (!current || current.unbinding || input.expectedRevision === null ||
            current.placementKind !== "channel_session" || !sameTarget(current, target, this.defaultServiceBaseUrl)) {
          throw conflict("binding is disconnecting or changed")
        }
        for (const session of Object.values(state.sessions)) {
          if (session.workspaceId === workspaceId && session.legacyBinding &&
              resolvedSessionServer(state, session, this.defaultServiceBaseUrl) === service) delete session.legacyBinding
        }
      }
      if (current !== undefined && target.placementKind === "channel_session" && current.placementKind !== "channel_session") {
        for (const session of Object.values(state.sessions)) {
          if (session.workspaceId === workspaceId && session.bindingRevision === current.revision) {
            session.legacyBinding = publicBinding(current, this.defaultServiceBaseUrl)
          }
        }
      }
      const timestamp = this.now().toISOString()
      const record = {
        ...target,
        workspaceId,
        workspacePath,
        workspaceTitle: boundedText(input.workspaceTitle, 255, "workspace title"),
        revision: assertRevision(this.randomID()),
        ...target,
        boundAt: current?.workspacePath === workspacePath ? current.boundAt : timestamp,
        ...(input.fencePreviousConsent === true ? {repairPending: true, captureAfter: timestamp} :
          current?.captureAfter !== undefined ? {captureAfter: current.captureAfter} : {}),
        updatedAt: timestamp,
      }
      if (resolvedBindingServer(state.bindings[workspaceId], this.defaultServiceBaseUrl) === service) {
        delete state.bindings[workspaceId]
      }
      if (input.fencePreviousConsent && input.resumeActions) {
        for (const session of Object.values(state.sessions)) {
          if (session.workspaceId === workspaceId && session.loopServiceBaseUrl === service &&
              session.defaultChannelId === record.defaultChannelId && !session.projectId &&
              (session.bindingRevision === current.revision || session.actionRevision === current.revision)) {
            session.actionRevision = record.revision
          }
        }
      }
      state.bindings[key] = record
      await this.writeAccount(accountPrincipal, state)
      return publicBinding(record, this.defaultServiceBaseUrl)
    })
  }

  async finishBindingRepair(accountPrincipal, binding) {
    return await this.serialize(async () => {
      const state = await this.readAccount(accountPrincipal)
      const record = locateBinding(state.bindings, binding.workspaceId, binding.loopServiceBaseUrl, this.defaultServiceBaseUrl)?.binding
      if (!record?.repairPending || record.unbinding || record.revision !== binding.revision) throw conflict("binding repair changed")
      record.updatedAt = record.captureAfter = this.now().toISOString()
      delete record.repairPending
      await this.writeAccount(accountPrincipal, state)
    })
  }

  /**
   * Refresh display-only Project/Workspace names without changing the binding
   * revision that fences existing Sessions.
   */
  async refreshBindingTargetMetadata(accountPrincipal, input) {
    await this.init()
    const target = validateTarget(input.target)
    const workspaceId = assertID(input.workspaceId, "workspace id")
    const workspacePath = assertAbsolutePath(input.workspacePath)
    return await this.serialize(async () => {
      const state = await this.readAccount(accountPrincipal)
      const located = locateBinding(
        state.bindings,
        workspaceId,
        serviceBaseURL(target.loopServiceBaseUrl),
        this.defaultServiceBaseUrl,
      )
      const current = located?.binding
      if (current === undefined || current.workspacePath !== workspacePath) {
        throw conflict("binding is unavailable")
      }
      for (const key of [
        "loopWorkspaceId",
        "projectId",
        "defaultChannelId",
        "agentId",
      ]) {
        if (current[key] !== target[key]) throw conflict("binding identity changed")
      }
      const next = {
        ...current,
        loopWorkspaceName: target.loopWorkspaceName,
        projectName: target.projectName,
        agentName: target.agentName,
        accountName: target.accountName,
        webUrl: target.webUrl,
        workspaceTitle: boundedText(input.workspaceTitle, 255, "workspace title"),
        updatedAt: this.now().toISOString(),
      }
      if (next.loopWorkspaceName === current.loopWorkspaceName &&
          next.projectName === current.projectName &&
          next.agentName === current.agentName &&
          next.accountName === current.accountName &&
          next.webUrl === current.webUrl &&
          next.workspaceTitle === current.workspaceTitle) {
        return publicBinding(current, this.defaultServiceBaseUrl)
      }
      state.bindings[located.key] = next
      await this.writeAccount(accountPrincipal, state)
      return publicBinding(next, this.defaultServiceBaseUrl)
    })
  }

  /** Durable local freeze while the existing remote disconnect operation finishes. */
  async accountDisconnectPending(accountPrincipal, serviceBaseUrl, loopWorkspaceId) {
    if (!accountPrincipal) return false
    await this.init()
    const state = await this.readAccount(accountPrincipal)
    return state.disconnecting?.[JSON.stringify([serviceBaseURL(serviceBaseUrl), assertID(loopWorkspaceId, "Loop workspace id")])] === true
  }

  async accountDisconnectCompleted(accountPrincipal, serviceBaseUrl, loopWorkspaceId) {
    if (!accountPrincipal || !loopWorkspaceId) return false
    await this.init()
    const state = await this.readAccount(accountPrincipal)
    return state.disconnecting?.[JSON.stringify([serviceBaseURL(serviceBaseUrl), assertID(loopWorkspaceId, "Loop workspace id")])] === "completed"
  }

  async clearCompletedDisconnect(accountPrincipal, serviceBaseUrl, loopWorkspaceId) {
    if (!accountPrincipal || !loopWorkspaceId) return
    await this.init()
    return this.serialize(async () => {
      const state = await this.readAccount(accountPrincipal)
      const key = JSON.stringify([serviceBaseURL(serviceBaseUrl), assertID(loopWorkspaceId, "Loop workspace id")])
      if (state.disconnecting?.[key] !== "completed") return
      delete state.disconnecting[key]
      await this.writeAccount(accountPrincipal, state)
    })
  }

  async beginAccountDisconnect(accountPrincipal, serviceBaseUrl, loopWorkspaceId) {
    await this.init()
    return this.serialize(async () => {
      const state = await this.readAccount(accountPrincipal)
      const service = serviceBaseURL(serviceBaseUrl)
      const workspace = assertID(loopWorkspaceId, "Loop workspace id")
      const revisions = new Set()
      for (const binding of Object.values(state.bindings)) {
        if (resolvedBindingServer(binding, this.defaultServiceBaseUrl) !== service || binding.loopWorkspaceId !== workspace) continue
        binding.unbinding = true
        revisions.add(binding.revision)
      }
      const sessionIds = Object.values(state.sessions)
        .filter(session => (revisions.has(session.bindingRevision) || revisions.has(session.actionRevision)) && resolvedSessionServer(state, session, this.defaultServiceBaseUrl) === service)
        .map(session => session.sessionId)
      state.disconnecting ??= {}
      state.disconnecting[JSON.stringify([service, workspace])] = true
      await this.writeAccount(accountPrincipal, state)
      return sessionIds
    })
  }

  /** Remove connection metadata only after a server completion receipt. Chats live in Harness. */
  async finishAccountDisconnect(accountPrincipal, serviceBaseUrl, loopWorkspaceId) {
    await this.init()
    return this.serialize(async () => {
      const state = await this.readAccount(accountPrincipal)
      const service = serviceBaseURL(serviceBaseUrl)
      const workspace = assertID(loopWorkspaceId, "Loop workspace id")
      const bindings = Object.entries(state.bindings).filter(([, binding]) =>
        resolvedBindingServer(binding, this.defaultServiceBaseUrl) === service && binding.loopWorkspaceId === workspace)
      const revisions = new Set(bindings.map(([, binding]) => binding.revision))
      for (const [id, session] of Object.entries(state.sessions)) {
        if ((revisions.has(session.bindingRevision) || revisions.has(session.actionRevision)) && resolvedSessionServer(state, session, this.defaultServiceBaseUrl) === service) delete state.sessions[id]
      }
      for (const [key] of bindings) delete state.bindings[key]
      state.disconnecting ??= {}
      state.disconnecting[JSON.stringify([service, workspace])] = "completed"
      await this.writeAccount(accountPrincipal, state)
    })
  }

  async removeBinding(accountPrincipal, workspaceId, workspacePath, expectedRevision, serviceBaseUrl) {
    await this.init()
    return await this.serialize(async () => {
      const state = await this.readAccount(accountPrincipal)
      const id = assertID(workspaceId, "workspace id")
      const service = serviceBaseUrl === undefined ? undefined : serviceBaseURL(serviceBaseUrl) || undefined
      const located = locateBinding(state.bindings, id, service, this.defaultServiceBaseUrl)
      const current = located?.binding
      if (current === undefined) return null
      if (current.workspacePath !== assertAbsolutePath(workspacePath)) {
        throw conflict("workspace path changed")
      }
      if (current.revision !== assertRevision(expectedRevision)) {
        throw conflict("binding revision changed")
      }
      const currentServer = resolvedBindingServer(current, this.defaultServiceBaseUrl)
      const removedSessions = Object.entries(state.sessions)
        .filter(([, session]) => session.workspaceId === id &&
          (session.bindingRevision === current.revision || session.actionRevision === current.revision) &&
          sessionMatchesBindingRemoval(
            state, session, currentServer, this.defaultServiceBaseUrl,
          ))
        .map(([sessionId]) => sessionId)
      delete state.bindings[located.key]
      for (const sessionId of removedSessions) delete state.sessions[sessionId]
      await this.writeAccount(accountPrincipal, state)
      return publicBinding(current, this.defaultServiceBaseUrl)
    })
  }

  async beginUnbinding(accountPrincipal, workspaceId, workspacePath, expectedRevision, serviceBaseUrl) {
    await this.init()
    return await this.serialize(async () => {
      const state = await this.readAccount(accountPrincipal)
      const id = assertID(workspaceId, "workspace id")
      const service = serviceBaseUrl === undefined ? undefined : serviceBaseURL(serviceBaseUrl) || undefined
      const located = locateBinding(state.bindings, id, service, this.defaultServiceBaseUrl)
      const current = located?.binding
      if (current === undefined
        || current.workspacePath !== assertAbsolutePath(workspacePath)
        || current.revision !== assertRevision(expectedRevision)) {
        throw conflict("binding revision changed")
      }
      current.unbinding = true
      await this.writeAccount(accountPrincipal, state)
    })
  }

  /**
   * Serialize one account's binding lifecycle across runtime instances. The
   * operation covers remote helper effects plus the final local mapping delete.
   */
  async withConnectionLease(accountPrincipal, signal, operation) {
    return await this.withServerOperation(
      signal,
      () => this.withAccountLease(accountPrincipal, signal, operation),
    )
  }

  async withServerLease(signal, operation) {
    if (typeof operation !== "function") throw new TypeError("connection lease operation is required")
    await this.init()
    return await this.withLease(
      join(this.root, "connection.lifecycle.lock"), signal, async () => {
        const deadline = Date.now() + LEASE_WAIT_MS
        while (true) {
          const markers = (await readdir(this.root))
            .filter(name => /^connection-operation-[A-Za-z0-9-]+\.json$/u.test(name))
          for (const marker of markers) {
            const path = join(this.root, marker)
            try {
              const info = await lstat(path)
              if (Date.now() - info.mtimeMs > LEASE_STALE_MS) await unlink(path)
            } catch (error) {
              if (error?.code !== "ENOENT") throw error
            }
          }
          if (markers.length === 0) return await operation()
          if (Date.now() >= deadline) throw conflict("connection lifecycle is busy")
          await new Promise(resolve => setTimeout(resolve, 25))
        }
      },
    )
  }

  async withServerOperation(signal, operation) {
    if (typeof operation !== "function") throw new TypeError("server operation is required")
    await this.init()
    const marker = join(this.root, `connection-operation-${process.pid}-${randomUUID()}.json`)
    await this.withLease(
      join(this.root, "connection.lifecycle.lock"), signal, async () => {
        await this.atomicWrite(marker, Buffer.from(`${process.pid}\n`))
      },
    )
    try {
      return await operation()
    } finally {
      await unlink(marker).catch(error => {
        if (error?.code !== "ENOENT") throw error
      })
    }
  }

  async connectionBusy() {
    await this.init()
    try {
      await lstat(join(this.root, "connection.lifecycle.lock"))
      return true
    } catch (error) {
      if (error?.code === "ENOENT") return false
      throw error
    }
  }

  async withAccountLease(accountPrincipal, signal, operation) {
    if (typeof operation !== "function") throw new TypeError("binding lease operation is required")
    await this.init()
    const account = assertAccount(accountPrincipal)
    const digest = createHash("sha256").update(account).digest("hex")
    return await this.withLease(
      join(this.root, `account-${digest}.lifecycle.lock`), signal, operation,
    )
  }

  async withLease(path, signal, operation) {
    const token = randomUUID()
    const deadline = Date.now() + LEASE_WAIT_MS
    let handle
    while (handle === undefined) {
      if (signal?.aborted) throw new Error("binding lifecycle was cancelled")
      try {
        handle = await open(path, "wx", 0o600)
        await handle.writeFile(`${JSON.stringify({pid: process.pid, token})}\n`)
        await handle.sync()
        await handle.close()
        handle = undefined
        break
      } catch (error) {
        await handle?.close().catch(() => {})
        handle = undefined
        if (error?.code !== "EEXIST") throw error
        try {
          const info = await lstat(path)
          if (Date.now() - info.mtimeMs > LEASE_STALE_MS) {
            await unlink(path).catch(() => {})
            continue
          }
        } catch (inspectError) {
          if (inspectError?.code === "ENOENT") continue
          throw inspectError
        }
        if (Date.now() >= deadline) throw conflict("binding lifecycle is busy")
        await new Promise(resolve => setTimeout(resolve, 25))
      }
    }
    try {
      return await operation()
    } finally {
      try {
        const owner = JSON.parse((await readFile(path, "utf8")).trim())
        if (owner?.token === token) await unlink(path)
      } catch (error) {
        if (error?.code !== "ENOENT") throw error
      }
    }
  }

  /**
   * Report whether a Workspace removal leaves another binding on the same
   * account, plus the Session IDs whose local sync state belongs to it.
   */
  async workspaceRemovalPlan(accountPrincipal, workspaceId, serviceBaseUrl, {allRevisions = false} = {}) {
    await this.init()
    const state = await this.readAccount(accountPrincipal)
    const id = assertID(workspaceId, "workspace id")
    const service = serviceBaseUrl === undefined ? undefined : serviceBaseURL(serviceBaseUrl) || undefined
    const located = locateBinding(state.bindings, id, service, this.defaultServiceBaseUrl)
    const binding = located?.binding
    if (binding === undefined) {
      return {found: false, hasRemainingBindings: false, sessionIds: []}
    }
    return {
      found: true,
      hasRemainingBindings: Object.entries(state.bindings)
        .some(([key, candidate]) => key !== located.key && candidate.unbinding !== true &&
          resolvedBindingServer(candidate, this.defaultServiceBaseUrl) ===
            resolvedBindingServer(binding, this.defaultServiceBaseUrl)),
      sessionIds: Object.values(state.sessions)
        .filter(session => session.workspaceId === id && (allRevisions || session.bindingRevision === binding.revision || session.actionRevision === binding.revision) &&
          sessionMatchesBindingRemoval(
            state,
            session,
            resolvedBindingServer(binding, this.defaultServiceBaseUrl),
            this.defaultServiceBaseUrl,
          ))
        .map(session => session.sessionId)
        .sort(),
    }
  }

  async getSession(accountPrincipal, workspaceId, sessionId) {
    await this.init()
    const state = await this.readAccount(accountPrincipal)
    const record = state.sessions[assertID(sessionId, "session id")]
    return record?.workspaceId === assertID(workspaceId, "workspace id")
      ? publicSession(record, resolvedSessionServer(state, record, this.defaultServiceBaseUrl))
      : null
  }

  /** Resolve one Session without requiring the caller to know its Workspace. */
  async getSessionByID(accountPrincipal, sessionId) {
    await this.init()
    const state = await this.readAccount(accountPrincipal)
    const record = state.sessions[assertID(sessionId, "session id")]
    return publicSession(record, resolvedSessionServer(state, record, this.defaultServiceBaseUrl))
  }

  async getSessionForWorkspaceAnyAccount(workspaceId, sessionId) {
    await this.init()
    const id = assertID(sessionId, "session id")
    const workspace = assertID(workspaceId, "workspace id")
    const files = (await readdir(this.root))
      .filter(name => /^account-[a-f0-9]{64}\.json$/u.test(name))
    for (const name of files) {
      let state
      try {
        const raw = await readFile(join(this.root, name))
        if (raw.byteLength > MAX_STATE_BYTES) continue
        state = JSON.parse(raw.toString("utf8"))
      } catch {
        continue
      }
      const record = state?.sessions?.[id]
      if (record?.workspaceId === workspace) {
        return publicSession(record, resolvedSessionServer(state, record, this.defaultServiceBaseUrl))
      }
    }
    return null
  }

  /**
   * Capture a Session against the active binding at first use. Only bindings with an explicit channel start syncing automatically.
   * Project-only bindings carry context without creating a conversation target.
   * @param {string} accountPrincipal
   * @param {{workspaceId: string, sessionId: string, sessionCreatedAt: number,
   * binding: ReturnType<typeof publicBinding>}} input
   */
  async captureSession(accountPrincipal, input) {
    await this.init()
    if (input.binding === null || input.binding === undefined) return null
    const workspaceId = assertID(input.workspaceId, "workspace id")
    const sessionId = assertID(input.sessionId, "session id")
    if (input.binding.workspaceId !== workspaceId) throw conflict("binding workspace changed")
    if (!Number.isFinite(input.sessionCreatedAt)) throw invalid("session creation time is invalid")
    const bindingAt = Date.parse(input.binding.boundAt)
    if (input.binding.placementKind !== "channel_session" &&
        (!Number.isFinite(bindingAt) || input.sessionCreatedAt < bindingAt)) return null
    return await this.serialize(async () => {
      const state = await this.readAccount(accountPrincipal)
      const existing = state.sessions[sessionId]
      if (existing !== undefined) {
        if (existing.workspaceId !== workspaceId) throw conflict("session workspace changed")
        return publicSession(
          existing,
          resolvedSessionServer(state, existing, this.defaultServiceBaseUrl),
        )
      }
      // A repaired connection never inherits history from previously unseen Sessions.
      // Check the durable cutoff in the same transaction that captures consent.
      const active = locateBinding(state.bindings, workspaceId, input.binding.loopServiceBaseUrl, this.defaultServiceBaseUrl)?.binding
      if (active?.repairPending) return null
      if (active?.captureAfter !== undefined && (active.revision !== input.binding.revision ||
          !(input.sessionCreatedAt > Date.parse(active.captureAfter)))) return null
      const channelId = input.binding.placementKind === "channel_session" ? input.binding.defaultChannelId : ""
      const record = {
        sessionId,
        workspaceId,
        workspacePath: input.binding.workspacePath,
        bindingRevision: input.binding.revision,
        loopServiceBaseUrl: input.binding.loopServiceBaseUrl,
        loopWorkspaceId: input.binding.loopWorkspaceId,
        placementKind: input.binding.placementKind,
        projectId: input.binding.projectId,
        defaultChannelId: channelId,
        boundAt: this.now().toISOString(),
        syncEnabled: Boolean(channelId),
        syncPreference: channelId ? "project_default" : "off",
      }
      state.sessions[sessionId] = record
      await this.writeAccount(accountPrincipal, state)
      return publicSession(record, record.loopServiceBaseUrl)
    })
  }

  async setSessionSync(accountPrincipal, workspaceId, sessionId, enabled) {
    await this.init()
    if (typeof enabled !== "boolean") throw invalid("sync enabled must be boolean")
    return await this.serialize(async () => {
      const state = await this.readAccount(accountPrincipal)
      const id = assertID(sessionId, "session id")
      const record = state.sessions[id]
      if (record === undefined || record.workspaceId !== assertID(workspaceId, "workspace id")) {
        throw conflict("session has no inherited binding")
      }
      const server = resolvedSessionServer(state, record, this.defaultServiceBaseUrl)
      const syncPreference = enabled
        ? record.syncPreference === "project_default" ? "project_default" : "on"
        : "off"
      if (record.syncEnabled === enabled && record.syncPreference === syncPreference) {
        return publicSession(record, server)
      }
      record.syncEnabled = enabled
      record.syncPreference = syncPreference
      record.updatedAt = this.now().toISOString()
      await this.writeAccount(accountPrincipal, state)
      return publicSession(record, server)
    })
  }

  async initialize() {
    try {
      const current = await lstat(this.root)
      if (!current.isDirectory()) throw new Error("binding state root is not a directory")
      if (current.isSymbolicLink()) throw new Error("binding state root is a symbolic link")
      if (process.platform === "win32") checkWindowsPath(this.root)
      if (process.platform !== "win32" && (current.mode & 0o077) !== 0) throw new Error("binding state root permissions are too broad")
      this.root = await realpath(this.root)
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
      if (process.platform === "win32") checkWindowsPath(this.root, true)
      else await mkdir(this.root, {recursive: true, mode: 0o700})
      await chmod(this.root, 0o700)
    }
    if (this.installationId === "") {
      const path = join(this.root, "installation-id")
      let installed
      try {
        installed = (await readFile(path, "utf8")).trim()
      } catch (error) {
        if (error?.code !== "ENOENT") throw error
      }
      if (installed === undefined) {
        installed = randomUUID()
        await this.atomicWrite(path, `${installed}\n`)
      }
      this.installationId = assertID(installed, "host installation id")
    }
  }

  async readProjectCatalog(accountPrincipal) {
    const key = assertAccount(accountPrincipal)
    const path = join(this.root, projectCatalogName(key))
    let raw
    try {
      raw = await readFile(path)
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
      return {
        version: PROJECT_SYNC_VERSION,
        installationId: this.installationId,
        accountPrincipal: key,
        projects: [],
      }
    }
    if (raw.byteLength > MAX_PROJECT_SYNC_BYTES) throw new Error("managed project catalog is oversized")
    const state = JSON.parse(raw.toString("utf8"))
    if (state?.version !== PROJECT_SYNC_VERSION ||
        state.installationId !== this.installationId ||
        state.accountPrincipal !== key ||
        !Array.isArray(state.projects) ||
        state.projects.length > MAX_PROJECT_SYNC_PROJECTS) {
      throw new Error("managed project catalog is invalid")
    }
    const keys = new Set()
    for (const project of state.projects) {
      validateManagedProject(project)
      const projectKey = managedProjectKey(project)
      if (keys.has(projectKey)) throw new Error("managed project catalog contains duplicates")
      keys.add(projectKey)
    }
    return state
  }

  async writeProjectCatalog(accountPrincipal, state) {
    if (state.projects.length > MAX_PROJECT_SYNC_PROJECTS) {
      throw new Error("managed project catalog is full")
    }
    const raw = Buffer.from(`${JSON.stringify(state)}\n`)
    if (raw.byteLength > MAX_PROJECT_SYNC_BYTES) throw new Error("managed project catalog is oversized")
    await this.atomicWrite(
      join(this.root, projectCatalogName(assertAccount(accountPrincipal))),
      raw,
    )
  }

  async readAccount(accountPrincipal) {
    const key = assertAccount(accountPrincipal)
    const digest = createHash("sha256").update(key).digest("hex")
    const path = join(this.root, `account-${digest}.json`)
    let raw
    try {
      raw = await readFile(path)
    } catch (error) {
      if (error?.code !== "ENOENT") throw error
      return {version: STATE_VERSION, installationId: this.installationId, accountPrincipal: key, bindings: {}, sessions: {}}
    }
    if (raw.byteLength > MAX_STATE_BYTES) throw new Error("binding state is oversized")
    const state = JSON.parse(raw.toString("utf8"))
    validateState(state, this.installationId, key)
    return state
  }

  async writeAccount(accountPrincipal, state) {
    validateState(state, this.installationId, assertAccount(accountPrincipal))
    const digest = createHash("sha256").update(accountPrincipal).digest("hex")
    const raw = Buffer.from(`${JSON.stringify(state)}\n`)
    if (raw.byteLength > MAX_STATE_BYTES) throw new Error("binding state is oversized")
    await this.atomicWrite(join(this.root, `account-${digest}.json`), raw)
  }

  async atomicWrite(path, data) {
    await mkdir(dirname(path), {recursive: true, mode: 0o700})
    const temporary = join(dirname(path), `.tmp-${process.pid}-${randomUUID()}`)
    let handle
    try {
      handle = await open(temporary, "wx", 0o600)
      await handle.writeFile(data)
      await handle.sync()
      await handle.close()
      handle = undefined
      await rename(temporary, path)
      // Windows cannot flush a directory handle; the file was flushed before rename.
      if (process.platform === "win32") return
      const directory = await open(dirname(path), "r")
      try {
        await directory.sync()
      } finally {
        await directory.close()
      }
    } catch (error) {
      await handle?.close().catch(() => {})
      await unlink(temporary).catch(() => {})
      throw error
    }
  }

  serialize(operation) {
    const result = this.writeTail.then(operation, operation)
    this.writeTail = result.then(() => undefined, () => undefined)
    return result
  }
}

function validateTarget(target) {
  if (target === null || typeof target !== "object" || Array.isArray(target)) {
    throw invalid("binding target is invalid")
  }
  return {
    loopServiceBaseUrl: serviceBaseURL(target.loopServiceBaseUrl),
    loopWorkspaceId: assertID(target.loopWorkspaceId, "Loop workspace id"),
    loopWorkspaceName: boundedText(target.loopWorkspaceName, 255, "Loop workspace name"),
    ...(target.placementKind === "channel_session" ? {placementKind: "channel_session"} : {}),
    projectId: target.placementKind === "channel_session" ? "" : assertID(target.projectId, "project id"),
    projectName: target.placementKind === "channel_session" ? "" : boundedText(target.projectName, 255, "project name"),
    defaultChannelId: target.placementKind === "channel_session"
      ? assertID(target.defaultChannelId, "channel id") : "",
    agentId: assertID(target.agentId, "agent id"),
    agentName: boundedText(target.agentName, 255, "agent name"),
    accountName: boundedText(target.accountName, 255, "account name"),
    webUrl: boundedURL(target.webUrl),
  }
}

function exactStringID(value) {
  try {
    return assertID(value, "Loop workspace id")
  } catch {
    return ""
  }
}

function validateState(state, installationId, accountPrincipal) {
  if (state === null || typeof state !== "object" || Array.isArray(state)
    || state.version !== STATE_VERSION
    || state.installationId !== installationId
    || state.accountPrincipal !== accountPrincipal
    || state.bindings === null || typeof state.bindings !== "object" || Array.isArray(state.bindings)
    || state.sessions === null || typeof state.sessions !== "object" || Array.isArray(state.sessions)) {
    throw new Error("binding state is invalid")
  }
}

function validateManagedProject(project) {
  if (project === null || typeof project !== "object" || Array.isArray(project)) {
    throw new Error("managed project record is invalid")
  }
  serviceBaseURL(project.serverUrl)
  assertID(project.loopWorkspaceId, "Loop workspace id")
  assertID(project.projectId, "project id")
  boundedText(project.projectName, 255, "project name")
  assertID(project.agentId, "agent id")
  assertAbsolutePath(project.directory)
  if (project.workspaceId !== "") assertID(project.workspaceId, "workspace id")
  assertAbsolutePath(project.workspacePath)
  boundedText(project.workspaceTitle, 255, "workspace title")
  if (project.bindingRevision !== "") assertRevision(project.bindingRevision)
  if (project.defaultChannelId !== "") assertID(project.defaultChannelId, "default channel id")
  if (!["pending", "synced", "error", "workspace_missing"].includes(project.state)) {
    throw new Error("managed project state is invalid")
  }
  if (project.reason !== "") boundedText(project.reason, 512, "managed project reason")
  if (typeof project.createdAt !== "string" || typeof project.updatedAt !== "string") {
    throw new Error("managed project timestamps are invalid")
  }
}

function sameTarget(left, right, defaultServiceBaseUrl) {
  for (const key of [
    "loopServiceBaseUrl",
    "loopWorkspaceId",
    "loopWorkspaceName",
    "projectId",
    "projectName",
    "defaultChannelId",
    "agentId",
    "agentName",
    "accountName",
    "webUrl",
  ]) {
    if (key === "loopServiceBaseUrl") {
      if (resolvedBindingServer(left, defaultServiceBaseUrl) !== serviceBaseURL(right[key])) return false
      continue
    }
    if (key === "defaultChannelId" && left.projectId && right.projectId) continue
    if (left[key] !== right[key]) return false
  }
  return true
}

function boundedURL(value) {
  if (typeof value !== "string" || value.length > 2048) throw invalid("URL is invalid")
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw invalid("URL is invalid")
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) {
    throw invalid("URL is invalid")
  }
  return parsed.href
}

function boundedText(value, max, label) {
  if (typeof value !== "string" || value.trim() === "" || Buffer.byteLength(value) > max) {
    throw invalid(`${label} is invalid`)
  }
  return value
}

function conflict(message) {
  const error = new Error(message)
  error.code = "loop-host/conflict"
  return error
}
