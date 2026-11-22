import {isAbsolute} from "node:path"
import {readFileSync} from "node:fs"
import z from "@deepseek-ai/schemastery"
import {RemoteError, TypertRemoteService} from "@deepseek-ai/dsh-typert-protocol"
import {defineTool} from "@deepseek-ai/dsh-tools"

import {BindingStore} from "./binding-store.mjs"
import {HumanTaskConsent, requestsHumanIdentity, userText} from "./host-human-task.mjs"
import {LoopCollaborationRuntime} from "./host-collaboration.mjs"
import {saveExplicitDefaultModel} from "./host-default-model.mjs"
import {LoopSkillRuntime} from "./host-loop-skills.mjs"
import {LoopHostRuntime} from "./host-runtime.mjs"
import remote from "./remote.mjs"
import {registerHarnessIdentity, registerHarnessSkill} from "./managed-skill.mjs"

export const name = "loop-proxy-dsh-host"
export const inject = [
  "remoteAccess",
  "agentDefaultModel",
  "agents",
  "sessions",
  "sessionPersistence",
  "sessionProjections",
  "sessionQuery",
  "systemPrompt",
  "tools",
  "typert",
  "workspaceRegistry",
]

export const Config = z.object({
  stateHome: z.string().required(),
  accountPrincipal: z.string().default(""),
  serviceBaseUrl: z.string().default(""),
  workerRoot: z.string().default(""),
  workerAgentPreset: z.string().default(""),
})

function stateHome(config) {
  const value = String(config.stateHome ?? "").trim()
  if (!isAbsolute(value)) throw new Error("loop-proxy-dsh-host: stateHome must be absolute")
  return value
}

export default class LoopHostService extends TypertRemoteService {
  static inject = inject
  static Config = Config

