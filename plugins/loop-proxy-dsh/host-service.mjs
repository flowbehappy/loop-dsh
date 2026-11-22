import {isAbsolute} from "node:path"
import {readFileSync} from "node:fs"
import z from "@deepseek-ai/schemastery"
import {RemoteError, TypertRemoteService} from "@deepseek-ai/dsh-typert-protocol"
import {defineTool} from "@deepseek-ai/dsh-tools"

import {BindingStore} from "./binding-store.mjs"
import {HumanTaskConsent} from "./host-human-task.mjs"
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
      owner: (id,signal) => this.runtime.humanTaskOwner(id,signal),
      current: id => this.collaboration.currentUserInputs.get(id)?.message,
      request: (...args) => this.runtime.humanConnectionRequest(...args),
    })
    this.channelReads = new WeakSet()
    ctx.tools.register(defineTool({
      name:"loop_channel_history",
      description:"Read and summarize the conversation in a named Loop channel. Pass the user's literal channel name or #slug. Resolves the directory, asks for single-channel read access when needed, and returns the verified channel's messages.",
      parameters:{
        channelName:{type:"string",required:true,description:"Exact display name or #slug from the user."},
        limit:{type:"integer",description:"Number of recent messages (1–100)."},
      },
      output:{schema:{type:"string"},render:(_args,value)=>[{type:"text",text:value}]},
      execute:async (args,exec) => {
        const sessionId = exec.agent?.session?.id
        if (!sessionId || !this.humanTasks.current(sessionId)) throw new Error("A current user request is required.")
        const result = await this.agentCommand(sessionId,{verb:"call",name:"message.history",input:JSON.stringify(args)},exec.signal)
        if (result.failed) throw new Error(result.output)
        return result.output
      },
    }),{when:({agent})=>this.canUseAgentActions() && !this.collaboration.isFeedbackTurn(agent?.session?.id)})
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
      const grant = await this.humanTasks.offer(sessionId, message, result.owner, result.delegation, summary, signal, input)
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

function bounded(value) {
  return value.replace(/\s+/g, " ").slice(0, 512)
}
