import {createHash} from "node:crypto"
import {isDeepStrictEqual} from "node:util"
import {
  loopModelPickerID,
  loopModelRouteFromDigest,
  loopModelRouteInput,
} from "./model-identity.mjs"

import {LlmAdapter, LlmError, resolveImageAttachmentAccess, resolveRetryPolicy} from "@deepseek-ai/dsh-llm"
import {PiAiAdapter} from "@deepseek-ai/dsh-llm-pi-ai"
import {anthropicMessagesApi} from "@earendil-works/pi-ai/api/anthropic-messages.lazy"
import {openAICompletionsApi} from "@earendil-works/pi-ai/api/openai-completions.lazy"
import {openAIResponsesApi} from "@earendil-works/pi-ai/api/openai-responses.lazy"
import {getBuiltinModels, getBuiltinProviders} from "@earendil-works/pi-ai/providers/all"

export const name = "loop-proxy-dsh-models"
export const inject = ["llm", "sessions", "loopHostActions", "loopHostService"]

// Harness reserves 65,536 tokens of compaction headroom. The configured
// fallback budget must leave room for that reservation and the response.
const DEFAULT_CONTEXT_WINDOW = 131_072
const DEFAULT_MAX_TOKENS = 8_192
const CATALOG_REFRESH_INTERVAL_MS = 15_000
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 300_000
const DEFAULT_MAX_REQUEST_IMAGE_BYTES = 20 * 1024 * 1024
const DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET = 2048 * 2048
const DEFAULT_REQUEST_IMAGE_MAX_BYTES = 1024 * 1024
const HOST_SESSION = /^session-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/

const PROTOCOLS = {
  "openai-completions": openAICompletionsApi,
  "openai-responses": openAIResponsesApi,
  "anthropic-messages": anthropicMessagesApi,
}
const WIRE_PREFERENCE = ["openai-completions", "openai-responses", "anthropic-messages"]
const PICKER_ALIASES = Symbol("loopModelPickerAliases")

const BUILTIN_BY_PROVIDER = new Map()
const BUILTIN_BY_ID = new Map()
const HOSTED_MODEL_PROVIDERS = new Map([
  ["loop/deepseek-v4-pro", {provider: "deepseek", model: "deepseek-v4-pro"}],
  ["loop/deepseek-v4-flash", {provider: "deepseek", model: "deepseek-flash"}],
])
for (const provider of getBuiltinProviders()) {
  const models = new Map(getBuiltinModels(provider).map(model => [model.id, model]))
  BUILTIN_BY_PROVIDER.set(provider, models)
  for (const model of models.values()) {
    const rows = BUILTIN_BY_ID.get(model.id) ?? []
    rows.push(model)
    BUILTIN_BY_ID.set(model.id, rows)
  }
}

const dummyAuth = {
  credentials: {
    async read() { return undefined },
    async list() { return [] },
    async modify() { throw new Error("Loop model credentials are owned by the trusted Host helper") },
    async delete() {},
  },
  authContext: {
    async env() { return undefined },
    async fileExists() { return false },
  },
}

function providerRoute(connection) {
  const digest = createHash("sha256")
    .update(loopModelRouteInput(connection.workspaceId, connection.connectionId))
    .digest("hex")
  return loopModelRouteFromDigest(digest)
}

function pickerModelID(model) {
  return loopModelPickerID(model)
}

function modelInputs(model) {
  const values = Array.isArray(model.inputModalities) ? model.inputModalities : ["text"]
  return values.filter(value => value === "text" || value === "image")
}

function modelReasoning(model) {
  const known = model.knownCatalog
  if (known?.reasoning === true) {
    return {
      reasoning: true,
      ...known.thinkingLevelMap === undefined ? {} : {thinkingLevelMap: {...known.thinkingLevelMap}},
    }
  }
  const efforts = Array.isArray(model.reasoningEfforts)
    ? model.reasoningEfforts.filter(value => typeof value === "string" && value !== "off")
    : []
  if (efforts.length === 0) return {}
  return {
    reasoning: true,
    thinkingLevelMap: Object.fromEntries(efforts.map(value => [value, value])),
  }
}

