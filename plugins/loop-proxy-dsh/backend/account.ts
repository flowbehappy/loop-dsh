import {HostAPI} from "./host-api.ts"
import type {Credential} from "./credentials.ts"
import {LoopError} from "./errors.ts"

export interface AccountSession {
  principalId: string; workspaceId: string; grantId: string; accountName: string
  agentId?: string
  deviceOnly?: true
  pageLaunch?: string; pageOrigin?: string; expiresIn?: number
}
/** Account identity is always checked against the server's current grant. */
export class AccountService {
  private api: HostAPI
  private installation: string
  private pageOrigin: string
  constructor(api: HostAPI, installation: string, pageOrigin: string) {
    this.api = api; this.installation = installation; this.pageOrigin = pageOrigin
  }
  async session(resumePage = false, signal?: AbortSignal): Promise<AccountSession> {
    const credential = await this.api.tokens.credential(signal)
    const body: Record<string,string> = {workspaceId: credential.workspace_id, installationId: this.installation}
    const tokenDevice = credential.login_method === "access_token"
    if (!resumePage && tokenDevice && credential.host_page_proof) {
      Object.assign(body, {pageConsent: "status", pageOrigin: this.pageOrigin, resumeProof: credential.host_page_proof})
    }
    if (resumePage) {
      if (!credential.host_page_proof) throw new LoopError("loop-host/needs-auth", "Reconnect Loop to enable page recovery")
      Object.assign(body, {pageOrigin: this.pageOrigin, resumeProof: credential.host_page_proof})
    }
    let result
    try {
      result = await this.inspect(credential, body, signal)
    } catch (error) {
      // Older servers reject the new status field. Their original device session
      // remains usable, including after an unsuccessful page authorization.
      if (body.pageConsent !== "status" || !(error instanceof LoopError) || error.status !== 400) throw error
      result = await this.inspect(credential, {workspaceId: credential.workspace_id, installationId: this.installation}, signal)
    }
    if (resumePage && (typeof result.pageLaunch !== "string" || !result.pageLaunch || result.pageOrigin !== this.pageOrigin || !Number.isSafeInteger(result.expiresIn) || result.expiresIn <= 0)) {
      throw new LoopError("loop-host/backend-invalid", "Loop page recovery is incomplete")
    }
    return tokenDevice && !resumePage && result.pageAuthorized !== true ? {...result, deviceOnly: true} : result
  }
  async assistantId(signal?: AbortSignal): Promise<string | undefined> {
    const credential = await this.api.tokens.credential(signal)
    const {agentId} = await this.inspect(credential, {workspaceId: credential.workspace_id, installationId: this.installation}, signal)
    if (agentId !== undefined && (typeof agentId !== "string" || !agentId.trim())) {
      throw new LoopError("loop-host/backend-invalid", "Loop returned an invalid assistant identity")
    }
    return agentId
  }
  private async inspect(credential: Credential, body: Record<string,string>, signal?: AbortSignal) {
    const result = await this.api.request("account", "POST", "/session", body, signal, {reauthenticate: true})
    if (result?.principalId !== credential.principal_id || result.workspaceId !== credential.workspace_id || result.grantId !== credential.grant_id) {
      throw new LoopError("loop-host/needs-auth", "Loop connection identity changed")
    }
    return result
  }
  async status(signal?: AbortSignal) {
    const result = await this.session(false, signal)
    return {state: "signed_in", ...(result.deviceOnly ? {deviceOnly:true} : {}), accountPrincipal: result.principalId, workspaceId: result.workspaceId, grantId: result.grantId, accountName: result.accountName}
  }
}
