import {parseWire, stringifyWire} from "./codec.ts"
import {TokenManager, boundedJSON} from "./http.ts"
import {LoopError, requireActive} from "./errors.ts"
import type {Credential} from "./credentials.ts"

export type HostArea = "models" | "account" | "sync" | "workspace"
/** Fixed public Host protocol roots, never a caller-supplied credential target. */
export function hostRoot(credential: Credential, area: HostArea): string {
  const ending = `/api/v1/workspaces/${encodeURIComponent(credential.workspace_id)}/external/agent`
  if (!credential.resource.endsWith(ending) || !credential.scope.split(/\s+/u).includes("loop.host")) {
    throw new LoopError("loop-host/needs-auth", "A Loop Host connection is required")
  }
  const base = credential.resource.slice(0, -ending.length)
  return base + (area === "models" ? `/api/v1/external-model/workspaces/${encodeURIComponent(credential.workspace_id)}`
    : area === "account" ? "/api/v1/auth/external-host" : area === "workspace" ? `/api/v1/workspaces/${encodeURIComponent(credential.workspace_id)}` : "/api/v1/host-sync")
}
export class HostAPI {
  readonly tokens: TokenManager
  private fetcher: typeof fetch
  constructor(tokens: TokenManager, fetcher: typeof fetch = fetch) { this.tokens = tokens; this.fetcher = fetcher }
  async request(area: HostArea, method: "GET" | "POST" | "DELETE" | "PUT", path: string, body?: unknown, signal?: AbortSignal,
    options: {reauthenticate?: boolean; lossless?: boolean; hostInstallationProof?:string} = {}): Promise<any> {
    if (!/^\/[a-zA-Z0-9_/?=&.%:+-]*$/u.test(path) || path.startsWith("//")) throw new LoopError("loop-host/invalid-request", "Invalid Host API path")
    let credential = await this.tokens.credential(signal)
    const root = hostRoot(credential, area)
    const url = new URL(root + path)
    if (!url.pathname.startsWith(new URL(root).pathname + "/")) throw new LoopError("loop-host/invalid-request", "Invalid Host API path")
    let encoded: string | undefined
    if (body !== undefined) {
      try { encoded = options.lossless ? stringifyWire(body,{sortKeys:false}) : JSON.stringify(body) } catch { throw new LoopError("loop-host/invalid-request", "Invalid Host request") }
      if (encoded === undefined || Buffer.byteLength(encoded) > 2 << 20) throw new LoopError("loop-host/invalid-request", "Host request is too large")
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      requireActive(signal)
      const headers: Record<string,string> = {Authorization: `Bearer ${credential.access_token}`, Accept: "application/json"}
      if (encoded !== undefined) headers["Content-Type"] = "application/json"
      if(options.hostInstallationProof)headers["X-Loop-Host-Installation-Proof"]=options.hostInstallationProof
      if (credential.device_credential) headers["X-Loop-Super-Agent-Device"] = credential.device_credential
      let response: Response
      try { response = await this.fetcher(url, {method, headers, body: encoded, redirect: "error",
        signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(signal ? [signal] : [])])}) }
      catch { requireActive(signal); throw new LoopError("loop-host/backend-unavailable", "Loop Host request did not complete", 0, method !== "GET") }
      // Only an explicitly read-safe operation may refresh after a 401.
      if (response.status === 401 && options.reauthenticate && attempt === 0) {
        await response.body?.cancel()
        credential = await this.tokens.credential(signal, credential.access_token)
        continue
      }
      if (!response.ok) {
        await response.body?.cancel()
        const code = ({401:"needs-auth",403:"waiting-for-access",404:"target-unavailable",409:"conflict",429:"rate-limited"} as Record<number,string>)[response.status] ?? "backend-unavailable"
        // Some tool surfaces retain only the message. Use the bounded local
        // classification, never a server body, credential, URL or target ID.
        throw new LoopError("loop-host/" + code, `Loop Host request was rejected (HTTP ${response.status}; ${code})`, response.status)
      }
      if (response.status === 204) { await response.body?.cancel(); return undefined }
      try { return await boundedJSON(response,area === "sync" ? 4 << 20 : 2 << 20,options.lossless ? parseWire : JSON.parse) }
      catch { throw new LoopError("loop-host/backend-invalid", "Invalid Loop Host response", response.status, method !== "GET") }
    }
    throw new LoopError("loop-host/needs-auth", "Loop sign-in is required")
  }
}
