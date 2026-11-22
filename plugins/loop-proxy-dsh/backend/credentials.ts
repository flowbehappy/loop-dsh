import {createHash, randomUUID} from "node:crypto"
import {LoopError, requireActive} from "./errors.ts"

export type GrantRecord = {kind: "grant", payload: unknown}
/** DSH owns persistence, cross-process locking and notifications. */
export interface CredentialProvider {
  readRecord(key: string): Promise<unknown>
  modifyRecord(key: string, mutate: (current: any) => Promise<any>): Promise<any>
}

export interface Credential {
  version: 1
  generation: string
  principal_id: string
  workspace_id: string
  client_id: string
  token_endpoint: string
  resource: string
  grant_id: string
  scope: string
  access_token: string
  refresh_token: string
  access_expires_at: string
  disconnect?: {input: Record<string, any>; created?: boolean; browserURL?:string; expiresAt?:string; receipt?: Record<string, any>}
  host_callback_uri?: string
  host_source?: string
  login_method?: "access_token"
  host_page_proof?: string
  device_credential?: string
  refresh_state?: "unknown"
  refresh_operation?: string
  refresh_started_at?: number
}

export function serviceURL(raw: string): string {
  let url: URL
  try { url = new URL(raw) } catch { throw new LoopError("loop-host/invalid-request", "Invalid Loop URL") }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.hostname.endsWith(".localhost")
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && local))) {
    throw new LoopError("loop-host/invalid-request", "Loop requires HTTPS or local HTTP without credentials")
  }
  return url.href.replace(/\/+$/u, "")
}

function decode(record: any): Credential | undefined {
  if (record === undefined) return undefined
  if (record?.kind !== "grant" || record.payload?.schema !== 1) throw new LoopError("loop-host/credential-unavailable", "Unsupported Loop credential record")
  if (record.payload.state === "signed-out") return undefined
  const value = record.payload.credential
  if (record.payload.state !== "connected" || !value || value.version !== 1 ||
      ["generation", "principal_id", "workspace_id", "client_id", "token_endpoint", "resource", "grant_id", "access_token", "refresh_token"].some(key => typeof value[key] !== "string" || !value[key]) ||
      typeof value.scope !== "string" || !Number.isFinite(Date.parse(value.access_expires_at))) {
    throw new LoopError("loop-host/credential-unavailable", "Invalid Loop credential record")
  }
  return structuredClone(value)
}

function encode(credential: Credential | undefined): GrantRecord {
  return {kind: "grant", payload: credential
    ? {schema: 1, state: "connected", credential}
    : {schema: 1, state: "signed-out"}}
}

