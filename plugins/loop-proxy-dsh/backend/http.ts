import {randomUUID} from "node:crypto"
import {setTimeout as delay} from "node:timers/promises"
import {LoopError, requireActive} from "./errors.ts"
import {HostCredentialStore} from "./credentials.ts"
import type {Credential} from "./credentials.ts"

// Only connection-establishment failures prove that the rotating token was
// never sent. A reset, read timeout or lost response may follow a committed
// rotation and must still use the explicit same-grant recovery flow.
function refreshWasNotSent(error: unknown, depth = 0): boolean {
  if (!error || typeof error !== "object" || depth > 4) return false
  const value = error as {code?: string; cause?: unknown; errors?: unknown[]}
  if (Array.isArray(value.errors) && value.errors.length) return value.errors.every(item => refreshWasNotSent(item, depth + 1))
  if (["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT"].includes(value.code ?? "")) return true
  return refreshWasNotSent(value.cause, depth + 1)
}

export async function boundedJSON(response: Response, limit = 2 << 20, parse: (raw: string) => any = JSON.parse): Promise<any> {
  const reader = response.body?.getReader()
  if (!reader) throw new LoopError("loop-host/backend-invalid", "Loop returned an empty response")
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const {done, value} = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new LoopError("loop-host/backend-invalid", "Loop response exceeds its size budget")
      chunks.push(value)
    }
    try { return parse(Buffer.concat(chunks).toString("utf8")) }
    catch { throw new LoopError("loop-host/backend-invalid", "Loop returned invalid JSON") }
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

/** Bound to one login; every operation observes logout and account replacement. */
export class TokenManager {
  private store: HostCredentialStore
  private generation: string
  private fetcher: typeof fetch
  private now: () => number
  private recovery: boolean
  constructor(store: HostCredentialStore, credential: Credential, options: {fetch?: typeof fetch, now?: () => number, disconnectRecovery?: boolean} = {}) {
    store.validate(credential)
    this.store = store
    this.generation = credential.generation
    this.fetcher = options.fetch ?? fetch
    this.now = options.now ?? Date.now
    this.recovery = options.disconnectRecovery === true
  }
  private assertCurrent(current: Credential | undefined): asserts current is Credential {
    if (current?.disconnect && !this.recovery) throw new LoopError("loop-host/needs-auth", "Loop disconnect is pending")
    if (!current || current.generation !== this.generation) throw new LoopError("loop-host/needs-auth", "Loop connection changed; sign in again")
  }
  async credential(signal?: AbortSignal, rejectedToken?: string): Promise<Credential> {
    requireActive(signal)
    const operation = randomUUID()
    const waitStarted = performance.now()
    // Publish uncertainty BEFORE sending a rotating refresh token. A process
    // crash or a failed final credential write must never replay the old token.
    for (;;) {
      const claim = await this.store.modify(async current => {
        requireActive(signal)
        this.assertCurrent(current)
        if (current!.refresh_state === "unknown" || (Date.parse(current!.access_expires_at) > this.now() + 60_000 && current!.access_token !== rejectedToken)) return current
        return {...current!, refresh_state: "unknown", refresh_operation: operation, refresh_started_at: this.now()}
      })
      if (claim!.refresh_state !== "unknown") return claim!
      if (claim!.refresh_operation === operation) break
      if (performance.now() - waitStarted >= 25_000 || !claim!.refresh_operation || typeof claim!.refresh_started_at !== "number" || this.now() - claim!.refresh_started_at >= 25_000) {
        if (claim!.refresh_operation) throw new LoopError("loop-host/backend-unavailable", "Loop token refresh is still pending; retry after the connection recovers")
        throw new LoopError("loop-host/needs-auth", "Token refresh outcome is unknown; sign in again")
      }
      try { await delay(50, undefined, {signal}) } catch { requireActive(signal) }
    }
    let failure: LoopError | undefined
    const result = await this.store.modify(async current => {
      this.assertCurrent(current)
      if (current!.refresh_operation !== operation) throw new LoopError("loop-host/needs-auth", "Loop connection changed")
      const {refresh_state, refresh_operation, refresh_started_at, ...clean} = current!
      // A caller may have been cancelled while waiting for the provider lock.
      // No request has been sent yet, so do not poison the shared login.
      if (signal?.aborted) {
        failure = new LoopError("loop-host/cancelled", "Loop request cancelled")
        return clean
      }
      const form = new URLSearchParams({grant_type: "refresh_token", refresh_token: current!.refresh_token, client_id: current!.client_id, resource: current!.resource})
      try {
        const response = await this.fetcher(current!.token_endpoint, {
          method: "POST", redirect: "error", body: form,
          // Once sent, finish and persist rotation independently of a model
          // turn, catalog poll or stream being cancelled during sleep/wake.
          signal: AbortSignal.timeout(20_000),
        })
        if (!response.ok) {
          await response.body?.cancel()
          throw new LoopError("loop-host/needs-auth", "Loop token refresh was rejected", response.status)
        }
        const token = await boundedJSON(response, 64 << 10)
        if (typeof token.access_token !== "string" || !token.access_token || typeof token.refresh_token !== "string" || !token.refresh_token ||
            !Number.isSafeInteger(token.expires_in) || token.expires_in <= 0 || token.expires_in > 31_536_000 ||
            String(token.token_type).toLowerCase() !== "bearer" || (token.resource && token.resource !== current!.resource) ||
            (token.scope !== undefined && (typeof token.scope !== "string" || token.scope !== current!.scope)) ||
            (token.grant_id !== undefined && token.grant_id !== current!.grant_id) ||
            (token.workspace_id !== undefined && token.workspace_id !== current!.workspace_id) ||
            (token.principal_id !== undefined && token.principal_id !== current!.principal_id)) {
          throw new LoopError("loop-host/backend-invalid", "Loop returned an invalid token response")
        }
        return {...clean, access_token: token.access_token, refresh_token: token.refresh_token,
          access_expires_at: new Date(this.now() + token.expires_in * 1000).toISOString(), scope: token.scope || current!.scope}
      } catch (error) {
        if (refreshWasNotSent(error)) {
          failure = new LoopError("loop-host/backend-unavailable", "Loop token refresh could not connect; retry when the network is available")
          return clean
        }
        // A failed read may follow a committed rotation. Persist uncertainty so
        // neither this process nor a restarted Host replays the refresh token.
        failure = error instanceof LoopError ? error : new LoopError("loop-host/needs-auth", "Token refresh outcome is unknown; sign in again", 0, true)
        return {...clean, refresh_state: "unknown"}
      }
    })
    if (failure) throw failure
    requireActive(signal)
    return result!
  }
}

