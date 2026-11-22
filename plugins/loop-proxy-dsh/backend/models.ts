import {randomBytes} from "node:crypto"
import {createServer} from "node:http"
import type {Server, IncomingMessage, ServerResponse} from "node:http"
import {once} from "node:events"
import {Readable} from "node:stream"
import {pipeline} from "node:stream/promises"
import {HostAPI, hostRoot} from "./host-api.ts"
import {LoopError, requireActive} from "./errors.ts"

export interface ModelDescriptor {
  id: string; name: string; source: string; providerId: string; providerName: string; wireApi: string
  presetKey?: string; contextWindow?: number; maxOutputTokens?: number
  inputModalities?: string[]; reasoningEfforts?: string[]
}
export interface ModelInput {
  connectionId: string; hostSessionId: string; modelId: string; providerId?: string
  source: string; wireApi: string; purpose?: string
}
interface Lease {
  input: ModelInput; key: string; sessionId: string; token: string; baseURL: string
  expires: number; refresh: number; generation: number; lastUsed: number
}
const paths: Record<string,string> = {"openai-completions":"/chat/completions", "openai-responses":"/responses", "anthropic-messages":"/messages"}
const sources = new Set(["loop_proxy", "loop_hosted", "loop_personal"])
const blockedHeaders = new Set(["authorization","connection","content-length","content-encoding","cookie","host","proxy-authorization","proxy-connection","set-cookie","te","trailer","transfer-encoding","upgrade","x-api-key"])
function headers(source: Record<string,string | string[] | undefined> | Headers): Record<string,string> {
  const result: Record<string,string> = {}
  const entries = source instanceof Headers ? [...source.entries()] : Object.entries(source)
  const connection = source instanceof Headers ? source.get("connection") : source.connection
  const nominated = new Set(String(connection ?? "").toLowerCase().split(",").map(value => value.trim()))
  for (const [name,value] of entries) {
    const lower = name.toLowerCase()
    if (value !== undefined && !blockedHeaders.has(lower) && !nominated.has(lower) && !lower.startsWith("x-loop-")) result[name] = Array.isArray(value) ? value.join(", ") : value
  }
  return result
}
function validID(value: unknown): value is string { return typeof value === "string" && value.length > 0 && value.length <= 512 && !/[\x00-\x20\x7f]/u.test(value) }

/** A connection-scoped model service. Long-lived OAuth tokens never leave it;
 * the model adapter receives only a short local bridge capability. */