function knownCatalogModel(model) {
  if (model.source === "loop_personal") {
    const presetKey = String(model.presetKey ?? "").trim()
    if (presetKey === "") return undefined
    return BUILTIN_BY_PROVIDER.get(presetKey)?.get(model.id)
  }
  const hosted = model.source === "loop_hosted" ? HOSTED_MODEL_PROVIDERS.get(model.id) : undefined
  const providerID = hosted?.provider ?? model.providerId
  const modelID = hosted?.model ?? model.id
  const direct = BUILTIN_BY_PROVIDER.get(providerID)?.get(modelID)
  if (direct !== undefined) return direct
  const matches = BUILTIN_BY_ID.get(modelID) ?? []
  return matches.length === 1 ? matches[0] : undefined
}

function withKnownMetadata(model) {
  const known = knownCatalogModel(model)
  if (known === undefined) return model
  const efforts = known.reasoning && known.thinkingLevelMap
    ? Object.entries(known.thinkingLevelMap)
      .filter(([, value]) => value !== null)
      .map(([effort]) => effort)
    : []
  return {
    ...model,
    contextWindow: model.contextWindow ?? known.contextWindow,
    maxOutputTokens: model.maxOutputTokens ?? known.maxTokens,
    inputModalities: model.inputModalities ?? known.input,
    // Hosted gateways publish their own wire contract. An upstream model name
    // does not authorize vendor-only fields (for example DeepSeek thinking).
    ...model.source !== "loop_hosted" && model.reasoningEfforts === undefined && efforts.length > 0 ? {reasoningEfforts: efforts} : {},
    knownCatalog: model.source === "loop_hosted" ? undefined : known,
  }
}

/**
 * Project executable route variants into one user-visible model per
 * source/provider/model. Keep distinct providers distinct and make collisions
 * understandable without exposing the wire protocol as a separate choice.
 */
export function projectModelDescriptors(models) {
  const groups = new Map()
  for (const model of Array.isArray(models) ? models : []) {
    if (!validDescriptor(model)) continue
    const key = [model.source, model.providerId ?? "", model.id].join("\0")
    const rows = groups.get(key) ?? []
    rows.push(model)
    groups.set(key, rows)
  }
  const selected = []
  for (const rows of groups.values()) {
    const known = knownCatalogModel(rows[0])
    const native = known === undefined ? undefined : rows.find(row => row.wireApi === known.api)
    selected.push(native ?? [...rows].sort((left, right) =>
      WIRE_PREFERENCE.indexOf(left.wireApi) - WIRE_PREFERENCE.indexOf(right.wireApi))[0])
  }
  selected.sort((left, right) => {
    const leftKey = [left.source, left.providerName ?? "", left.providerId ?? "", left.id].join("\0")
    const rightKey = [right.source, right.providerName ?? "", right.providerId ?? "", right.id].join("\0")
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
  })
  const modelCounts = new Map()
  for (const model of selected) modelCounts.set(model.id, (modelCounts.get(model.id) ?? 0) + 1)
  return selected.map(model => {
    const result = {...withKnownMetadata(model)}
    const group = groups.get([model.source, model.providerId ?? "", model.id].join("\0")) ?? [model]
    Object.defineProperty(result, PICKER_ALIASES, {
      value: group.map(pickerModelID),
      enumerable: false,
    })
    if (result.source === "loop_personal" || (modelCounts.get(model.id) ?? 0) > 1) {
      return {...result, name: `${result.name} · ${sourceDisplayLabel(result)}`}
    }
    return result
  })
}

function sourceDisplayLabel(model) {
  const providerName = String(model.providerName ?? "").trim()
  if (model.source === "loop_personal") {
    return providerName === "" ? "Personal" : `Personal · ${providerName}`
  }
  if (model.source === "loop_hosted") return "Loop hosted"
  return providerName === "" ? "Organization" : `Organization · ${providerName}`
}

function conservativeCompat(wireApi) {
  switch (wireApi) {
    case "openai-completions":
      return {
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
        supportsStore: false,
        maxTokensField: "max_tokens",
      }
    case "openai-responses":
      return {supportsDeveloperRole: false}
    case "anthropic-messages":
      return {sendSessionAffinityHeaders: false}
    default:
      return {}
  }
}