export class LoopHTTP {
  private tokens: TokenManager
  private resource: string
  private fetcher: typeof fetch
  constructor(tokens: TokenManager, resource: string, fetcher: typeof fetch = fetch) {
    this.tokens = tokens
    this.resource = resource
    this.fetcher = fetcher
  }
  async request(method: "GET" | "POST" | "DELETE", suffix: string, body?: unknown, signal?: AbortSignal): Promise<any> {
    if (!suffix.startsWith("/") || suffix.startsWith("//") || suffix.includes("\\") || /(?:^|\/)\.\.(?:\/|$)/u.test(suffix.split("?")[0])) {
      throw new LoopError("loop-host/invalid-request", "Invalid Loop request path")
    }
    const target = new URL(this.resource + suffix)
    if (target.hash || target.origin !== new URL(this.resource).origin || !target.pathname.startsWith(new URL(this.resource).pathname + "/")) {
      throw new LoopError("loop-host/invalid-request", "Invalid Loop request path")
    }
    const credential = await this.tokens.credential(signal)
    if (credential.resource !== this.resource) throw new LoopError("loop-host/conflict", "Loop resource changed")
    const headers: Record<string, string> = {Authorization: "Bearer " + credential.access_token, Accept: "application/json"}
    if (credential.device_credential) headers["X-Loop-Super-Agent-Device"] = credential.device_credential
    let encoded: string | undefined
    if (body !== undefined) {
      try { encoded = JSON.stringify(body) } catch { throw new LoopError("loop-host/invalid-request", "Loop request must be JSON") }
      if (encoded === undefined) throw new LoopError("loop-host/invalid-request", "Loop request must be JSON")
      if (Buffer.byteLength(encoded) > 16 << 20) throw new LoopError("loop-host/invalid-request", "Loop request exceeds its size budget")
      headers["Content-Type"] = "application/json"
    }
    requireActive(signal)
    let response: Response
    try {
      response = await this.fetcher(this.resource + suffix, {method, headers, body: encoded, redirect: "error",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000)})
    } catch {
      throw new LoopError("loop-host/backend-unavailable", "Loop request did not complete; inspect current state before retrying", 0, method !== "GET")
    }
    let result: any
    try { result = await boundedJSON(response, 64 << 10) } catch {
      throw new LoopError("loop-host/backend-invalid", "Loop returned an incomplete or invalid response; inspect current state before retrying", response.status, method !== "GET")
    }
    if (!response.ok) {
      const error = result?.error
      const secrets = [credential.access_token, credential.refresh_token, credential.device_credential].filter((s): s is string => Boolean(s))
      const redact = (text: string) => secrets.reduce((safe, secret) => safe.split(secret).join("[redacted]"), text)
      const code = typeof error?.code === "string" && /^[a-z][a-z0-9_/-]{0,95}$/u.test(error.code) && redact(error.code) === error.code
        ? error.code : "loop-host/backend-invalid"
      let message = typeof error?.message === "string" ? error.message : "Loop rejected the request"
      if (code === "validation" && Array.isArray(error.details?.violations)) {
        for (const violation of error.details.violations.slice(0, 3)) {
          if (typeof violation?.message === "string") {
            const path = typeof violation.path === "string" && violation.path ? violation.path + " " : ""
            message += " " + path + violation.message
          }
        }
      }
      throw new LoopError(code, redact(message).slice(0, 512), response.status)
    }
    return result
  }
}
