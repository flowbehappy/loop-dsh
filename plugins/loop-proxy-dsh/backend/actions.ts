import {randomUUID} from "node:crypto"
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
async function resolveChannel(client: ActionClient, channelName: unknown, signal?: AbortSignal) {
  const name = typeof channelName === "string" ? channelName.trim() : ""
  if (/(?:^|\/)channel-invites\//iu.test(name)) {
    throw new LoopError("validation", "This is a Human channel invitation. Supply the channel display name or #slug; use the invitation in Loop with a Human account.", 400)
  }
  if (!name || name.length > 200) {
    throw new LoopError("validation", "Supply one channel name or #slug.", 400)
  }
  const result = await client.invoke("workspace.list", {kind:"channels",channelName:name,limit:10}, signal)
  const page = result?.data?.data
  if (!Array.isArray(page?.channels)) throw new LoopError("loop-host/backend-invalid", "Invalid Loop channel directory.")
  if (!page.channels.length) throw new LoopError("channel_not_found", "No matching channel was found in the visible directory. Clarify which channel the user means.")
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
  return channel
}

/** Resolve existing channel references before consent, then freeze the same input
 * for execution. Only protocol locator fields are examined; content is opaque. */
export async function prepareDelegation(client: ActionClient, action: string, args: Record<string,unknown> | undefined, signal?: AbortSignal) {
  const domain = action.split(".")[0]
  const keys = domain === "message" ? ["target"] : domain === "task" ? ["channel", "board"] : []
  let input = args
  const resources = new Set<string>()
  const resolved = new Map<string,string>()
  for (const key of keys) {
    const value = input?.[key]
    if (typeof value !== "string" || !/^#[a-z0-9][a-z0-9-]*$/u.test(value)) continue
    let id = resolved.get(value)
    if (!id) {
      id = (await resolveChannel(client,value,signal)).channelId as string
      resolved.set(value,id)
    }
    resources.add("channel:"+id)
    input = {...input, [key]:key === "target" ? "channel:"+id : key === "board" ? {kind:"channel",scopeId:id} : id}
  }
  const delegation = await client.delegationPreview(action,input,signal)
  if (resources.size && (delegation?.action !== action || delegation.workspaceWide !== false ||
      !Array.isArray(delegation.resourceConstraints) || [...resources].some(resource => !delegation.resourceConstraints.includes(resource)))) {
    throw new LoopError("loop-host/backend-invalid","Loop did not confirm the resolved channel authorization.")
  }
  return {delegation, ...(input !== args ? {delegationArguments:input} : {})}
}

export async function joinNamedChannel(client: ActionClient, name: unknown, self: () => Promise<string>, signal?: AbortSignal) {
  const channel = await resolveChannel(client, name, signal)
  if (channel.joined !== true) {
    const agentId = await self()
    try {
      await client.invoke("channel.agent-add", {channelId:channel.channelId, requestId:randomUUID(), agents:[{agentId}]}, signal)
    } catch (error) {
      if (!(error instanceof LoopError) || error.outcomeUnknown || !permissionDenied(error)) throw error
      throw new LoopError(error.code, `Found #${channel.name}. Loop declined self-join for this assistant (${agentId}): ${error.message}. The assistant’s owner can use Add members → Agents in this channel if allowed to invite.`, error.status)
    }
    const verified = await resolveChannel(client, "#"+channel.name, signal)
    if (verified.channelId !== channel.channelId || verified.joined !== true) {
      throw new LoopError("loop-host/result-unknown","Loop has not confirmed membership in the requested channel. Check membership before retrying.",0,true)
    }
  }
  return {data:{data:{channelId:channel.channelId,name:channel.name,joined:true}}}
}

async function exactConsent(client: ActionClient, action: string, args: Record<string,unknown>, resource: string, signal?: AbortSignal, denial?: LoopError) {
  const delegation = await client.delegationPreview(action,args,signal)
  if (delegation?.action !== action || delegation.write !== (action === "message.send" || action === "task.create") || delegation.manage !== false ||
      delegation.workspaceWide !== false || delegation.resourceConstraints?.length !== 1 || delegation.resourceConstraints[0] !== resource) {
    throw new LoopError("loop-host/backend-invalid","Loop did not confirm the exact "+(action === "message.history" ? "read-only authorization" : "write authorization")+".")
  }
  return {error:{code:denial?.code ?? "human_confirmation_required",message:denial?.message ?? "Confirm the requested Human identity."},delegation,delegationArguments:args}
}

export async function createNamedChannelTask(client: ActionClient, args: Record<string,unknown>, prepare: boolean, signal?: AbortSignal) {
  const {channelName, tasks} = args
  if (Object.keys(args).some(key => key !== "channelName" && key !== "tasks") ||
      !Array.isArray(tasks) || tasks.length !== 1 || !tasks[0] ||
      Object.keys(tasks[0]).some(key => !["title","assignee","description"].includes(key)) ||
      typeof tasks[0].title !== "string" || !tasks[0].title.trim() ||
      typeof tasks[0].assignee !== "string" || !/^[a-z0-9_]+$/u.test(tasks[0].assignee)) {
    throw new LoopError("validation", "Supply one task title and an exact assignee member ID for the named channel.", 400)
  }
  const channel = await resolveChannel(client, channelName, signal)
  const input = {board:{kind:"channel",scopeId:channel.channelId}, tasks}
  let result
  try {
    result = await client.invoke("task.create", input, signal)
  } catch (error) {
    if (!(error instanceof LoopError) || error.outcomeUnknown) throw error
    if (prepare && permissionDenied(error)) {
      return {...await exactConsent(client, "task.create", {...input,requestId:randomUUID()}, "channel:"+channel.channelId, signal, error),channelLabel:"#"+channel.name}
    }
    if ([400,403,404].includes(error.status)) {
      throw new LoopError(error.code, `Found #${channel.name} (${channel.channelId}, joined=${channel.joined}). ${error.message} Keep this board and assignee.`, error.status)
    }
    throw error
  }
  const data = result?.data?.data
  const created = data?.tasks
  const board = created?.[0]?.channelRef ?? data?.channelRef
  if (created?.length !== 1 || !created[0]?.taskId || ![channel.channelId, "#"+channel.name].includes(board) ||
      created[0].assigneeProfile?.memberId !== tasks[0].assignee) {
    throw new LoopError("loop-host/result-unknown",`Check the create receipt for ${created?.[0]?.taskId || "the requested task"} on #${channel.name} (${channel.channelId}) before retrying. Returned board: ${board ?? "unspecified"}, assignee: ${created?.[0]?.assigneeProfile?.memberId ?? "unspecified"}.`,0,true)
  }
  return {...result, resolvedChannelId:channel.channelId}
}

export async function readNamedChannel(client: ActionClient, args: Record<string,unknown>, prepare: boolean, signal?: AbortSignal, priorDenial?: LoopError) {
  const {channelName,readAs="agent",...history} = args
  if (Object.hasOwn(history,"target") || !["agent","human"].includes(String(readAs))) throw new LoopError("validation","Invalid channel history request.",400)
  let channel
  try {
    channel = await resolveChannel(client,channelName,signal)
  } catch (error) {
    if (!(error instanceof LoopError) || error.code !== "channel_not_found" || typeof channelName !== "string" || channelName.trim().startsWith("#")) throw error
    // Search the same visible directory for a correction. Directory matches do
    // not authorize reading content, and a match in a description is not a name.
    const query = channelName.trim()
    const found = await client.invoke("workspace.list",{kind:"channels",query,limit:10},signal)
    const page = found?.data?.data
    if (!Array.isArray(page?.channels) || page.hasMore || page.channels.length !== 1) throw error
    const [entry] = page.channels
    if (typeof entry?.name !== "string" || !/^[a-z0-9][a-z0-9-]*$/u.test(entry.name) ||
        typeof entry.displayName !== "string" || !entry.displayName.toLowerCase().includes(query.toLowerCase())) throw error
    const exact = await resolveChannel(client,"#"+entry.name,signal)
    if (exact.displayName !== entry.displayName) throw error
    const candidate = {channelId:exact.channelId,displayName:exact.displayName,slug:"#"+exact.name}
    return {error:{code:"channel_name_incomplete",message:"The exact name did not match. The directory found one related channel. If it identifies the requested conversation, retry the read using its exact slug. Otherwise clarify the name.",candidate}}
  }
  const target = "#"+channel.name
  let direct
  if (readAs !== "human" && !priorDenial) {
    try { direct = await client.invoke("message.history",{...history,target},signal) }
    catch (error) {
      if (!(error instanceof LoopError) || error.outcomeUnknown || !permissionDenied(error)) throw error
      priorDenial = error
    }
  }
  if (readAs === "human" || priorDenial) {
    if (!prepare) throw priorDenial ?? new LoopError("forbidden","Human confirmation is unavailable for this request.",403)
    const canonical = "channel:"+channel.channelId
    return {...await exactConsent(client,"message.history",{...history,target:canonical},canonical,signal,priorDenial),channelLabel:channel.displayName || target}
  }
  if (direct?.data?.data?.targetKey !== channel.channelId) {
    throw new LoopError("loop-host/conflict", "The returned history does not match the selected Loop channel.")
  }
  return direct
}

export async function requestHumanDM(client: ActionClient, action: string, args: Record<string,unknown>, signal?: AbortSignal) {
  const {asHuman,...input} = args
  const peer = /^dm:@([a-z0-9]{12})$/u.exec(String(input.target))?.[1]
  if (asHuman !== true || !peer || !["message.send","message.history"].includes(action)) throw new LoopError("validation","Use the exact Human member ID.",400)
  return exactConsent(client,action,input,"dm:@"+peer,signal)
}

export async function shareDocumentLink(client: ActionClient,args: Record<string,unknown>,base: string,workspace: string,signal?: AbortSignal) {
  const {channelName,documentId,clientMessageId,requireRecipientAccess=false} = args
  if (!/^doc_[a-z0-9_-]+$/u.test(String(documentId)) || typeof clientMessageId !== "string" || !clientMessageId.trim() ||
      typeof requireRecipientAccess !== "boolean" || Object.keys(args).some(key=>!["channelName","documentId","clientMessageId","requireRecipientAccess"].includes(key))) throw new LoopError("validation","Document, channel and retry key are required.",400)
  const channel = await resolveChannel(client,channelName,signal)
  const receipt = await client.invoke("kb.doc-read",{documentId,format:"text",maxBytes:4},signal)
  const doc = receipt?.data?.data
  if (doc?.documentId !== documentId || !/^kb_[a-z0-9_-]+$/u.test(doc?.kbId) || !/^ws_[a-z0-9_-]+$/u.test(workspace)) throw new LoopError("loop-host/backend-invalid","Loop did not verify this document.")
  const url = base+"/w/"+workspace+"/kb/"+doc.kbId+"/documents/"+documentId
  if (requireRecipientAccess) {
    // A sender-side document read cannot establish access for every channel recipient.
    return {data:{data:{state:"not_sent",recipientAccess:"unverified",webUrl:url}},accessNote:"Delivery requires confirmed recipient access. No channel message was sent."}
  }
  const sent = await client.invoke("message.send",{target:"#"+channel.name,expectedScopeId:channel.channelId,content:url,clientMessageId},signal)
  if (!sent?.data?.data?.messageId) throw new LoopError("loop-host/backend-invalid","Loop did not confirm delivery.")
  return {...sent,webUrl:url,recipientAccess:"unverified",accessNote:"Recipients use their existing knowledge base permissions."}
}

export function permissionDenied(error: LoopError) {
  return error.status === 403 && ["action_not_granted","resource_not_granted","forbidden_scope","forbidden","action_unavailable"].includes(error.code)
}