  constructor(ctx, config) {
    super(ctx, "loopHostService", {namespace: "loopHost"})
    const stateRoot = stateHome(config)
    registerHarnessIdentity(ctx)
    this.runtime = new LoopHostRuntime({
      harnessProfile: ctx.get("loopManagedConfig")?.kind ?? readFileSync(new URL("./flavor", import.meta.url), "utf8").trim(),
      store: new BindingStore({
        root: stateRoot,
        defaultServiceBaseUrl: String(config.serviceBaseUrl ?? ""),
      }),
      sessions: ctx.sessions,
      sessionQuery: ctx.sessionQuery,
      workspaces: ctx.workspaceRegistry,
      actions: ctx.get("loopHostActions"),
      accountPrincipal: String(config.accountPrincipal ?? ""),
      defaultServiceBaseUrl: String(config.serviceBaseUrl ?? ""),
    })
    this.collaboration = new LoopCollaborationRuntime({
      ctx,
      sessions: ctx.sessions,
      getSessionController: () => ctx.get("sessionController"),
      defineTool,
      uiStateHome: stateRoot,
      withSessionContext: (sessionId, signal, operation) => this.runtime.withSessionContext(sessionId, signal, operation),
    })
    this.humanTasks = new HumanTaskConsent({
      owner: (id,signal,action) => this.runtime.humanTaskOwner(id,signal,action),
      current: id => this.collaboration.currentUserInputs.get(id)?.message,
      request: (...args) => this.runtime.humanConnectionRequest(...args),
    })
    this.channelReads = new WeakSet()
    const registerActionTool = (name,description,parameters,toCommand) => {
      ctx.tools.register(defineTool({
        name,description,parameters,
        output:{schema:{type:"string"},render:(_args,value)=>[{type:"text",text:value}]},
        execute:async (args,exec) => {
          const sessionId = exec.agent?.session?.id
          if (!sessionId || !this.humanTasks.current(sessionId)) throw new Error("A current user request is required.")
          const [action,input] = toCommand(args)
          const result = await this.agentCommand(sessionId,{verb:"call",name:action,input:JSON.stringify(input)},exec.signal)
          if (result.failed) throw new Error(result.output)
          return result.output
        },
      }),{when:({agent})=>this.canUseAgentActions() && !this.collaboration.isFeedbackTurn(agent?.session?.id)})
    }
    const channelName = {type:"string",required:true,description:"Exact display name or #slug from the user."}
    registerActionTool("loop_channel_history","Read or summarize messages in a named Loop channel. The Agent may see only some participants. For the user's own view or a complete summary from their perspective choose readAs=human, which requests single-channel read-only access.",{
      channelName,readAs:{type:"string",enum:["agent","human"]},limit:{type:"integer",description:"Number of recent messages (1–100)."},
    },args=>["message.history",args])
    registerActionTool("loop_direct_message","Read or send a private Loop message in the user's conversation with a colleague. Resolve the exact Human member with workspace.list first. Uses the user's own identity with scoped confirmation.",{
      memberId:{type:"string",required:true,description:"Exact Loop Human member ID."},
      operation:{type:"string",required:true,enum:["read","send"]},
      content:{type:"string",description:"Exact requested message for send."},
      clientMessageId:{type:"string",description:"Stable retry key required for send. Reuse it when retrying."},
    },({memberId,operation,content,clientMessageId})=>{
      if (!/^[a-z0-9]{12}$/u.test(memberId) || !["read","send"].includes(operation)) throw new Error("Select the exact Loop member and operation.")
      if (operation==="send" && (!content?.trim() || !clientMessageId?.trim())) throw new Error("Supply content and a stable retry key.")
      return [operation==="send"?"message.send":"message.history",{target:"dm:@"+memberId,asHuman:true,...(operation==="send"?{content,clientMessageId}:{})}]
    })
    registerActionTool("loop_share_document_link","Share a Loop knowledge-base document link in a named Loop channel. Sends only the verified URL. Recipient access depends on existing KB permissions. For an ordinary request to send a link so colleagues can open it, send the link. Set requireRecipientAccess only for an explicit instruction to withhold delivery unless access is verified.",{
      channelName,documentId:{type:"string",required:true},requireRecipientAccess:{type:"boolean",description:"Default false. True only for an explicit condition such as 'only send after confirming everyone has access'."},clientMessageId:{type:"string",required:true,description:"Stable retry key."},
    },args=>["kb.share-document-link",args])
    registerActionTool("loop_schedule_message","Schedule a message on the Loop server for delivery in a named Loop channel. The schedule is stored and managed in Loop.",{
      target:{type:"string",required:true,description:"Exact Loop channel #slug."},template:{type:"string",required:true},
      name:{type:"string",required:true},delaySeconds:{type:"integer",description:"Delay from creation in seconds."},
      at:{type:"string",description:"Absolute ISO timestamp with timezone, instead of delaySeconds."},idempotencyKey:{type:"string",required:true},
    },({target,template,name,delaySeconds,at,idempotencyKey})=>{
      if (!/^#[a-z0-9][a-z0-9-]*$/u.test(target) || (delaySeconds===undefined)===(at===undefined)) throw new Error("Supply an exact #slug and one delivery time.")
      return ["scheduled-message.create",{target,template,name,idempotencyKey,schedule:at===undefined?{kind:"after",seconds:delaySeconds}:{kind:"at",at}}]
    })
    ctx.effect(() => this.runtime.addSessionInvalidationListener(ids => {
      for (const id of ids) this.collaboration.clearSessionActivation(id)
    }), "loop-proxy-dsh-host: invalidate collaboration intents")
    this.runtime.feedbackGuard = id => this.collaboration.isFeedbackTurn(id)
      ? this.collaboration.authorizeAgentCall.bind(this.collaboration) : undefined
    this.skills = new LoopSkillRuntime(ctx, {
      getActions: () => this.ctx.get("loopHostActions"),
    })
    this.skills.installPreStep()
    // Optional injection preserves older hosts while native Skill-capable hosts
    // advertise the same small entry in new and existing workspaces.
    ctx.inject(["skills"], child => registerHarnessSkill(child))
    ctx.effect(() => ctx.typert.register({
      package: "@pingkai/loop-dsh",
      face: "host",
      schemas: [],
      model: {services: [], events: [], objects: []},
      invocations: remote.descriptors,
    }), "loop-proxy-dsh-host: remote declarations")
    ctx.inject(["loopHostActions"], child => {
      this.runtime.setActions(child.loopHostActions)
      this.collaboration.setActions(child.loopHostActions)
      this.skills.setActions(child.loopHostActions)
      const principal = child.loopHostActions.currentAccountPrincipal?.()
      if (typeof principal === "string" && principal !== "") {
        void this.runtime.setAccountPrincipal(principal)
      }
    })
    ctx.on("session/created", session => {
      const workspace = ctx.workspaceRegistry.list().find(item => item.sessionIds.includes(session.id))
      if (workspace !== undefined) {
        void this.runtime.captureSessionForProjectSync(workspace.id, session.id).catch(() => {})
      }
    })
    ctx.on("dispose", () => {
      this.humanTasks.dispose()
      this.collaboration.dispose()
      this.skills.dispose()
    })

  }

  syncCapturePolicy() { return this.runtime.syncCapturePolicy() }

  humanStatus(request, signal) {
    return this.remote(signal, () => this.runtime.humanConnectionRequest("humanStatus", request, signal))
  }

  beginHumanLogin(request, signal) {
    return this.remote(signal, () => this.runtime.humanConnectionRequest("beginHumanLogin", request, signal))
  }

  completeHumanLogin(request, signal) {
    return this.remote(signal, () => this.runtime.humanConnectionRequest("completeHumanLogin", request, signal))
  }

  cancelHumanLogin(request, signal) {
    return this.remote(signal, () => this.runtime.humanConnectionRequest("cancelHumanLogin", request, signal))
  }

  disconnectHuman(request, signal) {
    return this.remote(signal, () => this.runtime.humanConnectionRequest("disconnectHuman", request, signal))
  }

  getSyncPreferences(request, signal) {
    return this.remote(signal, () => this.runtime.getSyncPreferences())
  }

  setSyncPreferences(request, signal) {
    return this.remote(signal, () => this.runtime.setSyncPreferences(request))
  }

  setSessionUploadStatus(sessionId, status) {
    this.runtime.setSessionUploadStatus(sessionId, status)
  }

  /** Update the trusted account after the authenticated Loop login changes. */
  setAccountPrincipal(principal) {
    return this.runtime.setAccountPrincipal(String(principal ?? ""))
  }

  /** Attach the trusted helper-backed action adapter. */
  setActions(actions) {
    this.runtime.setActions(actions)
    this.collaboration.setActions(actions)
  }

  collaborationStatus(request, signal) {
    return this.remote(signal, () => this.collaboration.status(request, signal))
  }

  collaborationSnapshot(request, signal) {
    return this.remote(signal, () => this.collaboration.snapshot(request, signal))
  }

  collaborationBoards(request, signal) {
    return this.remote(signal, () => this.collaboration.boards(request, signal))
  }

  collaborationBind(request, signal) {
    return this.remote(signal, () => this.collaboration.bind(request, signal))
  }

  collaborationDirectory(request, signal) {
    return this.remote(signal, () => this.collaboration.directory(request, signal))
  }

  prepareCollaborationIntent(request, signal) {
    return this.remote(signal, () => this.collaboration.prepareIntent(request, signal))
  }

  bindCollaborationIntent(request, signal) {
    return this.remote(signal, () => this.collaboration.bindIntent(request, signal))
  }

  bindCollaborationContinuation(request, signal) {
    return this.remote(signal, () => this.collaboration.bindContinuation(request, signal))
  }

  cancelCollaborationIntent(request, signal) {
    return this.remote(signal, () => this.collaboration.cancelIntent(request, signal))
  }





  followupCollaborationTask(request, signal) {
    return this.remote(signal, () => this.collaboration.followup(request, signal))
  }

  collaborationInspect(request, signal) {
    return this.remote(signal, () => this.collaboration.inspect(request, signal))
  }

  collaborationReconcile(request, signal) {
    return this.remote(signal, () => this.collaboration.reconcile(request, signal))
  }

  collaborationEvents(request, signal) {
    return this.collaboration.stream(request, signal)
  }

  knowledgeCatalog(request, signal) {
    return this.remote(signal, () => this.skills.knowledgeCatalog(request, signal))
  }

  skillCatalog(request, signal) {
    return this.remote(signal, () => this.skills.catalog(request, signal))
  }

  skillContent(request, signal) {
    return this.remote(signal, () => this.skills.content(request, signal))
  }

  skillCatalogEvents(request, signal) {
    return this.skills.stream(request, signal)
  }

  status(request, signal) {
    return this.remote(signal, () => this.runtime.status(request, signal))
  }

  connectAccount(request, signal) {
    return this.remote(signal, () => this.runtime.connectAccount(request, signal))
  }

  beginBind(request, signal) {
    return this.remote(signal, () => this.runtime.beginBind(request, signal))
  }

  completeBind(request, signal) {
    return this.remote(signal, () => this.runtime.completeBind(request, signal))
  }

  disconnectAccount(request, signal) {
    return this.remote(signal, () => this.runtime.disconnectAccount(request, signal))
  }

  unbind(request, signal) {
    return this.remote(signal, () => this.runtime.unbind(request, signal))
  }

  sessionContext(request, signal) {
    return this.remote(signal, () => this.runtime.sessionContext(request))
  }

  sessionSyncEnabled(sessionId) {
    return this.runtime.sessionSyncEnabled(sessionId)
  }

  sessionSyncTarget(sessionId) {
    return this.runtime.sessionSyncTarget(sessionId)
  }

  currentSyncProfile() {
    return this.runtime.currentSyncProfile()
  }

  addServerProfileListener(listener) {
    return this.runtime.addServerProfileListener(listener)
  }

  addSessionInvalidationListener(listener) {
    return this.runtime.addSessionInvalidationListener(listener)
  }

  syncStatus(request, signal) {
    return this.remote(signal, () => this.runtime.syncStatus(request, signal))
  }

  setSync(request, signal) {
    return this.remote(signal, () => this.runtime.setSync(request, signal))
  }

  createProject(request, signal) {
    return this.remote(signal, () => this.runtime.createProject(request, signal))
  }

  globalPage(request, signal) {
    return this.remote(signal, () => this.runtime.globalPage(request, signal))
  }

  globalServerStatus(request, signal) {
    return this.remote(signal, () => this.runtime.globalServerStatus(request, signal))
  }

  globalServerWorkspaceStatus(request, signal) {
    return this.remote(signal, () => this.runtime.globalServerWorkspaceStatus(request, signal))
  }

  configureGlobalServer(request, signal) {
    return this.remote(signal, () => this.runtime.configureGlobalServer(request, signal))
  }

  configureGlobalServerWorkspace(request, signal) {
    return this.remote(signal, () => this.runtime.configureGlobalServerWorkspace(request, signal))
  }

  openLoopPage(request, signal) {
    return this.remote(signal, () => this.runtime.openLoopPage(request, signal))
  }

  retrySync(request, signal) {
    return this.remote(signal, () => this.runtime.retrySync(request, signal))
  }

  projectSyncSettings(request, signal) {
    return this.remote(signal, () => this.runtime.projectSyncSettings(request, signal))
  }

  setProjectSyncSettings(request, signal) {
    return this.remote(signal, () => this.runtime.setProjectSyncSettings(request, signal))
  }

  syncProjects(request, signal) {
    return this.remote(signal, () => this.runtime.syncProjects(request, signal))
  }

  changeProjectDirectory(request, signal) {
    return this.remote(signal, () => this.runtime.changeProjectDirectory(request, signal))
  }

  async modelStatus(request, signal) {
    const models = this.ctx.get("loopModelRuntime")
    await models?.sync()
    const result = await this.remote(signal, () => this.runtime.modelStatus(request, signal))
    return models?.projectStatus?.(result) ?? result
  }

  async setDefaultModel(request, signal) {
    return this.remote(signal, async () => {
      const status = request.kind === "loop"
        ? await this.modelStatus({}, signal)
        : null
      return await saveExplicitDefaultModel({
        request,
        status,
        currentServerRevision: this.runtime.serverRevision,
        currentAccountPrincipal: this.runtime.accountPrincipal,
        currentWorkspaceId: this.runtime.loopWorkspaceId,
        getCurrentIdentity: () => ({
          currentServerRevision: this.runtime.serverRevision,
          currentAccountPrincipal: this.runtime.accountPrincipal,
          currentWorkspaceId: this.runtime.loopWorkspaceId,
        }),
        llm: this.ctx.get("llm"),
        agentDefaultModel: this.ctx.get("agentDefaultModel"),
        configEditor: this.ctx.get("configEditor"),
        signal,
      })
    })
  }

  async refreshModelConnections(request, signal) {
    const result = await this.remote(signal, () => this.runtime.refreshModelConnections(request, signal))
    return this.ctx.get("loopModelRuntime")?.projectStatus?.(result) ?? result
  }

  async disconnectModelConnection(request, signal) {
    const result = await this.remote(signal, () => this.runtime.disconnectModelConnection(request, signal))
    return this.ctx.get("loopModelRuntime")?.projectStatus?.(result) ?? result
  }

  addModelConnectionListener(listener) {
    return this.runtime.addModelConnectionListener(listener)
  }

  canUseAgentActions() {
    return this.runtime.canUseAgentActions()
  }

  humanCommand(sessionId, command, signal) {
    if (command.name === "task.create" && command.verb === "call") this.collaboration.checkDispatchRetry(sessionId,command)
    if (command.verb === "authorize") return this.humanTasks.authorize(sessionId, command, signal)
    checkDocumentShare(command,this.humanTasks.current(sessionId),this.runtime.serviceBaseUrl)
    this.checkChannelRead(this.humanTasks.current(sessionId),command)
    const task = this.humanTasks.forCommand(sessionId, command)
    return this.runtime.humanCommand(sessionId, command, signal, () => this.humanTasks.current(sessionId) === task.message, task.grant)
  }

  humanTaskEvents({sessionId}, signal) {
    return this.humanTasks.events(sessionId, signal)
  }

  decideHumanTask(request, signal) {
    return this.remote(signal, () => this.humanTasks.decide(request))
  }

  async agentCommand(sessionId, command, signal, description) {
    if (command.name === "task.create" && command.verb === "call") this.collaboration.checkDispatchRetry(sessionId,command)
    const message = this.humanTasks.current(sessionId)
    if (command.verb === "pick") {
      const selected = await this.humanTasks.pick(sessionId,message,command.name,signal)
      return {failed:false,output:JSON.stringify(selected)}
    }
    checkDocumentShare(command,message,this.runtime.serviceBaseUrl)
    if (command.verb === "call" && ["message.send","message.history"].includes(command.name) && requestsHumanIdentity(message)) {
      const args = JSON.parse(command.input)
      if (/^dm:@[a-z0-9]{12}$/u.test(args.target)) command = {...command,input:JSON.stringify({...args,asHuman:true})}
      else if (command.name === "message.history" && (args.channelName || /^#[a-z0-9][a-z0-9-]*$/u.test(args.target))) {
        const {target,...page} = args
        command = {...command,input:JSON.stringify({...page,channelName:args.channelName || target,readAs:"human"})}
      }
    }
    this.checkChannelRead(message,command)
    const args = command.verb === "call" && command.name === "message.history" ? JSON.parse(command.input) : {}
    const named = message && (typeof args.channelName === "string" || /^#[a-z0-9][a-z0-9-]*$/u.test(args.target))
    // A display-name lookup can suspend at consent. Keep concurrent fallback
    // reads out of this user turn while the named read is pending or failed.
    if (named && args.channelName) this.channelReads.add(message)
    try {
      const result = await this.runtime.agentCommand(sessionId, command, signal, this.humanTasks.canOffer(message))
      if (named && this.humanTasks.current(sessionId) !== message) throw new Error("The originating user request changed.")
      if (!result.delegation) {
        if (named && result.failed) this.channelReads.add(message)
        else if (named && args.channelName) this.channelReads.delete(message)
        return result
      }
      if (named) this.channelReads.add(message)
      const input = result.delegationArguments ? JSON.stringify(result.delegationArguments) : command.input
      const summary = result.channelLabel ? "Read channel history: "+result.channelLabel : description
      const grant = await this.humanTasks.offer(sessionId, message, result.owner, result.delegation, summary, signal, input, result.agentDenied)
      const response = await this.runtime.humanCommand(sessionId, {...command,input,principal:"human",connection:grant.policy.connection}, signal,
        () => this.humanTasks.current(sessionId) === message, grant)
      if (named && !response.failed) {
        const expected = result.delegationArguments?.target
        if (expected && "channel:"+JSON.parse(response.output)?.data?.data?.targetKey !== expected) {
          throw new Error("Loop did not return history for the authorized channel.")
        }
        this.channelReads.delete(message)
      }
      return response
    } catch (error) {
      if (named) this.channelReads.add(message)
      throw error
    }
  }

  checkChannelRead(message,command) {
    if (command.verb === "call" && ["message.history","message.get","message.search"].includes(command.name) && this.channelReads.has(message)) {
      throw new Error("The named channel read is pending or could not finish. Stop here and ask the user before reading another channel.")
    }
  }

  async remote(signal, operation) {
    if (signal?.aborted) throw new RemoteError("gateway/cancelled", "Loop Host request was cancelled", {})
    try {
      return await operation()
    } catch (error) {
      if (signal?.aborted) throw new RemoteError("gateway/cancelled", "Loop Host request was cancelled", {})
      if (error instanceof RemoteError) throw error
      const code = typeof error?.code === "string" && error.code.startsWith("loop-host/")
        ? error.code
        : "gateway/internal"
      throw new RemoteError(code, bounded(error?.message ?? String(error)), {
        ...(error?.challenge === undefined ? {} : {challenge: error.challenge}),
      })
    }
  }
}

// The generic send action can also be chosen for a link share. A retrieved KB
// document is authorized for its reader, independently of the destination.
export function checkDocumentShare(command,message,base) {
  if (!base || command.verb !== "call" || command.name !== "message.send") return
  const instruction = userText(message)
  if (!instruction) return
  const {content,target,attachmentIds} = JSON.parse(command.input)
  if (typeof content !== "string" || !content.includes("/documents/")) return
  const links = content.match(/(?:https?:\/\/[^\s<>()]+)?\/(?:w\/ws_[a-z0-9_-]+\/)?kb\/kb_[a-z0-9_-]+\/documents\/doc_[a-z0-9_-]+/giu) ?? []
  const origin = new URL(base).origin
  const boundLinks = links.filter(link=>URL.canParse(link,base) && new URL(link,base).origin === origin)
  if (!boundLinks.length) return
  const extra=boundLinks.reduce((text,link)=>text.replace(link,""),content).trim()
  if (!attachmentIds?.length && (!extra || instruction.includes(content.trim()))) return
  throw new Error("The proposed message includes text alongside a Loop document link. For a link share, use loop_share_document_link with the exact channel, document ID and the original retry key, or send just the URL. To send additional prose, confirm its exact wording with the user first. No message was sent to "+target+".")
}

function bounded(value) {
  return value.replace(/\s+/g, " ").slice(0, 512)
}
