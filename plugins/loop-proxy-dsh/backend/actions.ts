import {LoopHTTP} from "./http.ts"
import {LoopError} from "./errors.ts"

export interface Action {id: string; [field: string]: unknown}
function actionPath(id: string): string {
  if (typeof id !== "string" || !id || id === "." || id === "..") throw new LoopError("loop-host/invalid-request", "Action ID is required")
  return "/actions/" + encodeURIComponent(id)
}
/** Public action protocol, shared by discovery and tool invocation. */
export class ActionClient {
  private http: LoopHTTP
  constructor(http: LoopHTTP) { this.http = http }
  async actions(signal?: AbortSignal, domain = "", personal = false): Promise<Action[]> {
    const actions: Action[] = []
    const seen = new Set<string>()
    let cursor = ""
    for (let page = 0; page < 200; page++) {
      const query = new URLSearchParams({limit: "50", available: "true"})
      if (domain) query.set("domain", domain)
      if (cursor) query.set("cursor", cursor)
      let result
      try {
        const path = personal ? "/actions/delegation-catalog" : "/actions"
        result = await this.http.request("GET", path + "?" + query, undefined, signal)
      } catch (error) {
        // Earlier Loop servers expose only exact-action delegation previews.
        if (personal && error instanceof LoopError && error.status === 404) return []
        throw error
      }
      if (!Array.isArray(result?.actions) || result.actions.some((a: any) => typeof a?.id !== "string" || !a.id)) {
        throw new LoopError("loop-host/backend-invalid", "Invalid Loop action catalog")
      }
      actions.push(...result.actions)
      if (!result.hasMore) return actions
      if (typeof result.nextCursor !== "string" || !result.nextCursor || seen.has(result.nextCursor)) {
        throw new LoopError("loop-host/backend-invalid", "Loop action catalog cursor did not advance")
      }
      cursor = result.nextCursor
      seen.add(cursor)
    }
    throw new LoopError("loop-host/backend-invalid", "Loop action catalog exceeds its page budget")
  }
  delegationPreview(id: string, args: Record<string,unknown> | undefined, signal?: AbortSignal) {
    return this.http.request(args === undefined ? "GET" : "POST", actionPath(id) + "/delegation-preview", args, signal)
  }
  describe(id: string, signal?: AbortSignal): Promise<Action> {
    return this.http.request("GET", actionPath(id), undefined, signal)
  }
  invoke(id: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
    if (!args || typeof args !== "object" || Array.isArray(args) || Object.getPrototypeOf(args) !== Object.prototype && Object.getPrototypeOf(args) !== null) {
      throw new LoopError("loop-host/invalid-request", "Action arguments must be one JSON object")
    }
    return this.http.request("POST", actionPath(id) + "/invocations", args, signal)
  }
}

// Use the Agent-visible directory only. A directory entry identifies a channel;
// ordinary Agent reads and scoped Human reads still enforce their respective ACLs.
export async function readNamedChannel(client: ActionClient, args: Record<string,unknown>, prepare: boolean, signal?: AbortSignal, priorDenial?: LoopError) {
  const {channelName, ...history} = args
  const name = typeof channelName === "string" ? channelName.trim() : ""
  if (!name || name.length > 200 || Object.hasOwn(history, "target")) {
    throw new LoopError("validation", "Supply one channel name or #slug.", 400)
  }
  const result = await client.invoke("workspace.list", {kind:"channels",channelName:name,limit:10}, signal)
  const page = result?.data?.data
  if (!Array.isArray(page?.channels)) throw new LoopError("loop-host/backend-invalid", "Invalid Loop channel directory.")
  if (!page.channels.length) throw new LoopError("channel_not_found", "No matching channel was found. Ask the user for its exact name or #slug.")
  if (page.hasMore || page.channels.length > 1) {
    const choices = page.channels.map((row: {name:string}) => "#"+row.name).join(", ")
    throw new LoopError("channel_ambiguous", "Several channels match. Ask which channel the user means: "+choices)
  }
  const [channel] = page.channels
  const label = name.toLowerCase()
  const slug = label.startsWith("#") ? label.slice(1) : label.replace(/\s+/gu,"-")
  if (!/^chn_[a-z0-9]+$/u.test(channel?.channelId ?? "") || typeof channel.name !== "string" ||
      channel.name !== slug && (name.startsWith("#") || channel.displayName?.toLowerCase() !== label)) {
    throw new LoopError("loop-host/backend-invalid","Loop did not resolve the requested channel to an exact ID.")
  }
  const target = "#"+channel.name
  let direct
  try {
    if (priorDenial) throw priorDenial
    direct = await client.invoke("message.history", {...history,target}, signal)
  } catch (error) {
    if (!prepare || !(error instanceof LoopError) || error.outcomeUnknown || !permissionDenied(error)) throw error
    const canonical = "channel:"+channel.channelId
    const delegationArguments = {...history,target:canonical}
    const delegation = await client.delegationPreview("message.history",delegationArguments,signal)
    if (delegation?.action !== "message.history" || delegation.write !== false || delegation.manage !== false ||
        delegation.workspaceWide !== false || delegation.resourceConstraints?.length !== 1 || delegation.resourceConstraints[0] !== canonical) {
      throw new LoopError("loop-host/backend-invalid","Loop did not confirm read-only authorization for the requested channel.")
    }
    return {error:{code:error.code,message:error.message},delegation,delegationArguments,channelLabel:channel.displayName || target}
  }
  if (direct?.data?.data?.targetKey !== channel.channelId) {
    throw new LoopError("loop-host/conflict", "The returned history does not match the selected Loop channel.")
  }
  return direct
}

export function permissionDenied(error: LoopError) {
  return error.status === 403 && ["action_not_granted","resource_not_granted","forbidden_scope","forbidden","action_unavailable"].includes(error.code)
}