/** A tombstone lets logout use the same atomic mutation as token rotation. */
export class HostCredentialStore {
  readonly key: string
  readonly server: string
  readonly workspace: string
  readonly resource: string
  private provider: CredentialProvider
  private installation: string
  private human?: {account: string; connection: "business" | "apps"; policyKey?: string}
  constructor(provider: CredentialProvider, server: string, workspace: string, installation: string, human?: {account: string; connection: "business" | "apps"; policyKey?: string}) {
    this.provider = provider
    this.server = serviceURL(server)
    this.workspace = workspace
    this.installation = installation
    this.human = human && {...human}
    if (!workspace || !installation || human && !human.account) throw new LoopError("loop-host/invalid-request", "Workspace and installation are required")
    const identity = [this.server, workspace, installation, ...(human ? [human.account, human.connection, ...(human.policyKey ? [human.policyKey] : [])] : [])]
    this.key = (human ? "loop-host/human-" : "loop-host/connection-") + createHash("sha256").update(JSON.stringify(identity)).digest("hex")
    this.resource = this.server + "/api/v1/workspaces/" + encodeURIComponent(this.workspace) + "/external/" + (human ? "human" : "agent")
  }
  validate(value: Credential): void {
    const invalidHuman = this.human && (value.principal_id !== this.human.account ||
      value.token_endpoint !== this.server + "/api/v1/auth/oauth/human/token" || !/^[\x21-\x7e]+$/u.test(value.access_token) ||
      value.host_callback_uri !== undefined || value.host_source !== undefined || value.host_page_proof !== undefined || value.device_credential !== undefined || value.disconnect !== undefined)
    if (value.resource !== this.resource || value.workspace_id !== this.workspace || invalidHuman ||
        new URL(serviceURL(value.token_endpoint)).origin !== new URL(this.server).origin) {
      throw new LoopError("loop-host/conflict", "Loop credential does not match this connection")
    }
  }
  async read(): Promise<Credential | undefined> {
    const value = decode(await this.provider.readRecord(this.key))
    if (value) this.validate(value)
    return value
  }
  async modify(mutate: (current: Credential | undefined) => Promise<Credential | undefined>): Promise<Credential | undefined> {
    const record = await this.provider.modifyRecord(this.key, async current => {
      const value = decode(current)
      if (value) this.validate(value)
      const next = await mutate(value)
      if (next) this.validate(next)
      return JSON.stringify(next) === JSON.stringify(value) ? undefined : encode(next)
    })
    return decode(record)
  }
  /** Model revocation removes normal authority but atomically retains the exact
   * revoked grant solely for a later full disconnect, including after restart. */
  async revokeModel(generation:string,guard:()=>boolean):Promise<boolean> {
    let removed=false
    await this.provider.modifyRecord(this.key,async record=>{
      const current=decode(record)
      if(!current || current.generation!==generation)return undefined
      this.validate(current)
      if(current.disconnect || !guard())throw new LoopError("loop-host/conflict","Loop disconnect owns this connection")
      removed=true
      return {kind:"grant",payload:{schema:1,state:"signed-out",disconnectRecovery:current}}
    })
    return removed
  }
  private disconnectCredential(record:any):Credential|undefined {
    const current=decode(record)
    const value=current ?? (record?.payload?.disconnectRecovery===undefined?undefined:decode(encode(record.payload.disconnectRecovery)))
    if(value)this.validate(value)
    return value
  }
  async readForDisconnect():Promise<Credential|undefined> {
    return this.disconnectCredential(await this.provider.readRecord(this.key))
  }
  async freezeDisconnect(mutate:(current:Credential|undefined)=>Promise<Credential|undefined>):Promise<Credential|undefined> {
    const record=await this.provider.modifyRecord(this.key,async record=>{
      const current=this.disconnectCredential(record),next=await mutate(current)
      if(next){
        this.validate(next)
        if(!next.disconnect)throw new LoopError("loop-host/conflict","Disconnect recovery must stay frozen")
      }
      return encode(next)
    })
    return decode(record)
  }
  async publish(value: Omit<Credential, "generation">, signal?: AbortSignal, expected?: {generation: string | undefined}): Promise<Credential> {
    const credential = {...value, generation: randomUUID()}
    // Decode before saving, so an incomplete response cannot poison the provider.
    decode(encode(credential))
    const saved = await this.modify(async current => {
      requireActive(signal)
      if(current?.disconnect)throw new LoopError("loop-host/conflict","Finish pending Loop disconnect before signing in")
      if(expected && current?.generation!==expected.generation)throw new LoopError("loop-host/conflict","Loop connection changed during login")
      return credential
    })
    if (signal?.aborted) {
      await this.logout(credential.generation)
      requireActive(signal)
    }
    return saved!
  }
  /** Ordinary logout is generation-fenced and can never consume a pending or
   * completed disconnect. Account disconnect supplies its exact operation and
   * durable receipt, so only that state transition may remove the tombstone. */
  async logout(generation: string, options?: {disconnectOperationId?: string; guard?: () => boolean}): Promise<boolean> {
    let removed = false
    await this.modify(async current => {
      if (!current || current.generation !== generation) return current
      if (options?.guard && !options.guard()) throw new LoopError("loop-host/conflict", "Loop connection changed during logout")
      const operationId = options?.disconnectOperationId
      if (current.disconnect) {
        const receipt = current.disconnect.receipt
        if (!operationId || current.disconnect.input?.operationId !== operationId ||
            receipt?.operationId !== operationId || receipt.status !== "completed" ||
            receipt.installationId !== this.installation || receipt.workspaceId !== this.workspace) {
          throw new LoopError("loop-host/conflict", "Pending Loop disconnect owns this credential")
        }
      } else if (operationId) {
        throw new LoopError("loop-host/conflict", "Confirmed Loop disconnect state is unavailable")
      }
      removed = true
      return undefined
    })
    return removed
  }
}
