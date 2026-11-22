import {createHash, randomBytes, timingSafeEqual} from "node:crypto"
import type {RequestListener} from "node:http"
import {createServer} from "node:http"
import {once} from "node:events"
import {HostCredentialStore, serviceURL} from "./credentials.ts"
import type {CredentialProvider, Credential} from "./credentials.ts"
import {boundedJSON} from "./http.ts"
import {LoopError, requireActive} from "./errors.ts"

export interface LoginOptions {
  callbackBroker?:{registerCallback(handler:RequestListener):{url:string;dispose():void}}
  accessToken?: string
  provider: CredentialProvider
  server: string
  installation: string
  pageOrigin: string
  workspace?: string
  includeSync?: boolean
  signal?: AbortSignal
  fetch?: typeof fetch
}
export interface HostLogin {
  authorizationURL: string
  result: Promise<{credential: Credential, pageLaunch?: {assertion: string, origin: string, expiresAt: string}}>
  cancel(): void
}
const randomToken = () => randomBytes(32).toString("base64url")
function sameState(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
function invalid(message: string): never { throw new LoopError("loop-host/backend-invalid", message) }

/** OAuth PKCE callback listener lives inside the Host and has a bounded lifetime.
 * UI receives only the consent URL; token exchange and publication stay here.
 */
export async function beginHostLogin(options: LoginOptions): Promise<HostLogin> {
  const base = serviceURL(options.server)
  const pageOrigin = options.pageOrigin === "dsh-app://app" ? options.pageOrigin : new URL(serviceURL(options.pageOrigin)).origin
  if (pageOrigin !== options.pageOrigin || !options.installation) throw new LoopError("loop-host/invalid-request", "Invalid Host login options")
  const control = new AbortController()
  const signal = AbortSignal.any([control.signal, AbortSignal.timeout(300_000), ...(options.signal ? [options.signal] : [])])
  const fetcher = options.fetch ?? fetch
  const endpoint = (raw: string) => {
    const url = serviceURL(raw)
    if (new URL(url).origin !== new URL(base).origin) invalid("Loop OAuth endpoint belongs to another server")
    return url
  }
  const issuer = base + "/api/v1/auth/oauth"
  const issuerURL = new URL(issuer)
  const discoveryURL = issuerURL.origin + "/.well-known/oauth-authorization-server" + issuerURL.pathname
  async function request(url: string, init: RequestInit = {}) {
    requireActive(signal)
    try {
      const response = await fetcher(endpoint(url), {...init, redirect: "error", signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)])})
      if (url === discoveryURL && response.ok && response.headers.get("content-type")?.toLowerCase().startsWith("text/html")) {
        await response.body?.cancel()
        throw new LoopError("loop-host/login-discovery", "The server returned a web page at its OAuth discovery address. Check your team's Loop server address.")
      }
      if (!response.ok) {
        await response.body?.cancel()
        if (new Headers(init.headers).has("Authorization") && [401, 403].includes(response.status)) {
          throw new LoopError("loop-host/needs-auth", "DSH access token was rejected")
        }
        invalid("Loop OAuth request was rejected")
      }
      return await boundedJSON(response, 64 << 10)
    } catch (error) {
      if (error instanceof LoopError) throw error
      requireActive(signal)
      throw new LoopError("loop-host/backend-unavailable", "Loop OAuth request did not complete")
    }
  }
  const metadata = await request(discoveryURL)
  if (metadata.issuer !== issuer) invalid("Loop authorization-server issuer mismatch")
  endpoint(metadata.authorization_endpoint)
  const registrationEndpoint = endpoint(metadata.registration_endpoint)
  const tokenEndpoint = endpoint(metadata.token_endpoint)
  const state = randomToken(), verifier = randomToken(), pageProof = randomToken()
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  let settle!: (params: URLSearchParams) => void
  let reject!: (reason: unknown) => void
  let accepted = false
  const callback = new Promise<URLSearchParams>((resolve, fail) => { settle = resolve; reject = fail })
  // Setup may fail before a caller receives result; attach the rejection handler now.
  void callback.catch(() => {})
  const callbackHandler:RequestListener = (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1")
    res.setHeader("Cache-Control", "no-store")
    res.setHeader("Referrer-Policy", "no-referrer")
    if (options.accessToken || req.method !== "GET" || url.pathname !== "/callback") { res.writeHead(404).end(); return }
    if (!sameState(url.searchParams.get("state") ?? "", state)) { res.writeHead(400).end("Invalid callback"); return }
    if (accepted) { res.writeHead(409).end("Callback already received"); return }
    accepted = true
    res.setHeader("Content-Type", "text/html; charset=utf-8")
    res.end('<!doctype html><meta name="referrer" content="no-referrer"><title>Loop</title><script>history.replaceState(null,"",location.pathname)</script><p>请返回 DeepSeek 查看授权结果。</p>', () => settle(url.searchParams))
  }
  const server = createServer(callbackHandler)
  let remoteCallback:{url:string;dispose():void}|undefined
  server.headersTimeout = 5000
  server.requestTimeout = 10_000
  const abort = () => reject(new LoopError("loop-host/cancelled", "Loop login cancelled or expired"))
  signal.addEventListener("abort", abort, {once: true})
  const close = async () => {
    remoteCallback?.dispose()
    signal.removeEventListener("abort", abort)
    server.closeAllConnections()
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()))
  }
  try {
    requireActive(signal)
    let redirectURI:string
    if(options.callbackBroker){remoteCallback=options.callbackBroker.registerCallback(callbackHandler);redirectURI=serviceURL(remoteCallback.url)}
    else{
      server.listen(0, "127.0.0.1")
      await once(server, "listening", {signal})
      const address = server.address()
      if (!address || typeof address === "string") invalid("OAuth callback listener unavailable")
      redirectURI = `http://127.0.0.1:${address.port}/callback`
    }
    const redirectURIs = [redirectURI, pageOrigin]
    const registration = await request(registrationEndpoint, {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({client_name: "Loop DeepSeek Connector", redirect_uris: redirectURIs, token_endpoint_auth_method: "none"})})
    if (typeof registration.client_id !== "string" || !registration.client_id || registration.token_endpoint_auth_method !== "none" ||
        !Array.isArray(registration.redirect_uris) || !redirectURIs.every(uri => registration.redirect_uris.includes(uri))) invalid("Invalid Loop client registration")
    const scope = "loop.host offline_access"
    const authorization = new URL(base + "/oauth/host/authorize")
    const params = {response_type: "code", client_id: registration.client_id, redirect_uri: redirectURI, scope,
      state, code_challenge: challenge, code_challenge_method: "S256", host_installation_id: options.installation,
      include_sync: String(options.includeSync ?? true), page_origin: pageOrigin,
      page_resume_challenge: createHash("sha256").update(pageProof).digest("hex"), device_label: "DeepSeek Harness"}
    authorization.search = new URLSearchParams(params).toString()
    if (options.workspace) {
      authorization.searchParams.set("workspace_id", options.workspace)
      authorization.searchParams.set("resource", base + "/api/v1/workspaces/" + encodeURIComponent(options.workspace) + "/external/agent")
    }
    if (options.accessToken) {
      const login = await request(base + "/api/v1/auth/external-host/token-login", {
        method:"POST", headers:{"Content-Type":"application/json",Authorization:"Bearer " + options.accessToken},
        body:JSON.stringify({installationId:options.installation,authorization:{
          responseType:"code",clientId:registration.client_id,redirectUri:redirectURI,workspaceId:options.workspace,
          state,scope,codeChallenge:challenge,codeChallengeMethod:"S256",deviceLabel:"DeepSeek Harness",pageOrigin}})
      })
      if (typeof login.redirectTo !== "string") invalid("Invalid DSH login response")
      const redirect=new URL(login.redirectTo)
      if (redirect.origin + redirect.pathname !== redirectURI || redirect.searchParams.get("state") !== state ||
          redirect.searchParams.get("iss") !== issuer || redirect.searchParams.get("workspace_id") !== login.workspaceId ||
          redirect.searchParams.has("page_launch")) {
        invalid("Mismatched DSH login response")
      }
      settle(redirect.searchParams)
    }
    const result = (async () => {
      try {
        const params = await callback
        requireActive(signal)
        if (params.has("error") || !params.get("code")) invalid("Loop authorization was not completed")
        const workspace = options.workspace || params.get("workspace_id") || ""
        if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$/u.test(workspace) || (params.has("workspace_id") && params.get("workspace_id") !== workspace)) invalid("Invalid callback workspace")
        const assertion = params.get("page_launch")
        const lifetime = Number(params.get("page_launch_expires_in"))
        if (!options.accessToken && (!assertion || params.get("page_origin") !== pageOrigin || !Number.isSafeInteger(lifetime) || lifetime <= 0 || lifetime > 3600)) invalid("Invalid Loop page launch")
        const resource = base + "/api/v1/workspaces/" + encodeURIComponent(workspace) + "/external/agent"
        const token = await request(tokenEndpoint, {method: "POST", body: new URLSearchParams({grant_type: "authorization_code",
          code: params.get("code")!, client_id: registration.client_id, redirect_uri: redirectURI, resource, code_verifier: verifier, loop_metadata: "true"})})
        if (token.scope !== scope || token.workspace_id !== workspace || !token.grant_id || !token.principal_id ||
            typeof token.access_token !== "string" || !token.access_token || typeof token.refresh_token !== "string" || !token.refresh_token ||
            String(token.token_type).toLowerCase() !== "bearer" || !Number.isSafeInteger(token.expires_in) || token.expires_in <= 0 || token.expires_in > 31_536_000 ||
            (token.resource && token.resource !== resource)) invalid("Invalid Loop Host authority")
        const store = new HostCredentialStore(options.provider, base, workspace, options.installation)
        const credential = await store.publish({version: 1, principal_id: token.principal_id, workspace_id: workspace,
          client_id: registration.client_id, token_endpoint: tokenEndpoint, resource, grant_id: token.grant_id, scope,
          access_token: token.access_token, refresh_token: token.refresh_token,
          access_expires_at: new Date(Date.now() + token.expires_in * 1000).toISOString(), ...(options.accessToken ? {login_method:"access_token" as const} : {host_page_proof:pageProof}), host_source:"deepseek_harness", host_callback_uri:redirectURI}, signal)
        return {credential, ...(assertion ? {pageLaunch:{assertion, origin: pageOrigin, expiresAt: new Date(Date.now() + lifetime * 1000).toISOString()}} : {})}
      } finally { await close() }
    })()
    void result.catch(() => {})
    return {authorizationURL: authorization.href, result, cancel: () => control.abort()}
  } catch (error) {
    control.abort()
    await close()
    throw error
  }
}