export class ModelService {
  private api: HostAPI
  private installation: string
  private fetcher: typeof fetch
  private control = new AbortController()
  private catalog?: {connectionId:string; workspaceId:string; billingUserId?:string; models:ModelDescriptor[]}
  private leases = new Map<string,Lease>()
  private work = new Map<string,Promise<unknown>>()
  private calls = new Map<string,Set<AbortController>>()
  private closedHosts = new Map<string,number>()
  private generation = 0
  private server?: Server
  private bridgeURL = ""
  private starting?: Promise<void>
  private pending = new Set<Promise<unknown>>()
  private timer?: ReturnType<typeof setInterval>
  private closing?: Promise<void>
  private creating = 0
  private closed = false
  constructor(api: HostAPI, installation: string, fetcher: typeof fetch = fetch) {
    this.api = api; this.installation = installation; this.fetcher = fetcher
  }
  private signal(signal?: AbortSignal): AbortSignal {
    if (this.closed) throw new LoopError("loop-host/unavailable", "Loop model service is stopped")
    return AbortSignal.any([this.control.signal, ...(signal ? [signal] : [])])
  }
  private track<T>(promise: Promise<T>): Promise<T> {
    this.pending.add(promise)
    void promise.finally(() => this.pending.delete(promise)).catch(() => {})
    return promise
  }
  async refreshCatalog(signal?: AbortSignal) {
    const combined = this.signal(signal)
    const generation = this.generation
    const credential = await this.api.tokens.credential(combined)
    const catalog = await this.api.request("models", "GET", "/models", undefined, combined)
    if (catalog?.connectionId !== credential.grant_id || catalog.workspaceId !== credential.workspace_id ||
        (catalog.billingUserId && catalog.billingUserId !== credential.principal_id) || !Array.isArray(catalog.models) || catalog.models.some((model: ModelDescriptor) =>
          !validID(model?.id) || !paths[model.wireApi] || !sources.has(model.source))) {
      throw new LoopError("loop-host/backend-invalid", "Loop model catalog changed identity or contains invalid models")
    }
    requireActive(combined)
    if (generation !== this.generation) throw new LoopError("loop-host/needs-auth", "Loop model connection changed")
    this.catalog = catalog
    return this.runtimeCatalog(combined)
  }
  async runtimeCatalog(signal?: AbortSignal): Promise<any> {
    const combined = this.signal(signal)
    const credential = await this.api.tokens.credential(combined)
    if (!this.catalog) return this.refreshCatalog(combined)
    return {accountPrincipal:credential.principal_id, connections:[{connectionId:credential.grant_id, workspaceId:credential.workspace_id,
      accountPrincipal:credential.principal_id, providerName:"Loop", models:structuredClone(this.catalog.models), status:"active"}]}
  }
  private serial<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.work.get(key) ?? Promise.resolve()
    const promise = previous.catch(() => {}).then(operation)
    this.work.set(key, promise)
    void promise.finally(() => { if (this.work.get(key) === promise) this.work.delete(key) }).catch(() => {})
    return this.track(promise)
  }
  ensureSession(raw: ModelInput, signal?: AbortSignal): Promise<{baseURL:string;localKey:string}> {
    const combined = this.signal(signal)
    const input = {...raw, purpose:raw.purpose || "conversation"}
    if (!validID(input.connectionId) || !validID(input.hostSessionId) || !validID(input.modelId) ||
        (input.providerId !== undefined && !validID(input.providerId)) || !sources.has(input.source) || !paths[input.wireApi] ||
        (input.source === "loop_personal" && !input.providerId) || !["conversation","compaction","session-title"].includes(input.purpose)) {
      return Promise.reject(new LoopError("loop-host/invalid-request", "Invalid Loop model session request"))
    }
    const cache = JSON.stringify([input.connectionId,input.hostSessionId,input.modelId,input.providerId || "",input.source,input.wireApi,input.purpose])
    const generation = this.generation, hostGeneration = this.closedHosts.get(input.hostSessionId) ?? 0
    return this.serial(cache, async () => {
      const assertCurrent = () => {
        requireActive(combined)
        if (generation !== this.generation || hostGeneration !== (this.closedHosts.get(input.hostSessionId) ?? 0)) throw new LoopError("loop-host/target-unavailable", "Loop model session was closed")
      }
      assertCurrent()
      const credential = await this.api.tokens.credential(combined)
      if (credential.grant_id !== input.connectionId) throw new LoopError("loop-host/needs-auth", "Loop model connection changed")
      assertCurrent()
      let lease = this.leases.get(cache)
      if (!lease || Date.now() >= lease.refresh || Date.now() >= lease.expires) {
        let response: any
        if (lease) {
          try { response = await this.api.request("models", "POST", `/sessions/${encodeURIComponent(lease.sessionId)}/refresh`, {hostSessionId:input.hostSessionId}, combined) }
          catch (error) {
            this.drop(cache)
            // A lost reply is not permission to create another remote session.
            if (!(error instanceof LoopError) || ![401,404,410].includes(error.status)) throw error
            lease = undefined
          }
        }
        if (!lease) {
          for (const [key,value] of this.leases) if (value.expires <= Date.now()) this.drop(key)
          if (this.leases.size + this.creating >= 64) throw new LoopError("loop-host/model-session-limit", "Too many Loop model sessions are active")
          this.creating++
          try { response = await this.api.request("models", "POST", "/sessions", {
            hostInstallationId:this.installation, hostSessionId:input.hostSessionId, modelId:input.modelId,
            source:input.source, wireApi:input.wireApi, purpose:input.purpose, ...(input.providerId ? {providerId:input.providerId} : {}),
          }, combined) } finally { this.creating-- }
        }
        const expires = Date.parse(response?.expiresAt), refresh = Date.parse(response?.refreshAt)
        if (!validID(response?.sessionId) || response.connectionId !== input.connectionId || response.modelId !== input.modelId || response.wireApi !== input.wireApi ||
            typeof response.token !== "string" || !response.token || response.baseURL !== hostRoot(credential, "models") + "/v1" || !Number.isFinite(expires) || expires <= Date.now()) {
          throw new LoopError("loop-host/backend-invalid", "Invalid Loop model session")
        }
        try { assertCurrent() } catch (error) {
          await this.api.request("models", "DELETE", `/sessions/${encodeURIComponent(response.sessionId)}`).catch(() => {})
          throw error
        }
        lease = {input, sessionId:response.sessionId, token:response.token, baseURL:response.baseURL, expires,
          refresh:Number.isFinite(refresh) && refresh <= expires ? refresh : expires - 60_000,
          key:lease?.key ?? randomBytes(32).toString("base64url"), generation, lastUsed:Date.now()}
        this.leases.set(cache, lease)
      }
      lease.lastUsed = Date.now()
      await this.ensureBridge()
      assertCurrent()
      return {baseURL:this.bridgeURL, localKey:lease.key}
    })
  }
  private ensureBridge(): Promise<void> {
    if (this.starting) return this.starting
    this.starting = (async () => {
      const signal = this.signal()
      const server = createServer((req,res) => { void this.track(this.serve(req,res)).catch(() => { if (!res.destroyed) res.destroy() }) })
      this.server = server
      server.headersTimeout = 10_000
      server.listen(0,"127.0.0.1")
      await once(server,"listening",{signal})
      requireActive(signal)
      const address = server.address()
      if (!address || typeof address === "string") throw new LoopError("loop-host/backend-unavailable", "Model bridge unavailable")
      this.bridgeURL = `http://127.0.0.1:${address.port}/v1`
      this.timer = setInterval(() => {
        if (this.closed) return
        for (const lease of this.leases.values()) {
          if (lease.refresh <= Date.now() && lease.expires > Date.now()) void this.ensureSession(lease.input).catch(() => {})
        }
      },30_000)
      this.timer.unref()
    })()
    return this.starting
  }
  private async serve(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const authorization = req.headers.authorization ?? ""
    const key = authorization.startsWith("Bearer ") ? authorization.slice(7) : req.headers["x-api-key"]
    const entry = [...this.leases].find(([,lease]) => lease.key === key)
    if (req.method !== "POST" || !["127.0.0.1","::1","::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "")) { res.writeHead(404).end(); return }
    if (!entry || entry[1].expires <= Date.now() || this.closed) { res.writeHead(401).end(); return }
    const [cache,lease] = entry
    if (req.url !== "/v1" + paths[lease.input.wireApi]) { res.writeHead(404).end(); return }
    const controller = new AbortController()
    const active = this.calls.get(cache) ?? new Set<AbortController>(); active.add(controller); this.calls.set(cache,active)
    const signal = AbortSignal.any([controller.signal,this.control.signal])
    const abort = () => controller.abort()
    req.once("aborted",abort); res.once("close",abort)
    try {
      await this.api.tokens.credential(signal)
      const chunks: Buffer[] = []; let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > 32 << 20) { res.writeHead(413).end(); return }
        chunks.push(Buffer.from(chunk))
      }
      requireActive(signal)
      const upstream = await this.fetcher(lease.baseURL + paths[lease.input.wireApi], {method:"POST", redirect:"error",
        headers:{...headers(req.headers), "Accept-Encoding":"identity", Authorization:`Bearer ${lease.token}`}, body:Buffer.concat(chunks), signal})
      if (upstream.status === 401 && this.leases.get(cache)?.token === lease.token) this.drop(cache, false)
      res.writeHead(upstream.status, headers(upstream.headers))
      if (!upstream.body) { res.end(); return }
      await pipeline(Readable.fromWeb(upstream.body as any),res,{signal})
    } catch {
      if (!res.destroyed && !res.headersSent) res.writeHead(signal.aborted ? 499 : 502).end()
      else if (!res.destroyed) res.destroy()
    } finally {
      req.off("aborted",abort); res.off("close",abort)
      active.delete(controller); if (active.size === 0) this.calls.delete(cache)
    }
  }
  private drop(cache: string, abort = true): void {
    this.leases.delete(cache)
    if (abort) for (const controller of this.calls.get(cache) ?? []) controller.abort()
  }
  async closeHostSession(hostSessionId?: string): Promise<{closed:true}> {
    if (hostSessionId) this.closedHosts.set(hostSessionId, (this.closedHosts.get(hostSessionId) ?? 0) + 1)
    else this.generation++
    const closing = [...this.leases].filter(([,lease]) => !hostSessionId || lease.input.hostSessionId === hostSessionId)
    for (const [cache] of closing) this.drop(cache)
    await Promise.all(closing.map(([,lease]) => this.api.request("models", "DELETE", `/sessions/${encodeURIComponent(lease.sessionId)}`).catch(() => {})))
    return {closed:true}
  }
  dispose(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true; this.generation++; this.control.abort()
    if (this.timer) clearInterval(this.timer)
    for (const cache of this.leases.keys()) this.drop(cache)
    this.closing = (async () => {
      await this.starting?.catch(() => {})
      this.server?.closeAllConnections()
      if (this.server?.listening) await new Promise<void>(resolve => this.server!.close(() => resolve()))
      while (this.pending.size) await Promise.allSettled([...this.pending])
      this.catalog = undefined; this.leases.clear(); this.closedHosts.clear()
    })()
    return this.closing
  }
}