function normalizeHostedToolCallPayload(params) {
  if (params === null || typeof params !== "object" || !Array.isArray(params.messages)) return params
  let changed = false
  const messages = params.messages.map(message => {
    if (message?.role !== "assistant" || !Array.isArray(message.tool_calls) ||
        message.tool_calls.length === 0) {
      return message
    }
    const missingContent = message.content === null || message.content === undefined
    const missingReasoning = message.reasoning_content === undefined
    if (!missingContent && !missingReasoning) return message
    changed = true
    return {...message,
      ...missingContent ? {content: ""} : {},
      ...missingReasoning ? {reasoning_content: ""} : {},
    }
  })
  return changed ? {...params, messages} : params
}

function payloadCompatibleOptions(descriptor, options) {
  if (descriptor.source !== "loop_hosted" || descriptor.wireApi !== "openai-completions" ||
      !HOSTED_MODEL_PROVIDERS.has(descriptor.id)) {
    return options
  }
  return {
    ...options,
    onPayload: async (params, model) => {
      const normalized = normalizeHostedToolCallPayload(params)
      if (options?.onPayload === undefined) return normalized
      return await options.onPayload(normalized, model) ?? normalized
    },
  }
}

function profileFor(descriptor, endpoint, route, displayName) {
  const createApi = PROTOCOLS[descriptor.wireApi]
  if (createApi === undefined) throw new LlmError(`Loop model wire ${descriptor.wireApi} is unsupported`, "UNSUPPORTED_OPTION")
  const api = createApi()
  const profileBaseURL = descriptor.wireApi === "anthropic-messages" && endpoint.endsWith("/v1")
    ? endpoint.slice(0, -3)
    : endpoint
  const wireModel = {
    id: descriptor.id,
    name: descriptor.name,
    api: descriptor.wireApi,
    provider: route,
    baseUrl: profileBaseURL,
    input: modelInputs(descriptor),
    cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0},
    contextWindow: descriptor.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: descriptor.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
    ...modelReasoning(descriptor),
    compat: descriptor.knownCatalog?.compat === undefined
      ? conservativeCompat(descriptor.wireApi)
      : {...descriptor.knownCatalog.compat},
  }
  const provider = {
    id: route,
    name: displayName,
    baseUrl: profileBaseURL,
    auth: {
      apiKey: {
        name: displayName,
        resolve: ({credential}) => Promise.resolve({
          auth: credential?.key === undefined ? {} : {apiKey: credential.key},
          source: displayName,
        }),
      },
    },
    getModels: () => [wireModel],
    stream: (model, context, options) => api.stream(
      model,
      context,
      payloadCompatibleOptions(descriptor, options),
    ),
    streamSimple: (model, context, options) => api.streamSimple(
      model,
      context,
      payloadCompatibleOptions(descriptor, options),
    ),
  }
  return {
    provider: route,
    displayName,
    api: descriptor.wireApi,
    baseURL: profileBaseURL,
    streamIdleTimeoutMs: DEFAULT_STREAM_IDLE_TIMEOUT_MS,
    maxRequestImageBytes: DEFAULT_MAX_REQUEST_IMAGE_BYTES,
    requestImagePixelBudget: DEFAULT_REQUEST_IMAGE_PIXEL_BUDGET,
    requestImageMaxBytes: DEFAULT_REQUEST_IMAGE_MAX_BYTES,
    cacheRetention: "none",
    retryPolicy: undefined,
    modelErrors: new Map(),
    configuredMaxTokens: descriptor.maxOutputTokens === undefined
      ? new Map()
      : new Map([[descriptor.id, descriptor.maxOutputTokens]]),
    piProvider: provider,
  }
}

function failure(error) {
  const message = bounded(error?.message ?? error ?? "Loop model request failed")
  switch (error?.code) {
    case "loop-host/needs-auth":
      return new LlmError(message, "INVALID_CREDENTIAL", {cause: error})
    case "loop-host/cancelled":
      return new LlmError(message, "ABORTED", {cause: error})
    case "loop-host/rate-limited":
      return new LlmError(message, "RATE_LIMIT", {cause: error})
    case "loop-host/target-unavailable":
    case "loop-host/conflict":
      return new LlmError(message, "SESSION_EXPIRED", {cause: error})
    default:
      return new LlmError(message, "SERVER", {cause: error})
  }
}

function bounded(value) {
  return String(value).replace(/\s+/gu, " ").slice(0, 512)
}

/** Provider-facing adapter over connection-scoped Loop catalogs. */
export class LoopModelAdapter extends LlmAdapter {
  constructor(ctx, actions, catalogs) {
    super()
    this.ctx = ctx
    this.actions = actions
    this.catalogs = catalogs
    this.activeHostSessions = new Set()
  }

  replaceCatalogs(catalogs) {
    this.catalogs = catalogs
  }

  providerRetryPolicy() {
    // The gateway may have consumed a request before transport failure. Only a
    // new user request may retry, so Harness must not replay the call itself.
    return resolveRetryPolicy({mode: "normal", maxRetries: 0}, "Loop models")
  }

  providerInfo(provider) {
    const catalog = this.catalogs.get(provider)
    return {id: provider, name: catalog?.name ?? "Loop"}
  }

  async listModels(provider) {
    const catalog = this.catalogs.get(provider)
    if (catalog === undefined) return []
    return catalog.models.map(model => ({
      provider,
      id: pickerModelID(model),
      name: model.name,
      inputModalities: modelInputs(model),
    }))
  }

  async resolveModel(provider, id) {
    const catalog = this.catalogs.get(provider)
    const model = catalog?.byPicker.get(id)
    if (catalog === undefined || model === undefined) {
      throw new LlmError(`Loop provider "${provider}" has no model "${id}"`, "UNKNOWN_MODEL")
    }
    return {
      provider,
      id,
      name: model.name,
      inputModalities: modelInputs(model),
      context: {contextWindow: model.contextWindow ?? DEFAULT_CONTEXT_WINDOW},
      defaultMaxTokens: model.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
      ...Array.isArray(model.reasoningEfforts) && model.reasoningEfforts.length > 0 ? {
        reasoning: {
          efforts: model.reasoningEfforts.map(effort => ({id: effort, name: titleCase(effort)})),
        },
      } : {},
    }
  }

  async prepareCall(provider, id, signal) {
    const catalog = this.catalogs.get(provider)
    const model = catalog?.byPicker.get(id)
    if (catalog === undefined || model === undefined) {
      throw new LlmError(`Loop provider "${provider}" has no model "${id}"`, "UNKNOWN_MODEL")
    }
    const info = await this.resolveModel(provider, id, signal)
    return {
      model: info,
      stream: options => this.openStream(options, catalog, model),
    }
  }

  stream(options) {
    const catalog = [...this.catalogs.values()].find(value => value.provider === options.provider)
    const model = catalog?.byPicker.get(options.model)
    if (catalog === undefined || model === undefined) {
      return rejected(new LlmError("Loop model route is no longer available", "UNKNOWN_MODEL"))
    }
    return this.openStream(options, catalog, model)
  }

  openStream(options, catalog, model) {
    return this.streamLocked(options, catalog, model)
  }

  async * streamLocked(options, catalog, model) {
    const hostSessionId = typeof options.sessionId === "string" ? options.sessionId : ""
    const purpose = options.purpose ?? "conversation"
    const signal = options.signal
    if (!HOST_SESSION.test(hostSessionId)) {
      throw new LlmError("Loop model calls require an owning Harness session", "MISSING_SESSION")
    }
    if (signal?.aborted) throw new LlmError("Loop model request was cancelled", "ABORTED")
    let session
    try {
      session = await this.actions.ensureModelSession({
        connectionId: catalog.connectionId,
        hostSessionId,
        modelId: model.id,
        ...model.providerId ? {providerId: model.providerId} : {},
        source: model.source,
        wireApi: model.wireApi,
        purpose,
      }, signal)
    } catch (error) {
      throw failure(error)
    }
    if (!session || typeof session.baseURL !== "string" || typeof session.localKey !== "string") {
      throw new LlmError("Loop returned an invalid local model session", "INVALID_SERVER_RESPONSE")
    }
    this.activeHostSessions.add(hostSessionId)
    let profile
    try {
      profile = profileFor(model, session.baseURL, catalog.provider, catalog.name)
    } catch (error) {
      throw failure(error)
    }
    const profiles = new Map([[catalog.provider, profile]])
    const upstream = new PiAiAdapter({
      profiles: () => profiles,
      resolveApiKey: () => Promise.resolve(session.localKey),
      auth: dummyAuth,
      resolveAttachments: () => this.ctx.get("attachments"),
      resolveImageAccess: (attachments, ref) => resolveImageAttachmentAccess(
        attachments,
        hostPath => this.ctx.get("fs")?.processPathFromHostPath(hostPath),
        ref,
      ),
      onReplayDegrade: () => {},
    })
    const request = {
      ...options,
      provider: catalog.provider,
      model: model.id,
      messages: options.messages.map(message => message.role === "assistant" &&
        message.source.provider === catalog.provider &&
        message.source.model === pickerModelID(model)
        ? {...message, source: {...message.source, model: model.id}}
        : message),
      sessionId: undefined,
      purpose: undefined,
    }
    for await (const chunk of upstream.stream(request)) {
      // Harness replaces AUTH messages with "API key is invalid". A Loop
      // gateway 401/403 can instead describe a Host grant or model permission;
      // preserve that diagnostic without changing authorization or retrying.
      if (chunk.type === "finish" && chunk.reason.kind === "error" &&
          chunk.reason.failure.code === "AUTH") {
        yield {...chunk, reason: {...chunk.reason,
          failure: {...chunk.reason.failure, code: "LOOP_MODEL_AUTH"},
        }}
      } else {
        yield chunk
      }
    }
  }

  closeSession(sessionId) {
    if (!HOST_SESSION.test(sessionId)) return
    this.activeHostSessions.delete(sessionId)
  }

  activeSessions() {
    return [...this.activeHostSessions]
  }
}

function titleCase(value) {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1)
}

function rejected(error) {
  return {
    [Symbol.asyncIterator]() {
      return {
        next() { return Promise.reject(error) },
        return() { return Promise.resolve({done: true}) },
      }
    },
  }
}

/** Keep the provider registry aligned with the trusted helper's connections. */
export class LoopModelRuntime {
  constructor(ctx, actions) {
    this.ctx = ctx
    this.actions = actions
    this.adapter = new LoopModelAdapter(ctx, actions, new Map())
    this.registration = undefined
    this.inFlight = undefined
    this.syncPending = false
    this.refreshInFlight = undefined
    this.refreshTimer = undefined
    this.abort = new AbortController()
    this.disposed = false
  }

  sync() {
    if (this.disposed) return Promise.resolve()
    this.syncPending = true
    if (this.inFlight !== undefined) return this.inFlight
    const operation = (async () => {
      do {
        this.syncPending = false
        await this.syncLocked()
      } while (this.syncPending && !this.disposed)
    })().finally(() => {
      if (this.inFlight === operation) this.inFlight = undefined
    })
    this.inFlight = operation
    return operation
  }

  // The native picker caches its catalog across openings. Refresh the trusted
  // helper, then reread its current scope; never publish the refresh response
  // itself, which may belong to an account that was switched while awaiting it.
  refresh() {
    if (this.disposed) return Promise.resolve()
    if (this.refreshInFlight !== undefined) return this.refreshInFlight
    const operation = (async () => {
      await this.actions.refreshModelConnections({}, this.abort.signal)
      if (!this.disposed) await this.sync()
    })().finally(() => {
      if (this.refreshInFlight === operation) this.refreshInFlight = undefined
    })
    this.refreshInFlight = operation
    return operation
  }

  startRefreshing() {
    if (this.disposed || this.refreshTimer !== undefined) return
    const schedule = () => {
      if (this.disposed) return
      this.refreshTimer = setTimeout(() => {
        void this.refresh().catch(() => {}).finally(schedule)
      }, CATALOG_REFRESH_INTERVAL_MS)
      this.refreshTimer.unref?.()
    }
    schedule()
  }

  projectStatus(status) {
    if (status === null || typeof status !== "object" || !Array.isArray(status.connections)) {
      return status
    }
    return {
      ...status,
      connections: status.connections.map(connection => ({
        ...connection,
        models: projectModelDescriptors(connection?.models),
      })),
    }
  }

  async syncLocked() {
    let response
    try {
      response = await this.actions.modelRuntimeCatalog({})
    } catch {
      return
    }
    if (this.disposed || this.syncPending) return
    response = this.projectStatus(response)
    const rows = Array.isArray(response?.connections) ? response.connections : []
    const hadRoutes = this.adapter.catalogs.size > 0
    const previousRoutes = new Set(this.adapter.catalogs.keys())
    const routes = []
    const catalogs = new Map()
    const names = new Map()
    for (const connection of rows) {
      if (!connection || connection.status !== "active" || typeof connection.connectionId !== "string" ||
          !Array.isArray(connection.models) || connection.models.length === 0) continue
      const route = providerRoute(connection)
      const baseName = String(connection.providerName ?? connection.workspaceName ?? connection.workspaceId ?? "Loop")
      const seen = names.get(baseName) ?? 0
      names.set(baseName, seen + 1)
      const displayName = seen === 0 ? baseName : `${baseName} (${seen + 1})`
      const byPicker = new Map()
      const models = []
      for (const model of connection.models) {
        if (!validDescriptor(model)) continue
        const picker = pickerModelID(model)
        if (byPicker.has(picker)) continue
        const entry = {...withKnownMetadata(model), picker}
        for (const alias of model[PICKER_ALIASES] ?? [picker]) byPicker.set(alias, entry)
        models.push(entry)
      }
      if (models.length === 0) continue
      routes.push(route)
      catalogs.set(route, {
        provider: route,
        name: displayName,
        connectionId: connection.connectionId,
        models,
        byPicker,
      })
    }
    const identityChanged = hadRoutes && routes.length > 0 &&
      routes.every(route => !previousRoutes.has(route))
    if ((rows.length === 0 || identityChanged) && hadRoutes) {
      if (typeof this.actions.closeAllModelSessions === "function") {
        await this.actions.closeAllModelSessions({}).catch(() => {})
      }
      this.adapter.activeHostSessions.clear()
    }
    const previous = this.adapter.catalogs
    if (this.disposed || this.syncPending) return
    // Identical refreshes must not invalidate every client's cached catalog.
    if (isDeepStrictEqual(previous, catalogs)) return
    this.adapter.replaceCatalogs(catalogs)
    try {
      if (this.registration === undefined) {
        if (routes.length > 0) this.registration = this.ctx.llm.registerAdapter(routes, this.adapter)
      } else {
        this.registration.replace(routes)
      }
    } catch (error) {
      this.adapter.replaceCatalogs(previous)
      throw error
    }
  }

  closeSession(sessionId) {
    this.adapter.closeSession(sessionId)
    void this.actions.closeModelHostSession?.({hostSessionId: sessionId}).catch(() => {})
  }

  async dispose() {
    this.disposed = true
    clearTimeout(this.refreshTimer)
    this.abort.abort()
    for (const sessionId of this.adapter.activeSessions()) this.closeSession(sessionId)
    this.registration?.()
    this.registration = undefined
  }
}

function validDescriptor(model) {
  return model !== null && typeof model === "object" &&
    typeof model.id === "string" && model.id.length > 0 &&
    typeof model.name === "string" && model.name.length > 0 &&
    ["loop_proxy", "loop_hosted", "loop_personal"].includes(model.source) &&
    (model.source !== "loop_personal" ||
      (typeof model.providerId === "string" && model.providerId.trim().length > 0)) &&
    ["openai-completions", "openai-responses", "anthropic-messages"].includes(model.wireApi)
}

export function apply(ctx, _config) {
  const actions = ctx.loopHostActions
  const host = ctx.loopHostService
  const runtime = new LoopModelRuntime(ctx, actions)
  ctx.provide("loopModelRuntime", runtime)
  ctx.effect(() => () => { void runtime.dispose() }, "loop-proxy-dsh-models: registration")
  if (typeof host?.addModelConnectionListener === "function") {
    ctx.effect(
      () => host.addModelConnectionListener(() => runtime.sync().catch(() => {})),
      "loop-proxy-dsh-models: settings updates",
    )
  }
  const onDisposed = session => {
    if (HOST_SESSION.test(String(session?.id))) runtime.closeSession(String(session.id))
  }
  ctx.on("session/disposed", onDisposed)
  runtime.startRefreshing()
  void runtime.sync().catch(() => {})
}
