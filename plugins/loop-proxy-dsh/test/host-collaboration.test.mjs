import assert from "node:assert/strict"
import {createHash} from "node:crypto"
import {once} from "node:events"
import {createServer} from "node:http"
import {setTimeout as delay} from "node:timers/promises"
import {WebSocketServer} from "ws"
import {CollaborationService} from "../backend/collaboration.ts"
import {CollaborationInbox} from "../backend/collaboration-inbox.ts"
import {CollaborationStore} from "../backend/collaboration-store.ts"
import {CollaborationWatch} from "../backend/collaboration-watch.ts"
import {publicValue, stringifyWire} from "../backend/codec.ts"
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import test from "node:test"

import {
  LoopCollaborationRuntime,
  createCollaborationReceiptProjection,
  createCollaborationUserMessage,
} from "../host-collaboration.mjs"
import {createLoopProxyBridge} from "../host.mjs"
import {CollaborationUIJournal} from "../host-collaboration-ui-journal.mjs"

const SESSION_ID = "session-11111111-2222-3333-4444-555555555555"
const DEVICE_BINDING_ID = "extbind_1"
const AGENT_MEMBER_ID = "member_worker"

function eventScope(sessionId = SESSION_ID) {
  return {
    workspaceId: "wsp_1",
    sessionId,
    bindingId: "cbind_1",
    bindingEpoch: "3",
    deviceBindingId: DEVICE_BINDING_ID,
    agentMemberId: AGENT_MEMBER_ID,
  }
}

function runtimeFixture(actions = {}, options = {}) {
  actions = {
    async collaborationAuthorize() {
      return {authorized: true}
    },
    ...actions,
  }
  const listeners = new Map()
  let projection
  let state
  let seq = 0
  const session = {id: SESSION_ID}
  const agent = {
    session,
    status: "idle",
    inbox: {"next-step": [], "next-turn": [], remove(id) {
      for (const target of ["next-step", "next-turn"]) {
        const index = this[target].findIndex(message => message.id === id)
        if (index >= 0) return Boolean(this[target].splice(index, 1))
      }
      return false
    }},
    sent: [],
    send(message, target, interrupt) {
      this.sent.push({message, target, interrupt})
      this.inbox[target].push(message)
    },
  }
  agent.inbox.nextStep = agent.inbox["next-step"]
  agent.inbox.nextTurn = agent.inbox["next-turn"]
  const ctx = {
    sessions: {
      get: id => id === SESSION_ID ? session : undefined,
      flush: async () => true,
    },
    sessionProjections: {
      register(definition) {
        projection = definition
        state = definition.init()
        return () => { projection = undefined }
      },
      stateOf() {
        return options.projectionState ?? state
      },
    },
    systemPrompt: {
      getSectionOrder: () => 5000,
      sections: [],
      section(definition) {
        this.sections.push(definition)
        return () => {}
      },
      context(definition) {
        this.contextDefinitions ??= []
        this.contextDefinitions.push(definition)
        return () => {}
      },
    },
    tools: {
      register(definition, registrationOptions) {
        options.toolRegistrations?.push({definition, registrationOptions})
        return definition
      },
    },
    on(name, listener) {
      listeners.set(name, listener)
      return () => listeners.delete(name)
    },
    get(name) {
      if (name === "goals") return this.goals
      if (name === "sessionController") {
        return {resolveAgent: async () => ({agent})}
      }
    },
  }
  const collaboration = new LoopCollaborationRuntime({
    ctx,
    sessions: ctx.sessions,
    actions: () => actions,
    getSessionController: () => ctx.get("sessionController"),
    defineTool: options.defineTool,
    withSessionContext: options.withSessionContext,
  })
  return {
    actions,
    agent,
    ctx,
    collaboration,
    emit(name, ...args) {
      if (name === "agent/pre-step" && args[0].messages?.length) {
        const messages = args[0].messages
        for (const data of [{inserted: messages}, {removedCount: messages.length}]) {
          state = projection.apply(state, {type: "agent/inbox/spliced", seq: ++seq, data: {target: "next-turn", start: 0, ...data}})
        }
      }
      if (name === "session/event") state = projection.apply(state, args[1])
      return listeners.get(name)?.(...args)
    },
    projection: () => projection,
  }
}

test("Human writes require a local user message admitted into this turn", async () => {
  const f = runtimeFixture()
  const local = {id: "local", role: "user", source: {kind: "user", rpcId: "request-1"}}
  const synthetic = {id: "synthetic", role: "user", source: {kind: "user"}}
  const remote = {id: "remote", role: "user", source: {kind: "plugin", rpcId: "remote-request"}}
  const enter = (messages, admitted = messages) => f.emit("agent/pre-step", {agent: f.agent, messages}, async () => ({kind: "enter", messages: admitted}))
  const hasInput = () => f.collaboration.currentUserInputs.has(SESSION_ID)
  await enter([remote, synthetic], [remote, synthetic, local])
  assert.equal(hasInput(), false)
  await enter([local], [remote])
  assert.equal(hasInput(), false)
  await enter([local])
  assert.equal(hasInput(), true)
  f.emit("session/event", f.agent.session, {type: "turn/end"})
  assert.equal(hasInput(), false)
  await enter([remote])
  assert.equal(hasInput(), false)
})

function visibleToolNames(registrations, agent) {
  const context = {agent, modelSelection: undefined, signal: new AbortController().signal}
  return registrations
    .filter(({registrationOptions}) => registrationOptions?.when?.(context) === true)
    .map(({definition}) => definition.name)
    .sort()
}

function naturalSelectionFixture(overrides = {}) {
  const calls = []
  const scope = {...eventScope(), boardId: "chn_1", bindingRevision: "3", coordinatorAgentId: "agt_self",
    serverBaseUrl: "https://loop.example.test", accountId: "human_1", installationId: "installation_1"}
  const context = {defaultChannelId: "chn_1", projectId: "", loopWorkspaceId: "wsp_1", agent: {id: "agt_self"}}
  const registrations = []
  const f = runtimeFixture({
    async collaborationDirectory(request) {
      calls.push(["directory", request])
      return {cacheKey: "dsh-current", entries: [{targetId: request.query, memberId: request.query, targetType: "agent",
        agentId: "agt_worker", displayName: "Worker", visible: true, capability: {delegable: true}}]}
    },
    async collaborationStatus() { return {state: "unbound"} },
    async collaborationBind(request) { calls.push(["bind", request]); return {scope} },
    async collaborationWatch(request) { calls.push(["watch", request]) },
    async collaborationPrepareIntent(request) { calls.push(["prepare", request]); return {intentRef: "natural-intent"} },
    async collaborationBindIntent(request) { calls.push(["bindIntent", request]); return {state: "bound"} },
    async collaborationActivateIntent(request) { calls.push(["activate", request]); return {state: "activated"} },
    async collaborationAction(request) { calls.push(["action", request]); return {receipt: {taskId: `task_${request.arguments.target.targetId}`}} },
    ...overrides,
  }, {defineTool: definition => definition, toolRegistrations: registrations,
    withSessionContext: async (_id, _signal, operation) => operation(context, undefined, async () => ({channelId:context.defaultChannelId, members:["mem_a","mem_b","mem_worker"].map(memberId => ({memberId})), hasMore:false}))})
  const message = {id: "natural-user", role: "user", content: [{type: "text", text: "Choose two suitable Agents and give each a review task."}],
    source: {kind: "user", rpcId: "natural-request"}}
  const claim = async () => {
    await f.emit("agent/pre-step", {agent: f.agent, messages: [message]}, async () => ({kind: "enter", messages: [message]}))
    f.emit("session/event", f.agent.session, {type: "user/message", seq: 42, data: message})
    f.collaboration.enableTools(SESSION_ID)
  }
  return {...f, calls, scope, context, claim, message,
    registrations,
    tool: name => registrations.find(item => item.definition.name === name).definition,
    exec: {agent: f.agent, signal: new AbortController().signal}}
}

test("mention identity is checked against the current grant before explicit preparation and dispatch", async () => {
  for (const directory of ["dsh-current", "dsh-replaced"]) {
    const f = naturalSelectionFixture()
    f.message.content[0].text = `Assign the review to <loop-collaboration type="agent" target="mem_a" ref="agent:mem_a" directory="${directory}">Worker</loop-collaboration>.`
    await f.claim()
    assert.deepEqual(f.calls, [])
    const prepare = () => f.tool("collaboration_prepare").execute({targetIds:["mem_a"]}, f.exec)
    if (directory !== "dsh-current") {
      await assert.rejects(prepare(), /identity changed/)
      assert.ok(f.calls.every(([name]) => name === "directory"))
      continue
    }
    assert.equal((await prepare()).state, "ready")
    const result = await f.tool("collaboration_dispatch").execute({tasks:[{title:"Review",description:"Read the draft",assignee:"mem_a"}]},f.exec)
    assert.equal(result.receipt.taskId, "task_mem_a")
  }
})

test("mentioning a nonmember allows a task only after a separately authorized invitation and a fresh roster check", async () => {
  const f = naturalSelectionFixture()
  let member = false
  let mode = "denied"
  const cursors = []
  f.collaboration.withSessionContext = async (_id, _signal, operation) => operation(f.context, [], async cursor => {
    cursors.push(cursor)
    if (mode === "denied") throw new Error("Channel roster permission denied")
    if (!cursor) return {channelId:"chn_1",members:[{memberId:"other"}],hasMore:true,nextCursor:"second"}
    return {channelId:"chn_1",members:member ? [{memberId:"mem_a"}] : [],hasMore:mode === "repeated",nextCursor:"second"}
  })
  await f.claim()
  const prepare = () => f.tool("collaboration_prepare").execute({targetIds:["mem_a"]}, f.exec)
  await assert.rejects(prepare(), /permission denied/)
  mode = "repeated"
  await assert.rejects(prepare(), /Membership is unknown/)
  mode = "complete"
  const result = await prepare()
  assert.equal(result.state,"not-in-channel")
  assert.equal(result.channelId,"chn_1")
  assert.deepEqual(result.missing.map(agent => agent.agentId),["agt_worker"])
  assert.ok(f.calls.every(([name]) => name === "directory"))
  member = true
  assert.equal((await prepare()).state,"ready")
  assert.deepEqual(cursors.slice(-2),[undefined,"second"])
})

test("natural-language selection reuses durable user intent and the saved channel for multiple dispatches without @", async () => {
  const f = naturalSelectionFixture()
  await f.claim()
  const args = {targetIds: ["mem_a", "mem_b"]}
  const prepared = await f.tool("collaboration_prepare").execute(args, f.exec)
  assert.equal(prepared.state, "ready")
  assert.equal(prepared.channelId, "chn_1")
  assert.equal(f.calls.filter(([name]) => name === "action").length, 0)
  const request = f.calls.find(([name]) => name === "prepare")[1]
  assert.equal(request.payloadText, f.message.content[0].text)
  assert.deepEqual(request.shareScope, {scope: "task-description", resourceRefs: [], expandedAudience: false})
  assert.deepEqual(f.calls.find(([name]) => name === "activate")[1], {
    intentRef: "natural-intent", sessionId: SESSION_ID, acceptedEventId: "natural-user",
    acceptedMessageId: "natural-user", acceptedSequence: 42, acceptedTextDigest: request.payloadDigest,
  })
  assert.deepEqual(await f.tool("collaboration_prepare").execute(args, f.exec), prepared)
  assert.equal(f.calls.filter(([name]) => name === "prepare").length, 1)
  for (const assignee of args.targetIds) {
    const result = await f.tool("collaboration_dispatch").execute({tasks: [{title: "Review", description: "Review the supplied proposal", assignee}]}, f.exec)
    assert.equal(result.receipt.taskId, `task_${assignee}`)
  }
  assert.equal(f.calls.filter(([name]) => name === "action").length, 2)
  await assert.rejects(f.tool("collaboration_prepare").execute({targetIds: ["mem_c"]}, f.exec), /another collaborator set/u)
  f.emit("session/event", f.agent.session, {type: "turn/end"})
  await assert.rejects(f.tool("collaboration_prepare").execute(args, f.exec), /current accepted user/u)
})

test("a rejected dispatch cannot become an unassigned task through the generic action", async () => {
  const f = naturalSelectionFixture({async collaborationAction() { throw new Error("assignee cannot see task") }})
  await f.claim()
  await f.tool("collaboration_prepare").execute({targetIds:["mem_a"]}, f.exec)
  await assert.rejects(f.tool("collaboration_dispatch").execute({tasks:[{title:"Review",assignee:"mem_a"}]}, f.exec))
  const command = title => ({verb:"call",name:"task.create",input:JSON.stringify({tasks:[{title}]})})
  assert.throws(()=>f.collaboration.checkDispatchRetry(SESSION_ID,command("Review")),/original dispatch/)
  f.collaboration.checkDispatchRetry(SESSION_ID,command("Separate task"))
  f.emit("session/event", f.agent.session, {type:"turn/end"})
  f.collaboration.checkDispatchRetry(SESSION_ID,command("Review"))
})

test("a named-channel attempt blocks duplicate and alternate writes for that task in this turn", async () => {
  const f = naturalSelectionFixture()
  await f.claim()
  const tasks = [{title:"Design review",assignee:"mem_a"}]
  const command = params => ({verb:"call",name:"task.create",input:JSON.stringify(params)})
  const named = command({channelName:"Design",tasks})
  f.collaboration.checkDispatchRetry(SESSION_ID,named,true)
  assert.throws(()=>f.collaboration.checkDispatchRetry(SESSION_ID,named,true),/original board/)
  assert.throws(()=>f.collaboration.checkDispatchRetry(SESSION_ID,command({tasks})),/original board/)
  await assert.rejects(f.tool("collaboration_dispatch").execute({tasks},f.exec),/original board/)
  assert.equal(f.calls.filter(([name])=>name==="action").length,0)
  f.emit("session/event", f.agent.session, {type:"turn/end"})
  f.collaboration.checkDispatchRetry(SESSION_ID,named)
})

test("a cached preparation revalidates the route without replaying an intent", async () => {
  const f = naturalSelectionFixture()
  await f.claim()
  const prepare = () => f.tool("collaboration_prepare").execute({targetIds:["mem_a"]}, f.exec)
  assert.equal((await prepare()).state, "ready")
  f.context.bindingRevision = "replacement"
  await assert.rejects(prepare(), {code:"loop-collaboration/binding-stale"})
  assert.equal(f.calls.filter(([name]) => name === "activate").length, 1)
})

test("natural-language preparation rejects remote input and model-supplied authorization fields", async () => {
  const f = naturalSelectionFixture()
  const remote = {...f.message, source: {kind: "loop-collaboration", rpcId: "remote"}}
  await f.emit("agent/pre-step", {agent: f.agent, messages: [remote]}, async () => ({kind: "enter", messages: [remote]}))
  await assert.rejects(f.tool("collaboration_prepare").execute({targetIds: ["mem_a"]}, f.exec), /current accepted user/u)
  await f.claim()
  for (const args of [{targetIds: []}, {targetIds: ["mem_a", "mem_a"]},
    {targetIds: ["mem_a"], shareScope: "selected-resources"}, {targetIds: ["mem_a"], acceptedText: "invented"},
    {targetIds: ["mem_a"], sessionId: "other"}]) {
    await assert.rejects(f.tool("collaboration_prepare").execute(args, f.exec), /exact directory targetIds/u)
  }
  assert.deepEqual(f.calls, [])
})

test("natural-language selection recovers a stale route for the same account and channel but not a changed identity", async () => {
  for (const differentAccount of [false, true]) {
    const f = naturalSelectionFixture()
    f.collaboration.sessionScopes.set(SESSION_ID, {...f.scope, bindingId: "old_binding", bindingEpoch: "1", bindingRevision: "1",
      ...(differentAccount ? {accountId: "human_other"} : {})})
    await f.claim()
    const promise = f.tool("collaboration_prepare").execute({targetIds: ["mem_a"]}, f.exec)
    if (differentAccount) {
      await assert.rejects(promise, /current accepted user/u)
      assert.equal(f.calls.filter(([name]) => name === "activate").length, 0)
    } else {
      assert.equal((await promise).state, "ready")
      assert.equal(f.calls.find(([name]) => name === "activate")[1].acceptedSequence, 42)
    }
  }
})

test("preparation resolves one exact recipient independently of directory capability hints", async () => {
  for (const entry of [undefined, {targetId: "wrong"}, {agentId: "agt_self"},
    {needsAccess: true}, {visible: false}, {capability: {}}]) {
    const f = naturalSelectionFixture({async collaborationDirectory() {
      return {entries: entry === undefined ? [] : [{targetId: "mem_a", memberId: "mem_a", targetType: "agent",
        agentId: "agt_worker", ...entry}]}
    }})
    await f.claim()
    const result = f.tool("collaboration_prepare").execute({targetIds: ["mem_a"]}, f.exec)
    if (!entry || entry.targetId || entry.agentId) {
      await assert.rejects(result, /exact directory identity/u)
      assert.equal(f.calls.length, 0)
    } else {
      assert.equal((await result).state, "ready")
      assert.equal(f.calls.filter(([name]) => name === "activate").length, 1)
    }
  }
})

for (const method of ["collaborationDirectory", "collaborationStatus"]) {
  test(`a failed ${method} read can be retried for the original selection without duplicating work`, async () => {
    const f = naturalSelectionFixture()
    await f.claim()
    const args = {targetIds: ["mem_a"]}, prepare = (input = args) => f.tool("collaboration_prepare").execute(input, f.exec)
    const original = f.actions[method]
    let reads = 0
    f.actions[method] = async (...params) => {
      if (++reads === 1) throw new Error("read temporarily unavailable")
      return await original(...params)
    }
    await assert.rejects(prepare(), /read temporarily unavailable/u)
    await assert.rejects(prepare({targetIds: ["mem_b"]}), /another collaborator set/u)
    const [one, two] = await Promise.all([prepare(), prepare()])
    assert.equal(one.state, "ready"); assert.deepEqual(two, one); assert.equal(reads, 2)
    for (const method of ["bind", "prepare", "activate"]) assert.equal(f.calls.filter(([name]) => name === method).length, 1)
    assert.equal(f.calls.filter(([name]) => name === "action").length, 0)
  })
}

test("a read retry cannot move the original selection to a different route or connection", async () => {
  for (const change of ["account", "channel", "revision"]) {
    const f = naturalSelectionFixture({async collaborationStatus() { throw new Error("read temporarily unavailable") }})
    let account = "account_1"
    f.collaboration.withSessionContext = async (_id, _signal, operation) => operation(f.context, ["server", account, "install"], async () => ({channelId:f.context.defaultChannelId,members:[{memberId:"mem_a"}],hasMore:false}))
    await f.claim()
    const prepare = () => f.tool("collaboration_prepare").execute({targetIds: ["mem_a"]}, f.exec)
    await assert.rejects(prepare(), /read temporarily unavailable/u)
    if (change === "account") account = "account_2"
    if (change === "channel") f.context.defaultChannelId = "chn_other"
    if (change === "revision") f.context.bindingRevision = "4"
    await assert.rejects(prepare(), {code: "loop-collaboration/binding-stale"})
    assert.deepEqual(f.calls.map(([name]) => name), ["directory"])
  }
})

test("a binding with an unknown result is never retried by target preparation", async () => {
  let writes = 0
  const f = naturalSelectionFixture({async collaborationBind() { writes++; throw new Error("binding outcome unknown") }})
  await f.claim()
  for (let i = 0; i < 2; i++) await assert.rejects(f.tool("collaboration_prepare").execute({targetIds: ["mem_a"]}, f.exec), /binding outcome unknown/u)
  assert.equal(writes, 1)
  assert.equal(f.calls.filter(([name]) => name === "prepare").length, 0)
})

test("preparation stops when the user turn ends during a read and does not replay uncertain activation", async () => {
  let f
  f = naturalSelectionFixture({async collaborationDirectory() {
    f.emit("session/event", f.agent.session, {type: "turn/end"})
    return {entries: []}
  }})
  await f.claim()
  await assert.rejects(f.tool("collaboration_prepare").execute({targetIds: ["mem_a"]}, f.exec), /current accepted user/u)
  assert.equal(f.calls.length, 0)
  let attempts = 0
  f = naturalSelectionFixture({async collaborationActivateIntent() { attempts += 1; throw new Error("activation result unknown") }})
  await f.claim()
  for (let i = 0; i < 2; i++) {
    await assert.rejects(f.tool("collaboration_prepare").execute({targetIds: ["mem_a"]}, f.exec), /activation result unknown/u)
  }
  assert.equal(attempts, 1)
  assert.equal(f.calls.filter(([name]) => name === "prepare").length, 1)
  assert.equal(f.calls.filter(([name]) => name === "action").length, 0)
})

function proxyEvent() {
  const body = "FULL_RESULT_BODY\nMAINPATH_FINAL_RESULT=493"
  const contentHash = `sha256:${createHash("sha256").update(body).digest("hex")}`
  return {
    scope: eventScope(),
    event: {
      eventId: "cevt_result_1",
      kind: "action.changed",
      occurredAt: new Date().toISOString(),
      delivery: {
        deliveryId: "delivery_1",
        eventId: "cevt_result_1",
        eventSeq: 8,
        eventKind: "collaboration.task_message",
        sessionId: SESSION_ID,
        sourceSessionId: SESSION_ID,
        bindingId: "cbind_1",
        bindingEpoch: "3",
        taskId: "tsk_1",
        state: "pending",
        payloadHash: "sha256:" + "a".repeat(64),
        receivedAt: new Date().toISOString(),
      },
      event: {
        eventId: "cevt_result_1",
        type: "collaboration.task_message",
        workspaceId: "wsp_1",
        deviceBindingId: DEVICE_BINDING_ID,
        agentMemberId: AGENT_MEMBER_ID,
        targetKind: "coordinator",
        originBindingId: "cbind_1",
        originBindingEpoch: 3,
        originSourceSessionId: SESSION_ID,
        targetBindingId: "cbind_1",
        targetBindingEpoch: 3,
        targetSourceSessionId: SESSION_ID,
        bindingId: "cbind_1",
        bindingEpoch: 3,
        sourceSessionId: SESSION_ID,
        taskId: "tsk_1",
        attempt: 1,
        executionGeneration: 2,
        messageSeq: 9,
        messageId: "msg_result_1",
        contentHash,
        artifactIds: [],
        body,
        payload: {messageId: "msg_result_1", messageSeq: 9, body, contentHash},
      },
    },
  }
}

function collaborationStatus(proxy = proxyEvent(), deliveryState = "pending", state = "ready") {
  return {
    state,
    scope: {workspaceId: "wsp_1", bindingId: "cbind_1", bindingEpoch: "3"},
    deliveryScope: eventScope(),
    capability: {available: true},
    subscription: {state: "live", lastEventSeq: proxy.event.delivery.eventSeq},
    active: [],
    deliveries: [{...proxy.event.delivery, state: deliveryState, event: proxy.event.event}],
  }
}

function harnessSnapshotJsonValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined
  if (Array.isArray(value)) {
    const result = []
    for (const item of value) {
      const snapshot = harnessSnapshotJsonValue(item)
      if (snapshot === undefined) return undefined
      result.push(snapshot)
    }
    return result
  }
  if (value !== null && typeof value === "object") {
    const result = {}
    for (const [key, item] of Object.entries(value)) {
      const snapshot = harnessSnapshotJsonValue(item)
      if (snapshot === undefined) return undefined
      result[key] = snapshot
    }
    return result
  }
  return undefined
}

test("first explicit board selection follows the runtime action order and exposes worksite setup", async () => {
  const calls = []
  const unbound = {
    ...collaborationStatus(),
    state: "needs-board",
    scope: {
      ...eventScope(),
      coordinatorAgentId: "agt_coordinator",
      workspaceId: "wsp_1",
    },
    deliveries: [],
  }
  const bound = {
    ...collaborationStatus(),
    state: "ready",
    scope: {...eventScope(), boardId: "brd_first", boardName: "First board"},
    deliveries: [],
    worksite: {state: "connecting"},
  }
  const fixture = runtimeFixture({
    async collaborationStatus() {
      calls.push("collaborationStatus")
      return calls.includes("collaborationBind") ? bound : unbound
    },
    async collaborationBoards() {
      calls.push("collaborationBoards")
      return {
        boards: [{
          boardId: "brd_first",
          boardName: "First board",
          projectId: "prj_first",
          projectName: "First project",
          revision: "boards:1",
          capability: {available: true},
        }],
        revision: "boards:1",
      }
    },
    async collaborationBind(request) {
      calls.push("collaborationBind")
      assert.equal(request.boardId, "brd_first")
      assert.equal(request.coordinatorAgentId, "agt_coordinator")
      return {
        scope: eventScope(),
        capability: {available: true},
        subscription: {state: "live", lastEventSeq: 0},
      }
    },
    async collaborationWatch() {
      calls.push("collaborationWatch")
    },
  })
  await fixture.collaboration.status({sessionId: SESSION_ID})
  await fixture.collaboration.boards({sessionId: SESSION_ID})
  await fixture.collaboration.bind({
    sessionId: SESSION_ID,
    boardId: "brd_first",
    coordinatorAgentId: "agt_coordinator",
  })
  const finalStatus = await fixture.collaboration.status({sessionId: SESSION_ID})

  assert.deepEqual(calls, [
    "collaborationStatus",
    "collaborationBoards",
    "collaborationBind",
    "collaborationWatch",
    "collaborationStatus",
    "collaborationWatch",
  ])
  assert.equal(finalStatus.worksite?.state, "connecting")
  assert.equal(finalStatus.scope?.boardId, "brd_first")
})

test("collaboration bind normalizes string generations and rejects malformed values", async () => {
  let seen
  const fixture = runtimeFixture({
    async collaborationBind(request) {
      seen = request
      return {scope: eventScope(), capability: {}, subscription: {}}
    },
  })
  await fixture.collaboration.bind({
    sessionId: SESSION_ID,
    boardId: "channel_1",
    coordinatorAgentId: "agent_1",
    sourceGeneration: "3",
    expectedBindingEpoch: "2",
  })
  assert.equal(seen.sourceGeneration, 3)
  assert.equal(seen.expectedBindingEpoch, 2)

  await assert.rejects(
    fixture.collaboration.bind({
      sessionId: SESSION_ID,
      boardId: "channel_1",
      coordinatorAgentId: "agent_1",
      sourceGeneration: "9007199254740992",
    }),
    error => error?.code === "loop-host/invalid-request",
  )
})

test("collaboration resolves a live idle Agent directly before controller restore", async () => {
  const fixture = runtimeFixture()
  fixture.ctx.agents = {get: sessionId => sessionId === SESSION_ID ? fixture.agent : undefined}
  fixture.ctx.get = name => name === "sessionController"
    ? {resolveAgent: async () => ({error: new Error("controller restore unavailable")})}
    : undefined

  assert.equal(await fixture.collaboration.resolveAgent(SESSION_ID), fixture.agent)
})

test("snapshot-recovered result message contains only Harness JSON values", () => {
  assert.equal(harnessSnapshotJsonValue({routeKey: undefined}), undefined)
  const event = proxyEvent().event
  delete event.delivery.routeKey
  delete event.delivery.sourceSessionId
  const message = createCollaborationUserMessage(event.event, event.delivery)

  assert.notEqual(harnessSnapshotJsonValue(message), undefined)
  assert.equal(Object.hasOwn(message.source, "routeKey"), false)
  assert.equal(Object.hasOwn(message.source, "sourceSessionId"), true)
})

test("receipt projection distinguishes pending, claimed, committed, and canceled", () => {
  const projection = createCollaborationReceiptProjection()
  const event = proxyEvent()
  const message = createCollaborationUserMessage(event.event.event, event.event.delivery)
  let state = projection.init()
  state = projection.apply(state, {
    type: "agent/inbox/spliced",
    seq: 1,
    data: {target: "next-step", start: 0, inserted: [message]},
  })
  assert.equal(state.entries.delivery_1.state, "pending")
  state = projection.apply(state, {
    type: "agent/inbox/spliced",
    seq: 2,
    data: {target: "next-step", start: 0, removedCount: 1, inserted: []},
  })
  assert.equal(state.entries.delivery_1.state, "claimed")
  state = projection.apply(state, {
    type: "user/message",
    seq: 3,
    data: message,
  })
  assert.equal(state.entries.delivery_1.state, "committed")
  assert.equal(state.entries.delivery_1.sessionSeq, 3)

  let cancelled = projection.init()
  cancelled = projection.apply(cancelled, {
    type: "agent/inbox/spliced",
    seq: 4,
    data: {target: "next-turn", start: 0, inserted: [message]},
  })
  cancelled = projection.apply(cancelled, {
    type: "agent/inbox/spliced",
    seq: 5,
    data: {target: "next-turn", start: 0, removedCount: 1, inserted: [], outcome: "canceled"},
  })
  assert.equal(cancelled.entries.delivery_1.state, "canceled")
})

test("committed collaboration message is acknowledged only after a durable flush", async () => {
  let flushed = false
  const accepted = []
  const fixture = runtimeFixture({
    async collaborationAccept(request) {
      assert.equal(flushed, true)
      accepted.push(request)
    },
  })
  await fixture.collaboration.acceptProxyEvent(proxyEvent())
  assert.equal(fixture.agent.sent.length, 1)
  const message = fixture.agent.sent[0].message
  assert.equal(fixture.agent.sent[0].target, "next-turn")
  assert.equal(message.source.kind, "loop-collaboration")
  assert.equal(message.source.eventId, "cevt_result_1")

  const originalFlush = fixture.ctx.sessions.flush
  fixture.ctx.sessions.flush = async session => {
    const result = await originalFlush(session)
    flushed = result
    return result
  }
  fixture.emit("session/event", fixture.agent.session, {
    type: "user/message",
    seq: 12,
    data: message,
  })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(accepted.length, 1)
  assert.equal(accepted[0].eventId, "cevt_result_1")
  assert.equal(accepted[0].sessionMessageId, message.id)
  assert.equal(accepted[0].sessionSequence, 12)
})

for (const kind of ["collaboration.task_message"]) {
test(`${kind} steers an active Coordinator but wakes an idle one`, async () => {
  const event = proxyEvent()
  event.event.delivery.eventKind = kind
  event.event.event.type = kind
  const idle = runtimeFixture()
  await idle.collaboration.acceptProxyEvent(event)
  assert.equal(idle.agent.sent[0]?.target, "next-turn")

  const active = runtimeFixture()
  active.agent.status = "running"
  await active.collaboration.acceptProxyEvent(event)
  assert.equal(active.agent.sent[0]?.target, "next-step")
})

}

test("event listener publishes the actual delivery failure with its Session", async () => {
  let onEvent
  const fixture = runtimeFixture({
    addCollaborationEventListener(listener) {
      onEvent = listener
      return () => {}
    },
  })
  fixture.ctx.get = name => {
    if (name !== "sessionController") return undefined
    return {
      async resolveAgent() {
        const error = new Error("Session writer is held")
        error.code = "session/writer-held"
        throw error
      },
    }
  }
  fixture.collaboration.setActions(fixture.actions)

  onEvent(proxyEvent())
  await new Promise(resolve => setTimeout(resolve, 0))

  const failure = fixture.collaboration.uiEvents.at(-1)
  assert.equal(failure.kind, "delivery.changed")
  assert.equal(failure.scope.sessionId, SESSION_ID)
  assert.equal(failure.delivery.state, "blocked")
  assert.match(failure.delivery.reason, /session\/writer-held: Session writer is held/u)
})

test("flush=false never confirms durable Session acceptance", async () => {
  let accepted = 0
  const fixture = runtimeFixture({
    async collaborationAccept() {
      accepted += 1
    },
  })
  fixture.ctx.sessions.flush = async () => false
  const delivery = proxyEvent().event.delivery
  const message = createCollaborationUserMessage(proxyEvent().event.event, delivery)
  fixture.emit("session/event", fixture.agent.session, {
    type: "user/message",
    seq: 12,
    data: message,
  })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(accepted, 0)
})

test("pending accepted user message is reconciled when bind arrives later", async () => {
  let activated
  const actions = {
    async collaborationPrepareIntent() {
      return {
        intentRef: "intent_1",
        state: "prepared",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        sharePreview: {scope: "task-description", resourceRefs: [], targetIds: ["agt_1"], firstExpansion: false},
      }
    },
    async collaborationBindIntent() {
      return {intentRef: "intent_1", state: "bound"}
    },
    async collaborationActivateIntent(request) {
      activated = request
      return {intentRef: "intent_1", state: "activated", userIntentId: "cui_1"}
    },
  }
  const fixture = runtimeFixture(actions)
  const serializedText = "@[Researcher](loop-collaboration:agent/agt_1) collect evidence"
  const prepared = await fixture.collaboration.prepareIntent({
    sessionId: SESSION_ID,
    bindingRevision: "11",
    serializedText,
    references: [{
      targetId: "agt_1",
      targetType: "agent",
      stableRef: "loop-collaboration:agent/agt_1",
      intendedActions: ["dispatch"],
    }],
    shareScope: {scope: "task-description", resourceRefs: [], expandedAudience: false},
  })
  const acceptedMessage = {
    id: "msg_user_1",
    role: "user",
    content: [{type: "text", text: serializedText}],
    source: {kind: "user", rpcId: "request_1"},
  }
  fixture.emit("session/event", fixture.agent.session, {
    type: "user/message",
    seq: 4,
    data: acceptedMessage,
  })
  await fixture.collaboration.bindIntent({
    sessionId: SESSION_ID,
    intentRef: prepared.intentRef,
    requestId: "request_1",
    payloadDigest: prepared.payloadDigest,
    acceptedSerializedText: serializedText,
    bindingRevision: "11",
  })
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(activated.intentRef, "intent_1")
  assert.equal(activated.acceptedMessageId, "msg_user_1")
  assert.equal(activated.acceptedSequence, 4)
})

test("accepted @ intent contributes bounded current-target context before the first tool step", async () => {
  const toolRegistrations = []
  const fixture = runtimeFixture({
    async collaborationPrepareIntent() {
      return {
        intentRef: "intent_first",
        state: "prepared",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        sharePreview: {
          scope: "task-description", resourceRefs: [], targetIds: ["agt_1"], firstExpansion: false,
        },
      }
    },
    async collaborationBindIntent() {
      return {intentRef: "intent_first", state: "bound"}
    },
    async collaborationActivateIntent() {
      return {intentRef: "intent_first", state: "activated", userIntentId: "cui_first"}
    },
    async collaborationStatus() {
      return {state: "ready", scope: eventScope(), active: []}
    },
  }, {defineTool: definition => definition, toolRegistrations})
  const text = "@[Researcher](loop-collaboration:agent/agt_1) collect evidence"
  await fixture.collaboration.prepareIntent({
    sessionId: SESSION_ID,
    bindingRevision: "11",
    serializedText: text,
    references: [{
      targetId: "agt_1",
      targetType: "agent",
      displayName: "Researcher",
      stableRef: "loop-collaboration:agent/agt_1",
      intendedActions: ["dispatch", "followup", "review"],
    }],
    shareScope: {scope: "task-description", resourceRefs: [], expandedAudience: false},
  })
  // Official DSH resolves tools and prompt context before the pre-step barrier
  // commits/activates this submission. The first request must already have both.
  assert.ok(visibleToolNames(toolRegistrations, fixture.agent).includes("collaboration_dispatch"))
  const preparedContext = fixture.ctx.systemPrompt.contextDefinitions.find(
    definition => definition.name === "loop-collaboration-intent",
  ).text({agent: fixture.agent})
  assert.match(preparedContext, /agt_1/u)
  assert.match(preparedContext, /Researcher/u)
  fixture.emit("session/event", fixture.agent.session, {
    type: "user/message",
    seq: 4,
    data: {
      id: "message_first",
      role: "user",
      content: [{type: "text", text}],
      source: {kind: "user", rpcId: "request_first"},
    },
  })
  await fixture.collaboration.bindIntent({
    sessionId: SESSION_ID,
    intentRef: "intent_first",
    requestId: "request_first",
    payloadDigest: `sha256:${createHash("sha256").update(text).digest("hex")}`,
    acceptedSerializedText: text,
    bindingRevision: "11",
  })
  await new Promise(resolve => setTimeout(resolve, 0))
  const context = fixture.ctx.systemPrompt.contextDefinitions.find(
    definition => definition.name === "loop-collaboration-intent",
  ).text({agent: fixture.agent})
  assert.match(context, /agt_1/u)
  assert.match(context, /Researcher/u)
  assert.match(context, /dispatch/u)
  assert.match(context, /delegate a new Task/u)
  assert.doesNotMatch(context, /share_scope/u)
  assert.ok(context.length <= 6_000)
  const rules = fixture.ctx.systemPrompt.sections.find(section => section.name === "loop-collaboration")
  assert.equal(rules, undefined)
  assert.deepEqual(visibleToolNames(toolRegistrations, fixture.agent), [
    "collaboration_cancel",
    "collaboration_directory",
    "collaboration_dispatch",
    "collaboration_end_management",
    "collaboration_followup",
    "collaboration_inspect",
    "collaboration_list_subscriptions",
    "collaboration_notify",
    "collaboration_prepare",
    "collaboration_read_updates",
    "collaboration_review",
    "collaboration_set_subscription",
    "collaboration_wait",
  ])
  // A sidebar status poll before the first dispatch cannot discard accepted intent.
  await fixture.collaboration.status({sessionId: SESSION_ID})
  assert.match(fixture.collaboration.intentContext(SESSION_ID), /agt_1/u)
  assert.ok(visibleToolNames(toolRegistrations, fixture.agent).includes("collaboration_dispatch"))
  fixture.collaboration.observeSessionEvent(fixture.agent.session, {
    type: "turn/end", data: {turn: 1, reason: {kind: "completed"}},
  })
  assert.equal(fixture.collaboration.intentContext(SESSION_ID), "")
  assert.deepEqual(visibleToolNames(toolRegistrations, fixture.agent), [])
})

test("a mentioned colleague remains reference context and needs a new accepted instruction to act", async () => {
  const calls = []
  const toolRegistrations = []
  const fixture = runtimeFixture({
    async collaborationContinuation(request) {
      return {...request, state: "ready", tasks: [], references: [{
        targetId: "mem_colleague", targetType: "human", displayName: "Colleague",
      }]}
    },
    async collaborationAction(request) {
      calls.push(request)
      return {receipt: {taskId: "task_colleague"}}
    },
  }, {defineTool: definition => definition, toolRegistrations})
  fixture.collaboration.observeBindingScope(SESSION_ID, eventScope())
  fixture.collaboration.activeIntentContexts.set(SESSION_ID, {
    intentRef: "mention_colleague", bindingRevision: "3", targets: [{
      targetId: "mem_colleague", targetType: "human", displayName: "Colleague",
      intendedActions: ["dispatch", "followup"],
    }],
  })
  fixture.emit("session/event", fixture.agent.session, {type: "turn/end"})
  assert.equal(fixture.collaboration.intentContext(SESSION_ID), "")
  assert.deepEqual(visibleToolNames(toolRegistrations, fixture.agent), [])
  fixture.collaboration.enableTools(SESSION_ID)
  const args = {target: {targetId: "mem_colleague", kind: "human"}, task: {title: "Feedback"}}
  await assert.rejects(fixture.collaboration.runAction("dispatch", SESSION_ID, args), /current accepted user instruction/u)
  assert.equal(calls.length, 0)
  const message = {id: "message_later", role: "user", content: [{type: "text", text: "Create a task for that colleague"}], source: {kind: "user", rpcId: "request_later"}}
  await fixture.emit("agent/pre-step", {agent: fixture.agent, messages: [message]}, () => ({kind: "enter", messages: [message]}))
  assert.equal(calls.length, 0)
  await fixture.collaboration.runAction("dispatch", SESSION_ID, args)
  assert.ok(calls[0].continuationRef)
  assert.deepEqual(calls[0].arguments.target, args.target)
})

test("ordinary chats with or without a binding omit collaboration tools and prompts", () => {
  const toolRegistrations = []
  const fixture = runtimeFixture({}, {defineTool: definition => definition, toolRegistrations})
  assert.deepEqual(visibleToolNames(toolRegistrations, fixture.agent), [])
  assert.deepEqual(visibleToolNames(toolRegistrations, undefined), [])
  fixture.collaboration.bound.set(SESSION_ID, true)
  const rules = fixture.ctx.systemPrompt.sections.find(section => section.name === "loop-collaboration")

  assert.equal(rules, undefined)
  assert.deepEqual(visibleToolNames(toolRegistrations, fixture.agent), [])
  assert.equal(toolRegistrations.length, 13)
})

test("ordinary directory reads need no intent or binding and preserve live authorization failures", async () => {
  const calls = []
  const registrations = []
  let denied = false
  const fixture = runtimeFixture({
    async collaborationDirectory(request) {
      calls.push(request)
      if (denied) throw new Error("Loop authorization revoked")
      return {entries: [{targetId: "agt_1", targetType: "agent", displayName: "Researcher"}]}
    },
  }, {defineTool: definition => definition, toolRegistrations: registrations})
  assert.deepEqual(visibleToolNames(registrations, fixture.agent), [])
  fixture.collaboration.enableTools(SESSION_ID, "directory")
  assert.deepEqual(visibleToolNames(registrations, fixture.agent), ["collaboration_directory"])
  const entry = registrations.find(item => item.definition.name === "collaboration_directory")
  const exec = {agent: fixture.agent, signal: new AbortController().signal}
  const result = await entry.definition.execute({kinds: ["agent"], limit: 50}, exec)
  assert.equal(result.entries[0].displayName, "Researcher")
  assert.deepEqual(calls, [{sessionId: SESSION_ID, kinds: ["agent"], limit: 50}])
  assert.equal(fixture.collaboration.collaborationRole(SESSION_ID), "none")
  assert.equal(fixture.collaboration.prepared.size, 0)
  assert.equal(fixture.collaboration.bound.size, 0)
  denied = true
  await assert.rejects(entry.definition.execute({}, exec), /authorization revoked/u)
  assert.deepEqual(visibleToolNames(registrations, fixture.agent), ["collaboration_directory"])
})


test("status hydrates active Tasks per Session and authoritative terminal, revoke, or identity switch clears only that Session", async () => {
  const secondSessionId = "session-22222222-3333-4444-5555-666666666666"
  const statuses = new Map([
    [SESSION_ID, {
      state: "ready",
      scope: {...eventScope(), bindingRevision: "7"},
      active: [{
        taskId: "task_first",
        runId: "run_first",
        taskRevision: 3,
        attempt: 1,
        executionGeneration: 2,
        state: "running",
        nextAction: "wait",
      }],
    }],
    [secondSessionId, {
      state: "ready",
      scope: {...eventScope(secondSessionId), bindingId: "cbind_2", bindingRevision: "9"},
      active: [{
        taskId: "task_second",
        runId: "run_second",
        taskRevision: 4,
        attempt: 1,
        executionGeneration: 1,
        state: "waiting",
        nextAction: "answer-question",
        questionId: "question_second",
      }],
    }],
  ])
  const toolRegistrations = []
  const fixture = runtimeFixture({
    async collaborationStatus({sessionId}) {
      return statuses.get(sessionId)
    },
  }, {defineTool: definition => definition, toolRegistrations})
  const secondAgent = {session: {id: secondSessionId}}

  await fixture.collaboration.status({sessionId: SESSION_ID})
  await fixture.collaboration.status({sessionId: secondSessionId})
  assert.equal(fixture.collaboration.collaborationRole(SESSION_ID), "none")
  assert.equal(fixture.collaboration.collaborationRole(secondSessionId), "none")
  assert.equal(fixture.collaboration.activeWorkCounts.get(SESSION_ID), 1)
  assert.equal(fixture.collaboration.activeWorkCounts.get(secondSessionId), 1)
  assert.equal(fixture.collaboration.activeContinuations.size, 0)
  assert.equal(visibleToolNames(toolRegistrations, fixture.agent).includes("collaboration_respond"), false)
  assert.equal(visibleToolNames(toolRegistrations, secondAgent).includes("collaboration_respond"), false)

  statuses.set(SESSION_ID, {
    state: "ready",
    scope: {...eventScope(), bindingId: "cbind_switched", agentMemberId: "member_switched"},
    active: [{
      taskId: "task_switched",
      runId: "run_switched",
      taskRevision: 5,
      attempt: 1,
      executionGeneration: 1,
      state: "succeeded",
      nextAction: "review-result",
    }],
  })
  await fixture.collaboration.status({sessionId: SESSION_ID})
  assert.equal(fixture.collaboration.sessionScopes.get(SESSION_ID).bindingId, "cbind_switched")
  assert.equal(fixture.collaboration.sessionScopes.get(secondSessionId).bindingId, "cbind_2")
  assert.equal(fixture.collaboration.activeContinuations.size, 0)

  statuses.set(SESSION_ID, {state: "ready", scope: eventScope(), active: []})
  await fixture.collaboration.status({sessionId: SESSION_ID})
  assert.equal(fixture.collaboration.collaborationRole(SESSION_ID), "none")
  assert.deepEqual(visibleToolNames(toolRegistrations, fixture.agent), [])
  assert.equal(fixture.collaboration.collaborationRole(secondSessionId), "none")

  statuses.set(secondSessionId, {state: "revoked", scope: eventScope(secondSessionId), active: []})
  await fixture.collaboration.status({sessionId: secondSessionId})
  assert.equal(fixture.collaboration.collaborationRole(secondSessionId), "none")
})

test("first @ pre-step activates a bound claimed message before user/message is durable", async () => {
  let activated
  const fixture = runtimeFixture({
    async collaborationPrepareIntent() {
      return {
        intentRef: "intent_delayed",
        state: "prepared",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        sharePreview: {
          scope: "task-description", resourceRefs: [], targetIds: ["agt_1"], firstExpansion: false,
        },
      }
    },
    async collaborationBindIntent() {
      return {intentRef: "intent_delayed", state: "bound"}
    },
    async collaborationActivateIntent(request) {
      activated = request
      return {intentRef: "intent_delayed", state: "activated", userIntentId: "cui_delayed"}
    },
  })
  const text = "@[Researcher](loop-collaboration:agent/agt_1) delayed evidence"
  await fixture.collaboration.prepareIntent({
    sessionId: SESSION_ID,
    bindingRevision: "11",
    serializedText: text,
    references: [{
      targetId: "agt_1",
      targetType: "agent",
      stableRef: "loop-collaboration:agent/agt_1",
      intendedActions: ["dispatch"],
    }],
    shareScope: {scope: "task-description", resourceRefs: [], expandedAudience: true},
  })
  const payloadDigest = `sha256:${createHash("sha256").update(text).digest("hex")}`
  await fixture.collaboration.bindIntent({
    sessionId: SESSION_ID,
    intentRef: "intent_delayed",
    requestId: "request_delayed",
    payloadDigest,
    acceptedSerializedText: text,
    bindingRevision: "11",
  })
  const claimed = {
    id: "message_delayed",
    role: "user",
    content: [{type: "text", text}],
    source: {kind: "user", rpcId: "request_delayed"},
  }
  await fixture.emit("agent/pre-step", {agent: fixture.agent, messages: [claimed]}, () => {
    return {kind: "enter", messages: [claimed]}
  })
  const context = fixture.ctx.systemPrompt.contextDefinitions.find(
    definition => definition.name === "loop-collaboration-intent",
  ).text({agent: fixture.agent})
  assert.ok(activated)
  assert.equal(activated.acceptedEventId, "message_delayed")
  assert.equal(activated.acceptedMessageId, "message_delayed")
  assert.equal(activated.acceptedSequence, 2)
  assert.equal(activated.acceptedTextDigest, payloadDigest)
  assert.match(context, /agt_1/u)
  assert.match(context, /dispatch/u)
})

test("first @ pre-step tolerates provisional intent and activates after exact bind", async () => {
  let activated
  const fixture = runtimeFixture({
    async collaborationPrepareIntent() {
      return {
        intentRef: "intent_claim_first",
        state: "prepared",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        sharePreview: {
          scope: "task-description", resourceRefs: [], targetIds: ["agt_1"], firstExpansion: false,
        },
      }
    },
    async collaborationBindIntent() {
      return {intentRef: "intent_claim_first", state: "bound"}
    },
    async collaborationCancel() {
      return {intentRef: "intent_claim_first", state: "cancelled"}
    },
    async collaborationActivateIntent(request) {
      activated = request
      return {intentRef: "intent_claim_first", state: "activated", userIntentId: "cui_claim_first"}
    },
  })
  const provisionalText = "@[Researcher](loop-collaboration:agent/agt_1)"
  const text = `${provisionalText} claim before bind`
  const prepared = await fixture.collaboration.prepareIntent({
    sessionId: SESSION_ID,
    bindingRevision: "11",
    serializedText: provisionalText,
    references: [{
      targetId: "agt_1",
      targetType: "agent",
      stableRef: "loop-collaboration:agent/agt_1",
      intendedActions: ["dispatch"],
    }],
    shareScope: {scope: "task-description", resourceRefs: [], expandedAudience: true},
  })
  const claimed = {
    id: "message_claim_first",
    role: "user",
    content: [{type: "text", text}],
    source: {kind: "user", rpcId: "request_claim_first"},
  }
  let nextCalled = false
  let admitted = false
  const barrier = fixture.emit("agent/pre-step", {agent: fixture.agent, messages: [claimed]}, () => {
    nextCalled = true
    return {kind: "enter", messages: [claimed]}
  })
  void barrier.then(() => { admitted = true })
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.equal(nextCalled, true)
  assert.equal(admitted, false)
  assert.equal(activated, undefined)
  await fixture.collaboration.cancelIntent({
    sessionId: SESSION_ID,
    intentRef: prepared.intentRef,
    reason: "Replace the reference-only intent with the accepted message identity",
  })
  const exact = await fixture.collaboration.prepareIntent({
    sessionId: SESSION_ID,
    bindingRevision: "11",
    serializedText: text,
    references: [{
      targetId: "agt_1",
      targetType: "agent",
      stableRef: "loop-collaboration:agent/agt_1",
      intendedActions: ["dispatch"],
    }],
    shareScope: {scope: "task-description", resourceRefs: [], expandedAudience: true},
  })
  await fixture.collaboration.bindIntent({
    sessionId: SESSION_ID,
    intentRef: "intent_claim_first",
    requestId: "request_claim_first",
    payloadDigest: exact.payloadDigest,
    acceptedSerializedText: text,
    bindingRevision: "11",
  })
  await barrier
  assert.equal(admitted, true)
  assert.equal(activated.acceptedEventId, "message_claim_first")
  assert.equal(activated.acceptedSequence, 2)
  assert.equal(activated.acceptedTextDigest, exact.payloadDigest)
})

test("first @ pre-step fails closed instead of admitting an unactivated model turn", async () => {
  const fixture = runtimeFixture({
    async collaborationPrepareIntent() {
      return {
        intentRef: "intent_timeout",
        state: "prepared",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        sharePreview: {
          scope: "task-description", resourceRefs: [], targetIds: ["agt_1"], firstExpansion: false,
        },
      }
    },
  })
  const text = "@[Researcher](loop-collaboration:agent/agt_1) timeout"
  await fixture.collaboration.prepareIntent({
    sessionId: SESSION_ID,
    bindingRevision: "11",
    serializedText: text,
    references: [{
      targetId: "agt_1",
      targetType: "agent",
      stableRef: "loop-collaboration:agent/agt_1",
      intendedActions: ["dispatch"],
    }],
    shareScope: {scope: "task-description", resourceRefs: [], expandedAudience: false},
  })
  let nextCalled = false
  let admitted = false
  const message = {
    id: "message_timeout", role: "user", content: [{type: "text", text}],
    source: {kind: "user", rpcId: "request_timeout"},
  }
  const preStep = fixture.emit("agent/pre-step", {agent: fixture.agent, messages: [message]}, () => {
    nextCalled = true
    return {kind: "enter", messages: [message]}
  })
  void preStep.then(() => { admitted = true }, () => {})
  await assert.rejects(
    () => preStep,
    /not activated/u,
  )
  assert.equal(nextCalled, true)
  assert.equal(admitted, false)
  assert.equal(fixture.collaboration.prepared.has(SESSION_ID), false)
  fixture.emit("session/event", fixture.agent.session, {type: "turn/end", data: {reason: {kind: "error"}}})
  const followup = await fixture.emit("agent/pre-step", {
    agent: fixture.agent,
    messages: [{id: "plain", source: {kind: "user", rpcId: "plain"}, content: [{type: "text", text: "你看我还是报错啊"}]}],
  }, () => ({kind: "enter", messages: []}))
  assert.equal(followup.kind, "enter")
  await assert.rejects(fixture.collaboration.bindIntent({sessionId: SESSION_ID, intentRef: "intent_timeout", requestId: "request_timeout"}), /No prepared/)
})

test("Host Remote exposes concrete collaboration methods and one event stream", async () => {
  const {default: remote} = await import("../remote.mjs")
  const names = new Set(remote.descriptors.map(descriptor => descriptor.method))
  for (const method of [
    "collaborationStatus",
    "collaborationSnapshot",
    "collaborationBoards",
    "collaborationBind",
    "collaborationDirectory",
    "prepareCollaborationIntent",
    "bindCollaborationIntent",
    "bindCollaborationContinuation",
    "cancelCollaborationIntent",
    "followupCollaborationTask",
    "collaborationInspect",
    "collaborationReconcile",
    "collaborationEvents",
  ]) {
    assert.ok(names.has(method), `${method} must be declared`)
  }
  const stream = remote.descriptors.find(descriptor => descriptor.method === "collaborationEvents")
  assert.equal(stream.mode, "stream")
  assert.equal(stream.cancellation.parameter, "signal")
  const directory = remote.descriptors.find(descriptor => descriptor.method === "collaborationDirectory")
  assert.equal(directory.input({strict: true}).safeParse({request: {sessionId: SESSION_ID}}).success, true)
  assert.equal(directory.input({strict: true}).safeParse({request: {sessionId: SESSION_ID, extra: true}}).success, false)
})

test("collaboration_directory uses the authoritative Host Remote and implicit current Session", async () => {
  const calls = []
  const fixture = runtimeFixture({
    async collaborationDirectory(request) {
      calls.push(request)
      return {
        entries: [
          {
            targetId: "agt_exact",
            memberId: "member_exact",
            agentId: "agt_invitation",
            mention: "[@QA Worker A](/mentions/agent/agt_invitation)",
            targetType: "agent",
            displayName: "QA Worker A",
            description: "Exact worker",
            visible: true,
            notifiable: false,
            delegable: true,
            needsAccess: false,
            capability: {
              available: true,
              delegable: true,
              assignable: true,
              notifiable: false,
              conditionalNotify: false,
              respond: true,
              followup: true,
              review: true,
              cancel: true,
              reason: "",
            },
            projectId: "project_1",
            projectName: "QA Project",
            workspaceName: "QA Workspace",
            revision: "4",
            staleReason: "",
          },
          {
            targetId: "agt_prefix",
            targetType: "agent",
            displayName: "QA Worker A Same Prefix Long Name",
            visible: true,
            notifiable: true,
            delegable: false,
            needsAccess: false,
            capability: {
              available: true,
              delegable: false,
              notifiable: true,
              conditionalNotify: true,
              respond: false,
              followup: false,
              review: false,
              cancel: false,
              reason: "execution_adapter_unavailable",
            },
            revision: "4",
            staleReason: "execution_adapter_unavailable",
          },
        ],
        nextCursor: "cursor-next",
        revision: "4",
        truncated: true,
        needsAccessCount: 0,
        cacheKey: "must-not-reach-the-model",
      }
    },
  })
  const {defineTool} = await import("@deepseek-ai/dsh-tools")
  const tools = new Map()
  fixture.ctx.tools.register = definition => {
    tools.set(definition.name, definition)
    return definition
  }
  fixture.collaboration.registerTools(defineTool)
  const tool = tools.get("collaboration_directory")
  assert.ok(tool, "collaboration_directory must be registered")
  const execute = tool.execute
  const exec = {agent: fixture.agent, signal: new AbortController().signal}
  const result = await execute({query: "QA Worker A", kinds: ["agent"], limit: 25}, exec)

  assert.deepEqual(calls, [{sessionId: SESSION_ID, query: "QA Worker A", kinds: ["agent"], limit: 25}])
  assert.equal(result.entries.length, 2)
  assert.deepEqual(
    result.entries.map(entry => [entry.targetId, entry.displayName]),
    [
      ["agt_exact", "QA Worker A"],
      ["agt_prefix", "QA Worker A Same Prefix Long Name"],
    ],
  )
  assert.deepEqual(result.entries[0].capabilities, {
    execute: true, assign: true, notifyHumanAboutTask: false, notifyHumanWhenTaskDone: false, followup: true, cancel: true,
  })
  assert.equal(result.entries[0].canNotifyHumanAboutTask, false)
  assert.equal(result.entries[0].memberId, "member_exact")
  assert.equal(result.entries[0].agentId, "agt_invitation")
  assert.equal(result.entries[0].mention, "[@QA Worker A](/mentions/agent/agt_invitation)")
  assert.equal(Object.hasOwn(result.entries[1], "agentId"), false)
  assert.equal(Object.hasOwn(result.entries[1], "mention"), false)
  assert.equal(result.entries[1].capabilities.execute, false)
  assert.equal(result.entries[1].capabilities.assign, false)
  assert.equal(result.entries[1].unsupportedReason, "execution_adapter_unavailable")
  assert.equal(result.nextCursor, "cursor-next")
  assert.equal(result.truncated, true)
  assert.equal(JSON.stringify(result).includes("must-not-reach-the-model"), false)

  await execute({query: "", kinds: ["agent", "human"], cursor: "", limit: 50}, exec)
  assert.deepEqual(calls.at(-1), {sessionId: SESSION_ID, kinds: ["agent", "human"], limit: 50})
  await execute({cursor: "cursor-next"}, exec)
  assert.equal(calls.at(-1).cursor, "cursor-next")
  await assert.rejects(() => execute({cursor: "bad\nvalue"}, exec), /cursor is invalid/u)
  await assert.rejects(() => execute({limit: 51}, exec), /limit must be between 1 and 50/u)
  await assert.rejects(() => execute({query: "x".repeat(201)}, exec), /query must contain/u)
  await assert.rejects(
    () => execute({kinds: ["channel"]}, exec),
    /must be one of \["agent","human"\]/u,
  )
  await assert.rejects(() => execute({sessionId: "attacker"}, exec), /Unknown collaboration_directory field/u)
  await assert.rejects(
    () => execute({}, {signal: new AbortController().signal}),
    /requires an Agent Session/u,
  )

  fixture.collaboration.bound.set(SESSION_ID, true)
  const rules = fixture.ctx.systemPrompt.sections.find(section => section.name === "loop-collaboration")
  assert.equal(rules, undefined)

  const skill = readFileSync(
    new URL("../../../skills/loop-proxy-harness/references/agents.md", import.meta.url),
    "utf8",
  )
  assert.match(skill, /collaboration_directory/u)
  assert.match(skill, /`agent\.list`/u)
})

test("receipt-returning model tools execute with defineTool's unbound extracted execute reference", async () => {
  const calls = []
  const fixture = runtimeFixture({
    async collaborationDirectory(request) {
      return {entries: [{targetId: request.query, memberId: request.query, targetType: request.query === "mem_colleague" ? "human" : "agent", needsAccess: true, capability: {assignable: false}}]}
    },
    async collaborationAction(request) {
      calls.push(request)
      if (request.action === "inspect") return {task: {taskId: request.arguments.taskId, status: "todo", revision: 7}}
      return {receipt: {clientRequestId: request.clientRequestId, state: "accepted"}}
    },
  })
  const {defineTool} = await import("@deepseek-ai/dsh-tools")
  const tools = new Map()
  fixture.ctx.tools.register = definition => {
    tools.set(definition.name, definition)
    return definition
  }
  fixture.collaboration.registerTools(defineTool)
  fixture.collaboration.activeIntentContexts.set(SESSION_ID, {intentRef: "current"})
  const exec = {agent: fixture.agent, signal: new AbortController().signal}
  const cases = [
    ["collaboration_dispatch", {tasks: [{title: "Work", description: "Do work", assignee: "mem_1"}]}],
    ["collaboration_followup", {taskId: "task_1", targetId: "agt_1", body: "Continue"}],
    ["collaboration_notify", {recipientId: "member_1", taskId: "task_1", message: "Ready", trigger: "immediate"}],
    ["collaboration_cancel", {taskId: "task_1", reason: "Stop"}],
  ]
  for (const [name, args] of cases) {
    const tool = tools.get(name)
    assert.ok(tool, `${name} must be registered`)
    const execute = tool.execute
    const result = await execute(args, exec)
    assert.equal(result.receipt.state, "accepted")
  }
  assert.deepEqual(calls.map(call => call.action), [
    "dispatch", "followup", "notify", "cancel",
  ])
  assert.equal(calls.every(call => /^[a-f0-9]{64}$/u.test(call.actionKey)), true)
  assert.equal(calls.every(call => call.clientRequestId === ""), true)
  assert.equal(calls.every(call => call.arguments.actionKey === undefined), true)
  await tools.get("collaboration_dispatch").execute({tasks: [{assignee: "mem_colleague", title: "Feedback", description: "Collect feedback"}]}, exec)
  assert.deepEqual(calls.at(-1).arguments.target, {targetId: "mem_colleague", kind: "human"})
  assert.deepEqual(calls.at(-1).arguments.task, {title: "Feedback", goal: "Collect feedback", acceptanceCriteria: ""})
  assert.equal(calls.at(-1).intentRef, "current")
  await tools.get("collaboration_followup").execute({taskId: "task_colleague", targetId: "mem_colleague", targetType: "human", body: "Add examples"}, exec)
  assert.deepEqual(calls.at(-1).arguments.target, {targetId: "mem_colleague", kind: "human"})
  const inspect = tools.get("collaboration_inspect")
  assert.ok(inspect)
  const inspected = await inspect.execute({taskId: "task_1"}, exec)
  assert.equal(inspected.task.status, "todo")
  assert.equal(inspected.receipt, undefined)
  assert.equal(calls.at(-1).action, "inspect")
  assert.equal(calls.at(-1).arguments.taskId, "task_1")
})

test("dependency injection replaces the placeholder action provider", async () => {
  const fixture = runtimeFixture({})
  fixture.collaboration.actions = () => undefined
  const actions = {
    async collaborationStatus() {
      return {
        state: "unbound",
        capability: {available: false},
        subscription: {state: "stopped"},
        active: [],
        deliveries: [],
      }
    },
    addCollaborationEventListener() {
      return () => {}
    },
  }
  fixture.collaboration.setActions(actions)
  const status = await fixture.collaboration.status({sessionId: SESSION_ID})
  assert.equal(status.state, "unbound")
})



test("full bounded result body is admitted verbatim without a model fetch", async () => {
  const fixture = runtimeFixture()
  const proxy = proxyEvent()
  const body = `${"x".repeat(32_000)}\nFULL_BODY_FINAL_MARKER=493`
  proxy.event.event.body = body
  proxy.event.event.bodyBytes = Buffer.byteLength(body)
  proxy.event.event.truncated = false
  proxy.event.event.payload.body = body
  proxy.event.event.payload.bodyBytes = Buffer.byteLength(body)
  proxy.event.event.payload.truncated = false
  proxy.event.event.contentHash = `sha256:${createHash("sha256").update(body).digest("hex")}`
  proxy.event.event.payload.contentHash = proxy.event.event.contentHash
  await fixture.collaboration.acceptProxyEvent(proxy)

  assert.equal(fixture.agent.sent.length, 1)
  const message = fixture.agent.sent[0].message
  assert.match(message.content[0].text, /FULL_BODY_FINAL_MARKER=493/u)
  assert.equal(message.source.sourceSessionId, SESSION_ID)
  assert.equal(message.source.bindingId, "cbind_1")
  assert.equal(message.source.bindingEpoch, "3")
  assert.equal(message.source.attempt, undefined)
  assert.equal(message.source.executionGeneration, undefined)
  assert.equal(message.source.resultMessageId, undefined)
  assert.match(message.source.contentHash, /^sha256:[a-f0-9]{64}$/u)
})

test("needs-auth keeps the result pending and resumes it once after login", async () => {
  let authorized = false
  const states = []
  const fixture = runtimeFixture({
    async collaborationAuthorize() {
      return authorized
        ? {authorized: true, state: "active"}
        : {authorized: false, state: "needs-auth", retryable: false, reason: "sign in"}
    },
    async collaborationAccept(request) {
      states.push(request.status)
      return {delivery: {state: request.status}}
    },
    async collaborationStatus() {
      return collaborationStatus(proxy, "needs-auth", "needs-auth")
    },
  })
  const proxy = proxyEvent()
  await fixture.collaboration.acceptProxyEvent(proxy)
  assert.equal(fixture.agent.sent.length, 0)
  assert.equal(states.at(-1), "needs-auth")

  authorized = true
  await fixture.collaboration.status({sessionId: SESSION_ID})
  await fixture.collaboration.status({sessionId: SESSION_ID})
  assert.equal(fixture.agent.sent.length, 1)
  assert.equal(states[0], "needs-auth")
})

test("ordinary API requests need no fresh chat input and actual collaboration feedback retains its origin on replay", () => {
  const projection=createCollaborationReceiptProjection()
  const origin=state=>runtimeFixture({}, {projectionState: state}).collaboration.isFeedbackTurn(SESSION_ID)
  const message=source=>({type:"user/message",data:{source}})
  const initial=projection.init()
  assert.equal(origin(initial),false)
  const feedback=projection.apply(initial,message({kind:"loop-collaboration",deliveryId:"delivery"}))
  assert.equal(origin(projection.apply(feedback,{type:"turn/end"})),true)
  const user=projection.apply(feedback,message({kind:"user",rpcId:"next"}))
  assert.equal(origin(user),false)
})

test("restart replay does not reinject a committed result", async () => {
  const projection = createCollaborationReceiptProjection()
  const proxy = proxyEvent()
  const message = {
    id: "durable-message-1",
    role: "user",
    content: [{type: "text", text: "durable"}],
    source: {kind: "loop-collaboration", deliveryId: proxy.event.delivery.deliveryId},
  }
  const pending = projection.apply(projection.init(), {
    type: "agent/inbox/spliced",
    seq: 20,
    data: {target: "next-turn", start: 0, removedCount: 0, inserted: [message]},
  })
  const committed = projection.apply(pending, {
    type: "user/message",
    seq: 21,
    data: message,
  })
  const fixture = runtimeFixture({
    async collaborationStatus() {
      return collaborationStatus()
    },
  }, {projectionState: committed})
  await fixture.collaboration.status({sessionId: SESSION_ID})
  assert.equal(fixture.agent.sent.length, 0)
})

test("revoked and wrong-route deliveries never enter the Session", async () => {
  const revokedStates = []
  const revoked = runtimeFixture({
    async collaborationAuthorize() {
      return {authorized: false, state: "revoked", retryable: false, reason: "revoked"}
    },
    async collaborationAccept(request) {
      revokedStates.push(request.status)
      return {delivery: {state: request.status}}
    },
  })
  await revoked.collaboration.acceptProxyEvent(proxyEvent())
  assert.equal(revoked.agent.sent.length, 0)
  assert.equal(revokedStates.at(-1), "revoked")

  const conflictStates = []
  const conflict = runtimeFixture({
    async collaborationAccept(request) {
      conflictStates.push(request.status)
      return {delivery: {state: request.status}}
    },
  })
  const wrong = proxyEvent()
  wrong.event.event.targetSourceSessionId = "session-99999999-2222-3333-4444-555555555555"
  await conflict.collaboration.acceptProxyEvent(wrong)
  assert.equal(conflict.agent.sent.length, 0)
  assert.equal(conflictStates.at(-1), "binding-conflict")
})

test("one delivery authorization failure preserves unrelated accepted work and other deliveries", async () => {
  let authorized = false
  const fixture = runtimeFixture({
    async collaborationAuthorize() {
      return authorized ? {authorized: true} : {authorized: false, state: "binding-conflict", retryable: false}
    },
  })
  fixture.collaboration.activeIntentContexts.set(SESSION_ID, {intentRef: "unrelated-intent"})
  await fixture.collaboration.acceptProxyEvent(proxyEvent())
  assert.equal(fixture.agent.sent.length, 0)
  assert.equal(fixture.collaboration.activeIntentContexts.get(SESSION_ID)?.intentRef, "unrelated-intent")
  authorized = true
  const other = proxyEvent()
  other.event.eventId = "another-event"
  other.event.delivery = {...other.event.delivery, eventId: "another-event", deliveryId: "another-delivery", deliveryKey: "another-key"}
  other.event.event.eventId = "another-event"
  await fixture.collaboration.acceptProxyEvent(other)
  assert.equal(fixture.agent.sent.length, 1)
  assert.equal(fixture.agent.sent[0].message.source.eventId, "another-event")
  fixture.collaboration.dispose()
})

test("catalog invalidation is published without creating or authorizing a task delivery", async () => {
  let authorizations = 0
  const fixture = runtimeFixture({async collaborationAuthorize() { authorizations++; return {authorized: true} }})
  await fixture.collaboration.acceptProxyEvent({scope: eventScope(), event: {
    eventId: "catalog-only", kind: "directory.changed", occurredAt: "now",
  }})
  assert.equal(authorizations, 0)
  assert.equal(fixture.agent.sent.length, 0)
  assert.equal(fixture.collaboration.uiEvents.at(-1)?.kind, "directory.changed")
  fixture.collaboration.dispose()
})

test("personal assistant without a Worker supervisor ignores inbound work before admission", async () => {
  let authorizations = 0
  const fixture = runtimeFixture({async collaborationAuthorize() { authorizations++; return {authorized: true} }})
  for (const kind of ["work_available", "question_answered", "cancel_requested", "review_decision"]) {
    const event = proxyEvent()
    event.event.event.type = `collaboration.${kind}`
    event.event.delivery.eventKind = `collaboration.${kind}`
    await fixture.collaboration.acceptProxyEvent(event)
  }
  assert.equal(authorizations, 0)
  assert.equal(fixture.agent.sent.length, 0)
  fixture.collaboration.dispose()
})

test("malformed JSON fails before Task message admission", () => {
  const event = proxyEvent().event
  event.event.extra = undefined
  assert.throws(() => createCollaborationUserMessage(event.event, event.delivery), /JSON-serializable/u)
})
test("UI journal replays events after the acknowledged event id and survives reconnect", () => {
  const root = mkdtempSync(join(tmpdir(), "loop-collaboration-ui-"))
  const journal = new CollaborationUIJournal(root)
  const scope = {server: "https://loop.example", sessionId: SESSION_ID, bindingEpoch: "3"}
  journal.append(scope, {eventId: "event_1", sequence: 1, kind: "directory.changed", scope})
  journal.append(scope, {eventId: "event_2", sequence: 2, kind: "delivery.changed", scope})
  const replay = journal.load(scope, "event_1")
  assert.equal(replay.complete, true)
  assert.deepEqual(replay.events.map(event => event.eventId), ["event_2"])
  assert.equal(replay.events[0].scope.bindingEpoch, "3")
  assert.equal(journal.load(scope, "missing").complete, false)
})

test("subscription status changes reach the UI without a delivery envelope", async () => {
  const fixture = runtimeFixture({})
  await fixture.collaboration.acceptProxyEvent({
    scope: {sessionId: SESSION_ID},
    event: {
      eventId: "subscription-status-1",
      kind: "subscription.changed",
      occurredAt: new Date().toISOString(),
      status: {state: "backoff", reason: "Loop offline"},
    },
  })
  assert.equal(fixture.collaboration.uiEvents.length, 1)
  assert.equal(fixture.collaboration.uiEvents[0].scope.sessionId, SESSION_ID)
})

for (const continuationState of ["ready", "needs-explicit-target"]) {
  test(`existing Task tools survive turns while a new local call lazily binds ${continuationState}`, async () => {
    const calls = []
    const registrations = []
    const fixture = runtimeFixture({
      async collaborationContinuation(request) {
        calls.push(["bind", request])
        return {state: continuationState, continuationRef: request.continuationRef,
          tasks: [{taskId: "task_history", targetIds: ["mem_history"], allowedActions: ["followup"]}]}
      },
      async collaborationAction(request) { calls.push(["action", request]); return {receipt: {taskId: "task_history"}} },
    }, {defineTool: x => x, toolRegistrations: registrations})
    fixture.collaboration.observeStatus(SESSION_ID, {state: "ready", scope: eventScope(), active: [{taskId: "task_history"}]})
    const message = {id: "user_followup", role: "user", content: [{type: "text", text: "Make the poem shorter"}], source: {kind: "user", rpcId: "req_followup"}}
    await fixture.emit("agent/pre-step", {agent: fixture.agent, messages: [message]}, () => ({kind: "enter", messages: [message]}))
    assert.deepEqual(calls, [])
    assert.equal(fixture.ctx.systemPrompt.sections.length, 0)
    assert.equal(fixture.collaboration.intentContext(SESSION_ID), "")
    assert.equal(fixture.ctx.systemPrompt.contextDefinitions.some(x => x.name === "loop-collaboration-continuation"), false)
    assert.deepEqual(visibleToolNames(registrations, fixture.agent), ["collaboration_cancel", "collaboration_directory", "collaboration_end_management", "collaboration_followup", "collaboration_inspect", "collaboration_review", "collaboration_wait"])
    fixture.collaboration.enableTools(SESSION_ID)
    assert.ok(visibleToolNames(registrations, fixture.agent).includes("collaboration_followup"))
    assert.deepEqual(calls, [], "loading a guide does not contact Loop")
    await fixture.collaboration.runAction("followup", SESSION_ID, {taskId: "task_history", target: {targetId: "mem_history"}, body: "Shorter"})
    assert.deepEqual(calls.map(x => x[0]), ["bind", "action"])
    assert.equal(calls[0][1].acceptedMessageId, message.id)
    assert.equal(calls[1][1].arguments.taskId, "task_history")
    assert.ok(calls[1][1].continuationRef)
    fixture.emit("session/event", fixture.agent.session, {type: "turn/end"})
    assert.deepEqual(visibleToolNames(registrations, fixture.agent), ["collaboration_cancel", "collaboration_directory", "collaboration_end_management", "collaboration_followup", "collaboration_inspect", "collaboration_review", "collaboration_wait"])
    await assert.rejects(fixture.collaboration.runAction("followup", SESSION_ID, {taskId: "task_history"}), /current accepted user instruction/)
  })
}

test("guides expose tools after not-bound status without granting write authority", async () => {
  const registrations = []
  let writes = 0
  const fixture = runtimeFixture({async collaborationAction() { writes++; return {} }},
    {defineTool: x => x, toolRegistrations: registrations})
  try {
    fixture.collaboration.observeStatus(SESSION_ID, {state: "not-bound"})
    assert.deepEqual(visibleToolNames(registrations, fixture.agent), [])
    fixture.collaboration.enableTools(SESSION_ID)
    assert.ok(visibleToolNames(registrations, fixture.agent).includes("collaboration_dispatch"))
    fixture.collaboration.observeStatus(SESSION_ID, {state: "not-bound"})
    assert.ok(visibleToolNames(registrations, fixture.agent).includes("collaboration_dispatch"))
    fixture.collaboration.observeStatus(SESSION_ID, {state: "revoked"})
    assert.ok(visibleToolNames(registrations, fixture.agent).includes("collaboration_dispatch"))
    await assert.rejects(fixture.collaboration.runAction("dispatch", SESSION_ID, {}), /current accepted user instruction/)
    assert.equal(writes, 0)
    fixture.emit("session/event", fixture.agent.session, {type: "turn/end"})
    assert.deepEqual(visibleToolNames(registrations, fixture.agent), [])
  } finally { fixture.collaboration.dispose() }
})

test("lazy continuation rejects revocation, persistence failure and ended turns", async () => {
  for (const change of ["generation", "revoke", "persistence", "turn-end"]) {
    let actions = 0
    const fixture = runtimeFixture({
      async collaborationContinuation(request) {
        if (change === "generation") fixture.collaboration.observeBindingScope(SESSION_ID, {...eventScope(), bindingEpoch: "4"})
        if (change === "revoke") fixture.collaboration.clearSessionActivation(SESSION_ID)
        if (change === "turn-end") fixture.emit("session/event", fixture.agent.session, {type: "turn/end"})
        return {state: "ready", continuationRef: request.continuationRef, tasks: [{taskId: "old"}]}
      },
      async collaborationAction() { actions++; return {} },
    })
    fixture.collaboration.observeBindingScope(SESSION_ID, eventScope())
    if (change === "persistence") fixture.ctx.sessions.flush = async () => false
    const message = {id: "message_1", role: "user", content: [{type: "text", text: "Accept"}], source: {kind: "user", rpcId: "request_1"}}
    await fixture.emit("agent/pre-step", {agent: fixture.agent, messages: [message]}, () => ({kind: "enter", messages: [message]}))
    await assert.rejects(fixture.collaboration.runAction("followup", SESSION_ID, {taskId: "old"}),
      change === "persistence" ? /persistence/ : /binding changed|turn ended/)
    assert.equal(actions, 0)
    assert.equal(fixture.collaboration.activeContinuations.has(SESSION_ID), false)
  }
})

test("Host bootstrap starts persisted-route watches without a client status call", async () => {
  const watched = []
  const actions = {
    async collaborationBindings() {
      return {bindings: [{
        sessionId: SESSION_ID,
        bindingId: "cbind_1",
        bindingEpoch: "3",
        state: "ready",
      }]}
    },
    async collaborationWatch(request) {
      watched.push(request)
      return {subscription: {state: "live"}}
    },
  }
  const fixture = runtimeFixture(actions)
  fixture.collaboration.actions = () => undefined
  fixture.collaboration.setActions(actions)
  await fixture.collaboration.bootstrapWatches()
  assert.deepEqual(watched, [{
    sessionId: SESSION_ID,
    bindingId: "cbind_1",
    bindingEpoch: "3",
    ensure: true,
  }])
  await fixture.collaboration.acceptProxyEvent({
    scope: eventScope(),
    event: {
      eventId: "subscription-live",
      kind: "subscription.changed",
      occurredAt: new Date().toISOString(),
      status: {state: "live"},
    },
  })
})

test("headless watch bootstrap recovers from one transient failure with bounded backoff", async () => {
  let watchAttempts = 0
  const actions = {
    async collaborationBindings() {
      return {bindings: [{
        serverBaseUrl: "https://loop.example",
        accountId: "user_1",
        installationId: "installation_1",
        agentMemberId: "member_1",
        sessionId: SESSION_ID,
        bindingId: "cbind_1",
        bindingEpoch: "3",
        state: "ready",
      }]}
    },
    async collaborationWatch() {
      watchAttempts += 1
      if (watchAttempts === 1) throw new Error("transient stream failure")
      return {subscription: {state: "live"}}
    },
  }
  const fixture = runtimeFixture(actions)
  fixture.collaboration.actions = () => actions
  await fixture.collaboration.bootstrapWatches()
  assert.equal(watchAttempts, 1)
  await new Promise(resolve => setTimeout(resolve, 1_150))
  assert.equal(watchAttempts, 2)
  await new Promise(resolve => setTimeout(resolve, 1_150))
  assert.equal(watchAttempts, 2)
  fixture.collaboration.dispose()
})

test("Host rejects a route with the right Session only when binding/device/Agent conflicts", async () => {
  const fixture = runtimeFixture({})
  const conflicted = proxyEvent()
  conflicted.event.event.deviceBindingId = "extbind_foreign"
  await fixture.collaboration.acceptProxyEvent(conflicted)
  assert.equal(fixture.agent.sent.length, 0)
  assert.equal(fixture.collaboration.uiEvents.at(-1).delivery.state, "binding-conflict")

  const wrongSource = proxyEvent()
  wrongSource.event.event.targetSourceSessionId = "session-99999999-2222-3333-4444-555555555555"
  wrongSource.event.event.sourceSessionId = "session-99999999-2222-3333-4444-555555555555"
  await fixture.collaboration.acceptProxyEvent(wrongSource)
  assert.equal(fixture.agent.sent.length, 0)
})

test("duplicate transport replay is admitted once to the exact Session", async () => {
  const fixture = runtimeFixture({})
  const duplicate = proxyEvent()
  await fixture.collaboration.acceptProxyEvent(duplicate)
  await fixture.collaboration.acceptProxyEvent(structuredClone(duplicate))
  assert.equal(fixture.agent.sent.length, 1)
  assert.equal(fixture.agent.sent[0].message.source.eventId, "cevt_result_1")
})


test("official Harness AgentLoop persists the complete Loop result as remote user input", async () => {
  const [{Context}, testkit, llm, sessionModule] = await Promise.all([
    import("@deepseek-ai/cordis"),
    import("@deepseek-ai/dsh-agent-loop-testkit"),
    import("@deepseek-ai/dsh-llm"),
    import("@deepseek-ai/dsh-session"),
  ])
  const modelInputs = []
  let continuationCalls = 0
  class TextAdapter extends llm.LlmAdapter {
    async resolveModel(provider, model) {
      return {provider, id: model, name: model}
    }
    async *stream(options) {
      modelInputs.push(JSON.stringify(options.messages))
      yield {type: "block-start", index: 0, blockType: "text"}
      yield {type: "text-delta", index: 0, text: "acknowledged"}
      yield {type: "block-end", index: 0, block: {type: "text", text: "acknowledged"}}
      yield {type: "usage", usage: {inputTokens: 1, outputTokens: 1}}
      yield {type: "finish", reason: {kind: "stop"}}
    }
  }

  const durableRoot = mkdtempSync(join(tmpdir(), "loop-official-continuation-"))
  const ctx = new Context()
  ctx.on("session/flush", session => {
    writeFileSync(join(durableRoot, "events.json"), JSON.stringify(session.snapshotEvents()))
  })
  const errors = []
  ctx.on("agent/error", ({error}) => { errors.push(error.message) })
  await testkit.mountAgentLoopTestDependencies(ctx)
  ctx.llm.registerAdapter(["mock"], new TextAdapter())
  const harness = await testkit.mountAgentLoopTestHarness(ctx)
  const agent = await harness.create(sessionModule.SessionId("official-result-delivery"), {
    provider: "mock",
    model: "mock",
  })
  const officialSessionId = String(agent.session.id)
  const proxy = proxyEvent()
  proxy.scope = eventScope(officialSessionId)
  proxy.event.delivery.sessionId = officialSessionId
  proxy.event.delivery.sourceSessionId = officialSessionId
  proxy.event.event.originSourceSessionId = officialSessionId
  proxy.event.event.targetSourceSessionId = officialSessionId
  proxy.event.event.sourceSessionId = officialSessionId
  const body = `${"full-result-line\n".repeat(1800)}OFFICIAL_FULL_BODY_MARKER`
  proxy.event.event.body = body
  proxy.event.event.bodyBytes = Buffer.byteLength(body)
  proxy.event.event.truncated = false
  proxy.event.event.payload.body = body
  proxy.event.event.payload.bodyBytes = Buffer.byteLength(body)
  proxy.event.event.payload.truncated = false
  proxy.event.event.contentHash = `sha256:${createHash("sha256").update(body).digest("hex")}`
  proxy.event.event.payload.contentHash = proxy.event.event.contentHash

  const runtime = new LoopCollaborationRuntime({
    ctx,
    sessions: ctx.sessions,
    actions: () => ({
      async collaborationAuthorize() {
        return {authorized: true, state: "active"}
      },
      async collaborationAccept(request) {
        return {delivery: {state: request.status}}
      },
      async collaborationContinuation(request) {
        continuationCalls++
        assert.match(readFileSync(join(durableRoot, "events.json"), "utf8"), /official_followup/u)
        assert.equal(agent.session.snapshotEvents().some(event =>
          event.type === "user/message" && event.data.id === "official_followup"), false)
        return {
          state: "ready", continuationRef: request.continuationRef,
          acceptedTextDigest: request.payloadDigest,
          tasks: [{taskId: "official_review_task", allowedActions: ["review"], targetIds: ["agt_1"]}],
        }
      },
    }),
    getSessionController: () => ({
      async resolveAgent(sessionId) {
        return {agent: String(agent.session.id) === String(sessionId) ? agent : undefined}
      },
    }),
  })
  try {
    await runtime.acceptProxyEvent(proxy)
    await agent.whenIdle()
    const delivered = agent.session.snapshotEvents().find(event =>
      event.type === "user/message" &&
      event.data.source?.kind === "loop-collaboration")
    assert.ok(delivered, "official Session must contain the injected user message")
    assert.match(delivered.data.content[0].text, /OFFICIAL_FULL_BODY_MARKER/u)
    assert.equal(delivered.data.source.bindingEpoch, "3")
    assert.match(delivered.data.content[0].text, /message_id: msg_result_1/u)
    assert.equal(delivered.data.source.messageId, "loop-collaboration:delivery_1")
    runtime.activeWorkCounts.set(officialSessionId, 1)
    agent.send({
      id: "official_followup", role: "user",
      content: [{type: "text", text: "Accept the result"}],
      source: {kind: "user", rpcId: "official_request"},
    }, "next-turn", true)
    await agent.whenIdle()
    assert.deepEqual(errors, [])
    assert.equal(continuationCalls, 0)
    assert.equal(modelInputs.length, 2, "plain follow-up must reach the model without a client callback")
    assert.doesNotMatch(modelInputs.at(-1), /official_review_task|continuation_ref:/u)
    assert.ok(agent.session.snapshotEvents().some(event =>
      event.type === "user/message" && event.data.id === "official_followup"))
  } finally {
    runtime.dispose()
    await ctx.dispose?.()
    rmSync(durableRoot, {recursive: true, force: true})
  }
})


test("native Task comments reach the Coordinator without external Worker execution", async () => {
 const proxy = proxyEvent()
 const event = proxy.event.event
 proxy.event.delivery.eventKind = event.type = "collaboration.task_message"
 delete proxy.event.delivery.runId
 for (const key of ["runId", "attempt", "executionGeneration", "resultMessageId", "contentHash"]) delete event[key]
 event.originBindingId = event.targetBindingId
 event.originBindingEpoch = event.targetBindingEpoch
 event.originSourceSessionId = event.targetSourceSessionId
 event.messageId = "native-comment"
 event.body = "Please confirm the source."
 event.payload = {taskId: event.taskId, messageId: event.messageId, body: event.body}
 const fixture = runtimeFixture()
 fixture.agent.status = "running"
 await fixture.collaboration.acceptProxyEvent(proxy)
 assert.equal(fixture.agent.sent.length, 1)
 assert.equal(fixture.agent.sent[0].target, "next-step")
 const serialized = JSON.stringify(fixture.agent.sent[0].message)
 assert.match(serialized, /Please confirm the source/u)
 assert.match(serialized, /collaboration_followup on this same Task/u)
 assert.match(serialized, /task_id: tsk_1/u)
 await fixture.collaboration.acceptProxyEvent(proxy)
 assert.equal(fixture.agent.sent.length, 1, "duplicate delivery must not wake the Coordinator twice")
})


test("delegation errors preserve the target, cause and recovery advice for the DSH tool", async () => {
  const message = "Agent Writer (mem_writer) has no active executor Session. Open its host and enable task execution. No Task was created."
  const h = runtimeFixture({
    async collaborationAction() { throw Object.assign(new Error(message), {code: "loop-host/permission-denied"}) },
  })
  h.collaboration.activeIntentContexts.set(SESSION_ID, {intentRef: "current"})
  await assert.rejects(h.collaboration.runAction("dispatch", SESSION_ID, {target: {targetId: "mem_writer", kind: "agent"}}), error => {
    assert.equal(error.message, message)
    assert.equal(error.code, "loop-host/permission-denied")
    return true
  })
  h.collaboration.dispose()
})

function claimedIntentFixture(overrides = {}) {
  const calls = []
  let serial = 0
  const fixture = runtimeFixture({
    async collaborationPrepareIntent(input) {
      calls.push(["prepare", input])
      return {intentRef: `intent_${++serial}`, state: "prepared", expiresAt: input.expiresAt ?? new Date(Date.now() + 60_000).toISOString()}
    },
    async collaborationCancel(input) { calls.push(["cancel", input]); return {state: "cancelled"} },
    async collaborationBindIntent(input) { calls.push(["bind", input]); return {state: "bound"} },
    async collaborationActivateIntent(input) { calls.push(["activate", input]); return {state: "activated"} },
    ...overrides,
  })
  const token = '<loop-collaboration type="agent" target="agent_1" ref="loop-collaboration:agent/agent_1">Agent</loop-collaboration>'
  const prepare = (extra = {}) => fixture.collaboration.prepareIntent({
    sessionId: SESSION_ID, serializedText: token, activateOnClaim: true,
    references: [{targetType: "agent", targetId: "agent_1"}],
    shareScope: {scope: "task-description", resourceRefs: [], expandedAudience: true}, ...extra,
  })
  const step = (text = `${token} do this`, requestId = "request_claim", signal) => {
    const message = {id: `message_${requestId}`, role: "user", source: {kind: "user", rpcId: requestId}, content: [{type: "text", text}]}
    return fixture.emit("agent/pre-step", {agent: fixture.agent, messages: [message], signal}, () => ({kind: "enter", messages: [message]}))
  }
  return {...fixture, calls, prepare, step, token}
}

test("Host activates the exact durable input without any Client acceptance callback", async () => {
  const f = claimedIntentFixture()
  const prepared = await f.prepare()
  assert.equal(prepared.activationOwner, "host")
  await f.step()
  assert.deepEqual(f.calls.map(([name]) => name), ["prepare", "cancel", "prepare", "bind", "activate"])
  const bound = f.calls.find(([name]) => name === "bind")[1]
  assert.equal(bound.acceptedSerializedText, `${f.token} do this`)
  assert.equal(bound.requestId, "request_claim")
  assert.equal(f.collaboration.activeIntentContexts.get(SESSION_ID).targets[0].targetId, "agent_1")
  assert.equal(f.collaboration.uiEvents.at(-1).intent.sourceIntentRef, prepared.intentRef)
  assert.equal(f.collaboration.uiEvents.at(-1).intent.state, "activated")
})

test("ordinary input neither claims nor waits on a prepared mention", async () => {
  const f = claimedIntentFixture()
  await f.prepare()
  await f.step("ordinary text")
  assert.deepEqual(f.calls.map(([name]) => name), ["prepare"])
  await f.step()
  assert.equal(f.calls.at(-1)[0], "activate")
})

test("failed Host activation releases the Session and permits a freshly selected mention", async () => {
  let fail = true
  const f = claimedIntentFixture({async collaborationActivateIntent() {
    if (fail) throw new Error("authorization revoked")
    return {state: "activated"}
  }})
  await f.prepare()
  await assert.rejects(f.step(), /authorization revoked/)
  assert.equal(f.collaboration.prepared.has(SESSION_ID), false)
  assert.equal(f.collaboration.explicitPending.has(SESSION_ID), false)
  await f.step("你看我还是报错啊", "ordinary")
  fail = false
  await f.prepare()
  await f.step(`${f.token} retry`, "fresh")
  assert.equal(f.collaboration.prepared.get(SESSION_ID).state, "activated")
})

test("unconfirmed or expired references cannot authorize a claimed message", async () => {
  const f = claimedIntentFixture()
  await assert.rejects(f.prepare({shareScope: {expandedAudience: false}}), /Confirm the share scope/)
  assert.equal(f.calls.length, 0)
  await f.prepare({expiresAt: "2000-01-01T00:00:00Z"})
  await assert.rejects(f.step(), /expired/)
  assert.deepEqual(f.calls.map(([name]) => name), ["prepare"])
  await f.step("plain message", "plain")
})

test("ending a turn during activation prevents a late completion restoring its authority", async () => {
  let release
  let started
  const entered = new Promise(resolve => { started = resolve })
  const f = claimedIntentFixture({async collaborationActivateIntent() {
    started()
    return await new Promise(resolve => { release = resolve })
  }})
  await f.prepare()
  const step = f.step()
  await entered
  f.emit("session/event", f.agent.session, {type: "turn/end", data: {reason: {kind: "interrupted"}}})
  release({state: "activated"})
  await assert.rejects(step, /could not be activated/)
  assert.equal(f.collaboration.activeIntentContexts.has(SESSION_ID), false)
  await f.step("plain message", "plain")
})

test("a delayed failed operation cannot discard a newer prepared submission", async () => {
  let release
  let started
  const entered = new Promise(resolve => { started = resolve })
  const f = claimedIntentFixture({async collaborationCancel() {
    started()
    await new Promise(resolve => { release = resolve })
    return {state: "cancelled"}
  }})
  await f.prepare()
  const step = f.step()
  await entered
  f.collaboration.clearSessionActivation(SESSION_ID)
  const newer = await f.prepare()
  release()
  await assert.rejects(step, /submission changed/)
  assert.equal(f.collaboration.prepared.get(SESSION_ID).intentRef, newer.intentRef)
})

test("late activation cannot drop a newly selected collaborator", async () => {
  const started = Promise.withResolvers()
  const finish = Promise.withResolvers()
  const f = claimedIntentFixture({async collaborationActivateIntent() {
    started.resolve()
    return await finish.promise
  }})
  await f.prepare()
  const first = f.step()
  await started.promise
  f.emit("session/event", f.agent.session, {type: "turn/end"})
  const replacement = await f.prepare()
  finish.resolve({state: "activated"})
  await assert.rejects(first)
  assert.equal(f.collaboration.prepared.get(SESSION_ID)?.intentRef, replacement.intentRef)
})

test("continuation retry keeps the same evidence after user/message is appended", async () => {
  const sequences = []
  const f = runtimeFixture({async collaborationContinuation(request) {
    sequences.push(request.acceptedSequence)
    if (sequences.length === 1) throw new Error("Lost reply")
    return {state: "ready", tasks: []}
  }})
  const message = {id: "message", source: {kind: "user", rpcId: "request"}, content: [{type: "text", text: "Follow up"}]}
  await f.emit("agent/pre-step", {agent: f.agent, messages: [message]}, () => ({kind: "enter", messages: [message]}))
  const bind = () => f.collaboration.ensureCurrentContinuation(SESSION_ID)
  await assert.rejects(bind(), /Lost reply/)
  f.emit("session/event", f.agent.session, {type: "user/message", seq: 3, data: message})
  await bind()
  assert.deepEqual(sequences, [2, 2])
})

test("a delayed client continuation cannot re-enable an ended turn", async () => {
  const started = Promise.withResolvers()
  const finish = Promise.withResolvers()
  let calls = 0
  const f = runtimeFixture({async collaborationContinuation() {
    calls++
    started.resolve()
    return await finish.promise
  }})
  const message = {id: "message", source: {kind: "user", rpcId: "request"}, content: [{type: "text", text: "Follow up"}]}
  await f.emit("agent/pre-step", {agent: f.agent, messages: [message]}, () => ({kind: "enter", messages: [message]}))
  f.emit("session/event", f.agent.session, {type: "user/message", seq: 3, data: message})
  const bind = () => f.collaboration.bindContinuation({sessionId: SESSION_ID, requestId: "request",
    acceptedSerializedText: "Follow up", payloadDigest: "sha256:" + createHash("sha256").update("Follow up").digest("hex"), continuationRef: "continue"})
  const first = bind()
  await started.promise
  f.emit("session/event", f.agent.session, {type: "turn/end"})
  finish.resolve({state: "ready", tasks: [{taskId: "old"}]})
  await assert.rejects(first, /turn ended/)
  await assert.rejects(bind(), /turn ended/)
  assert.equal(calls, 1)
  assert.equal(f.collaboration.activeContinuations.has(SESSION_ID), false)
})

test("Host-owned activation can finish after the former two-second Client deadline", async () => {
  const f = claimedIntentFixture({async collaborationActivateIntent() {
    await new Promise(resolve => setTimeout(resolve, 2100))
    return {state: "activated"}
  }})
  await f.prepare()
  await f.step()
  assert.equal(f.collaboration.prepared.get(SESSION_ID).state, "activated")
})

test("failure at each claimed-message stage leaves ordinary input usable", async () => {
  for (const stage of ["persist", "cancel", "prepare", "bind"]) {
    const f = claimedIntentFixture()
    await f.prepare()
    if (stage === "persist") f.ctx.sessions.flush = async () => false
    else {
      const method = {cancel: "collaborationCancel", prepare: "collaborationPrepareIntent", bind: "collaborationBindIntent"}[stage]
      f.actions[method] = async () => { throw new Error(`failure at ${stage}`) }
    }
    await assert.rejects(f.step())
    assert.equal(f.collaboration.prepared.has(SESSION_ID), false, stage)
    assert.equal(f.collaboration.pendingAccepted?.has(SESSION_ID) ?? false, false, stage)
    await f.step("ordinary follow-up", `plain_${stage}`)
  }
})

test("abort during binding cannot publish an active intent", async () => {
  const controller = new AbortController()
  const f = claimedIntentFixture({async collaborationBindIntent() {
    controller.abort()
    return {state: "bound"}
  }})
  await f.prepare()
  await assert.rejects(f.step(`${f.token} work`, "interrupted", controller.signal))
  assert.equal(f.collaboration.prepared.has(SESSION_ID), false)
  assert.equal(f.calls.some(([name]) => name === "activate"), false)
  await f.step("ordinary follow-up", "plain")
})


test("queued Host reference cannot be replaced by another submission before claim", async () => {
  const f = claimedIntentFixture()
  const first = await f.prepare()
  await assert.rejects(f.prepare(), /still pending/)
  assert.equal(f.collaboration.prepared.get(SESSION_ID).intentRef, first.intentRef)
  await f.step()
  await f.prepare()
})


test("official Harness loads collaboration tools on demand and follows the task from history", async () => {
  const [{Context}, testkit, llm, sessions, {defineTool}] = await Promise.all([
    import("@deepseek-ai/cordis"),
    import("@deepseek-ai/dsh-agent-loop-testkit"),
    import("@deepseek-ai/dsh-llm"),
    import("@deepseek-ai/dsh-session"),
    import("@deepseek-ai/dsh-tools"),
  ])
  const requests = []
  const operations = []
  let mode = "dispatch"
  let step = 0
  class Adapter extends llm.LlmAdapter {
    async resolveModel(provider, id) { return {provider, id, name: id} }
    async *stream(options) {
      requests.push({mode, tools: options.tools?.map(t => t.name) ?? [], messages: JSON.stringify(options.messages)})
      let call
      if (mode === "natural") {
        const actions = [
          ["bash", {command: "loop-proxy guide tasks"}],
          ["collaboration_directory", {kinds: ["agent"], query: "Worker", limit: 50}],
          ["collaboration_prepare", {targetIds: ["mem_worker"]}],
          ["collaboration_dispatch", {tasks: [{title: "Review", description: "Review the proposed design", assignee: "mem_worker"}]}],
        ]
        const action = actions[step++]
        if (action) call = {type: "tool-call", id: `natural-${step}`, name: action[0], arguments: JSON.stringify(action[1])}
      } else if (mode === "unbound-guide" && step++ === 0) {
        call = {type: "tool-call", id: "unbound-guide", name: "bash", arguments: JSON.stringify({command: "loop-proxy guide agents"})}
      } else if (mode === "dispatch" && step++ === 0) {
        call = {type: "tool-call", id: "dispatch-guide", name: "bash", arguments: JSON.stringify({command: "loop-proxy guide tasks"})}
      } else if (mode === "dispatch" && step === 2) {
        call = {type: "tool-call", id: "dispatch", name: "collaboration_dispatch", arguments: JSON.stringify({tasks: [{title: "Poem", description: "Write a complete poem", assignee: "mem_worker"}]})}
      } else if (mode === "followup" && step++ === 0) {
        call = {type: "tool-call", id: "read-guide", name: "bash", arguments: JSON.stringify({command: "loop-proxy guide tasks"})}
      } else if (mode === "followup" && step === 2) {
        assert.match(JSON.stringify(options.messages), /task_from_history/)
        call = {type: "tool-call", id: "followup", name: "collaboration_followup", arguments: JSON.stringify({taskId: "task_from_history", targetId: "mem_worker", body: "Make it shorter"})}
      }
      if (call) {
        yield {type: "block-start", index: 0, blockType: "tool-call"}
        yield {type: "tool-call-delta", index: 0, id: call.id, name: call.name, argumentsDelta: call.arguments}
        yield {type: "block-end", index: 0, block: call}
      } else {
        yield {type: "block-start", index: 0, blockType: "text"}
        yield {type: "text-delta", index: 0, text: "Done"}
        yield {type: "block-end", index: 0, block: {type: "text", text: "Done"}}
      }
      yield {type: "usage", usage: {inputTokens: 1, outputTokens: 1}}
      yield {type: "finish", reason: {kind: "stop"}}
    }
  }
  const ctx = new Context()
  const errors = []
  ctx.on("agent/error", ({error}) => errors.push(error.message))
  ctx.on("session/flush", () => {})
  await testkit.mountAgentLoopTestDependencies(ctx)
  ctx.llm.registerAdapter(["mock"], new Adapter())
  const harness = await testkit.mountAgentLoopTestHarness(ctx)
  const agent = await harness.create(sessions.SessionId(SESSION_ID), {provider: "mock", model: "mock"})
  let intentSerial = 0
  const naturalScope = {...eventScope(), boardId: "chn_1", bindingRevision: "3", coordinatorAgentId: "agt_self",
    serverBaseUrl: "https://loop.example.test", accountId: "human_1", installationId: "installation_1"}
  const runtime = new LoopCollaborationRuntime({ctx, sessions: ctx.sessions, defineTool,
    withSessionContext: async (_id, _signal, operation) => operation({defaultChannelId: "chn_1", loopWorkspaceId: "wsp_1", agent: {id: "agt_self"}}, undefined, async () => ({channelId:"chn_1",members:[{memberId:"mem_worker"}],hasMore:false})),
    actions: () => ({
    async collaborationDirectory() { return {entries: [{targetId: "mem_worker", memberId: "mem_worker", targetType: "agent", visible: true, agentId: "agt_worker", capability: {assignable: true}}]} },
    async collaborationStatus() { return {state: "unbound"} },
    async collaborationBind() { return {scope: naturalScope} },
    async collaborationPrepareIntent() { return {intentRef: `intent_${++intentSerial}`, state: "prepared"} },
    async collaborationCancel() { return {state: "cancelled"} },
    async collaborationBindIntent() { return {state: "bound"} },
    async collaborationActivateIntent() { return {state: "activated"} },
    async collaborationContinuation(request) {
      operations.push({kind: "continuation", request})
      return {state: "ready", continuationRef: request.continuationRef, tasks: [{taskId: "task_from_history", targetIds: ["mem_worker"], allowedActions: ["followup"]}]}
    },
    async collaborationAction(request) { operations.push({kind: "action", request}); return {receipt: {taskId: request.arguments.taskId ?? "task_from_history", state: "accepted"}} },
  })})
  runtime.observeStatus(SESSION_ID, {state: "ready", scope: naturalScope, active: [{taskId: "task_from_history"}]})
  ctx.tools.register(defineTool({name: "bash", description: "Virtual command", parameters: {command: {type: "string", required: true}},
    output: {schema: {type: "object", additionalProperties: true}, render: (_args, value) => [{type: "text", text: value.stdout.text}]},
    async execute() { throw Error("No real shell may run") },
  }))
  const bridge = createLoopProxyBridge({on: ctx.on.bind(ctx), get: name => name === "loopHostService" ? {collaboration: runtime} : ctx.get(name)}, {
    skillPath: fileURLToPath(new URL("../../../skills/loop-proxy-harness/SKILL.md", import.meta.url)),
    send() { throw Error("No broker may run") }, connected: () => false,
  })
  const send = async (id, text) => {
    agent.send({id, role: "user", content: [{type: "text", text}], source: {kind: "user", rpcId: id}}, "next-turn", true)
    await agent.whenIdle()
  }
  try {
    const mention = '<loop-collaboration type="agent" target="mem_worker" ref="loop-collaboration:agent/mem_worker">wan_ds</loop-collaboration>'
    await runtime.prepareIntent({sessionId: SESSION_ID, serializedText: mention, activateOnClaim: true,
      references: [{targetType: "agent", targetId: "mem_worker"}],
      shareScope: {scope: "task-description", resourceRefs: [], expandedAudience: true}})
    await send("dispatch", `${mention} write a poem`)
    assert.deepEqual(operations.map(x => x.request.action), ["dispatch"])
    assert.equal(runtime.activeIntentContexts.size, 0)
    mode = "result"
    const result = proxyEvent()
    result.event.event.taskId = "task_from_history"
    result.event.delivery.taskId = "task_from_history"
    const resultMessage = createCollaborationUserMessage(result.event.event, result.event.delivery)
    agent.send(resultMessage, "next-turn", true)
    await agent.whenIdle()
    mode = "plain"
    await send("plain", "Explain recursion")
    assert.equal(operations.length, 1)
    assert.ok(requests.filter(r => r.mode !== "dispatch").every(r => !r.tools.includes("collaboration_followup")))
    assert.ok(requests.every(r => !/Loop collaboration is active|continuation_ref:|Loop Tasks currently active/.test(r.messages)))
    mode = "followup"
    step = 0
    await send("requested-followup", "Make the earlier poem shorter")
    assert.deepEqual(errors, [])
    assert.deepEqual(operations.map(x => x.kind), ["action", "continuation", "action"])
    assert.equal(operations[1].request.acceptedMessageId, "requested-followup")
    assert.equal(operations[2].request.arguments.taskId, "task_from_history")
    assert.equal(operations.filter(x => x.request.action === "dispatch").length, 1)
    const turns = requests.filter(r => r.mode === "followup")
    assert.equal(turns[0].tools.includes("collaboration_followup"), false)
    assert.equal(turns[1].tools.includes("collaboration_followup"), true)
    mode = "plain-after"
    await send("plain-after", "What is a binary tree?")
    assert.equal(operations.length, 3)
    assert.equal(requests.at(-1).tools.includes("collaboration_followup"), false)
    assert.deepEqual(errors, [])
    runtime.observeStatus(SESSION_ID, {state: "not-bound"})
    mode = "unbound-guide"
    step = 0
    await send("unbound-guide", "Find the available Loop collaboration tools")
    const discovery = requests.filter(r => r.mode === "unbound-guide")
    assert.equal(discovery[0].tools.includes("collaboration_dispatch"), false)
    assert.equal(discovery[1].tools.includes("collaboration_dispatch"), true)
    assert.equal(operations.length, 3, "discovery performs no write or binding")
    mode = "natural"
    step = 0
    await send("natural-request", "Choose a suitable Agent and ask it to review the proposed design")
    assert.deepEqual(errors, [])
    const naturalRequests = requests.filter(r => r.mode === "natural")
    assert.equal(naturalRequests[0].tools.includes("collaboration_prepare"), false)
    assert.equal(naturalRequests[1].tools.includes("collaboration_prepare"), true)
    const prepareResult = JSON.parse(naturalRequests.at(-1).messages).find(message => message.toolCallId === "natural-3")
    assert.match(JSON.stringify(prepareResult), /No Task or invitation has been sent/u)
    assert.equal(operations.length, 4)
    assert.equal(operations.at(-1).request.action, "dispatch")
    assert.equal(operations.at(-1).request.arguments.task.title, "Review")
    assert.equal(runtime.currentUserInputs.size, 0)
  } finally {
    bridge.dispose()
    runtime.dispose()
    await ctx.dispose?.()
  }
})


test("dispatch uses the canonical single Task shape and rejects unsupported input before I/O", async () => {
  const {defineTool} = await import("@deepseek-ai/dsh-tools")
  const {dispatchTaskSchema} = await import("../collaboration-task-schema.mjs")
  const calls = []
  const fixture = runtimeFixture({
    async collaborationDirectory(request) { calls.push(["directory", request]); return {entries: [{memberId: "mem_one", targetId: "mem_one", targetType: "agent", capability: {assignable: true}}]} },
    async collaborationAction(request) { calls.push(["action", request]); return {receipt: {state: "accepted"}} },
  })
  const tools = new Map()
  fixture.ctx.tools.register = definition => tools.set(definition.name, definition)
  fixture.collaboration.registerTools(defineTool)
  fixture.collaboration.activeIntentContexts.set(SESSION_ID, {intentRef: "exact-intent"})
  const tool = tools.get("collaboration_dispatch")
  assert.deepEqual(Object.keys(tool.parameters.properties), ["tasks"])
  assert.deepEqual(Object.keys(tool.parameters.properties.tasks.items.properties), ["title", "description", "assignee"])
  assert.equal(dispatchTaskSchema.properties.tasks.minItems, 1)
  assert.equal(dispatchTaskSchema.properties.tasks.maxItems, 1)
  const exec = {agent: fixture.agent, signal: new AbortController().signal}
  const valid = {title: "Task", description: "Work", assignee: "mem_one"}
  for (const args of [null, {}, {tasks: null}, {tasks: []}, {tasks: [valid, valid]}, {tasks: [null]},
    {tasks: [{...valid, title: " "}]}, {tasks: [{...valid, title: "界".repeat(513)}]},
    {tasks: [{...valid, description: "x".repeat(8193)}]}, {tasks: [{...valid, assignee: ""}]},
    {tasks: [{title: "Missing assignee"}]}, {tasks: [{...valid, boardId: "other"}]},
    {tasks: [valid], goal: "conflicting legacy goal"}, {task: valid}, {tasks: [{...valid, acceptanceCriteria: []}]},
  ]) {
    await assert.rejects(tool.execute(args, exec))
    assert.equal(calls.length, 0, JSON.stringify(args))
  }
  await tool.execute({tasks: [{...valid, title: "界".repeat(512)}]}, exec)
  assert.deepEqual(calls.map(([kind]) => kind), ["directory", "action"])
  const request = calls[1][1]
  assert.equal(request.intentRef, "exact-intent")
  assert.deepEqual(request.arguments.target, {targetId: "mem_one", kind: "agent"})
  assert.equal(request.arguments.task.goal, "Work")
  assert.equal(request.arguments.task.acceptanceCriteria, "")
  assert.equal(request.arguments.parentTaskId, undefined)
  assert.equal(request.arguments.dependsOnTaskIds, undefined)
  calls.length = 0
  await assert.rejects(tool.execute({tasks: [{...valid, assignee: "agent-alias"}]}, exec), /exact directory/)
  assert.deepEqual(calls.map(([kind]) => kind), ["directory"])
})

test("generated dispatch schema matches the configured canonical Task catalog", {skip: !process.env.LOOP_SOURCE_ROOT}, async () => {
  const {renderDispatchSchema} = await import("../generate-collaboration-schema.mjs")
  const actions = JSON.parse(readFileSync(join(process.env.LOOP_SOURCE_ROOT, "internal/actioncontract/default_actions.json"), "utf8"))
  assert.equal(readFileSync(new URL("../collaboration-task-schema.mjs", import.meta.url), "utf8").replace(/\r\n/g, "\n"), renderDispatchSchema(actions))
})


test("native Task previews preserve attachments and identify later full reads as current content", () => {
  for (const body of ["", "界".repeat(10_922)]) {
    const proxy = proxyEvent()
    const event = proxy.event.event
    event.type = proxy.event.delivery.eventKind = "collaboration.task_message"
    event.body = body
    event.messageId = "message-preview"
    event.payload = {body, messageId: event.messageId, attachmentIds: ["attachment-1"], truncated: body !== "", bodyBytes: body === "" ? 0 : 40_000}
    const message = createCollaborationUserMessage(event, proxy.event.delivery)
    const rendered = message.content[0].text
    assert.match(rendered, /attachment-1/u)
    assert.match(rendered, /message_id: message-preview/u)
    assert.match(rendered, /current content and may have changed/u)
    if (body === "") assert.match(rendered, /attachment-only message/u)
    else {
      assert.match(rendered, /preview is truncated/u)
      assert.match(rendered, /message.get/u)
      assert.ok(rendered.includes(body))
      assert.ok(!rendered.includes("\uFFFD"))
    }
    event.payload.body = "different preview"
    assert.throws(() => createCollaborationUserMessage(event, proxy.event.delivery), /conflicts/)
  }
})

test("remote feedback restores only exact original Task authority and fences generic writes", async () => {
  const calls = []
  let valid = true
  const f = runtimeFixture({
    async collaborationAuthorize(input) { return input.taskId !== "tsk_original" ? {authorized: false, reason: "Original Task authority is unavailable"} : {authorized: true, management: valid ? {taskId: "tsk_original", intentRef: "intent-original"} : null, managementReason: "Task management has ended (done)"} },
    async collaborationAction(input) { calls.push(input); return {state: "accepted"} },
  })
  await assert.rejects(f.collaboration.runAction("dispatch", SESSION_ID, {taskId: "tsk_original"}), /new work/u)
  await assert.rejects(f.collaboration.runAction("followup", SESSION_ID, {taskId: "tsk_other"}), /unavailable/u)
  await f.collaboration.runAction("followup", SESSION_ID, {taskId: "tsk_original", body: "Check result"})
  assert.equal(calls[0].intentRef, "intent-original")
  assert.equal(f.collaboration.currentUserInputs.size, 0)
  await assert.rejects(f.collaboration.authorizeAgentCall(SESSION_ID, {name: "task.create", input: "{}"}, {readOnly: false}), /new business action/u)
  valid = false
  await assert.rejects(f.collaboration.runAction("followup", SESSION_ID, {taskId: "tsk_original"}), /ended \(done\)/u)
})

test("remote discussion can reply only inside the still-authorized original target", async () => {
  let valid = true
  const f = runtimeFixture({async collaborationAuthorize() { return {authorized: valid, management: {target: "#discussion", scopeId: "chn_discussion"}} }})
  const command = target => ({name: "message.send", input: JSON.stringify({target, body: "Check result", clientMessageId: "reply-original"})})
  await f.collaboration.authorizeAgentCall(SESSION_ID, command("#discussion"), {readOnly: false})
  await assert.rejects(f.collaboration.authorizeAgentCall(SESSION_ID, command("#other"), {readOnly: false}), /outside/u)
  valid = false
  await assert.rejects(f.collaboration.authorizeAgentCall(SESSION_ID, command("#discussion"), {readOnly: false}), /outside/u)
  await f.collaboration.authorizeAgentCall(SESSION_ID, {name: "message.history", input: "{}"}, {readOnly: true})
})

test("a paused message is withheld at the model boundary and can resume without new user intent", async () => {
  let allowed = false
  const states = []
  const f = runtimeFixture({
    async collaborationAuthorize() { return {authorized: allowed, state: "pending", management: {target: "#discussion", scopeId: "chn_discussion"}} },
    async collaborationDeliveryState(input) { states.push(input); return {} },
  })
  const proxy = proxyEvent()
  const event = proxy.event.event
  event.type = proxy.event.delivery.eventKind = "collaboration.message"
  event.subscriptionId = "cos_discussion"
  event.target = "#discussion"
  event.messageId = "message-discussion"
  event.body = "feedback is not a new command"
  event.payload = {body: event.body, messageId: event.messageId, target: event.target, subscriptionId: event.subscriptionId}
  const message = createCollaborationUserMessage(event, proxy.event.delivery)
  const run = () => f.emit("agent/pre-step", {agent: f.agent, messages: [message]}, () => ({kind: "enter", messages: [message]}))
  assert.deepEqual(await run(), {kind: "reject"})
  assert.equal(f.collaboration.currentUserInputs.size, 0)
  allowed = true
  const resumed = await run()
  assert.equal(resumed.kind, "enter")
  assert.equal(resumed.messages.length, 1)
  assert.equal(resumed.messages[0].id, message.id)
  assert.equal(f.collaboration.currentUserInputs.size, 0)
})


test("subscription mutation requires current durable local input, never remote feedback", async () => {
  const f = naturalSelectionFixture({async collaborationStatus() { return {state: "active"} }})
  const tool = f.tool("collaboration_set_subscription")
  for (const target of ["#original", "#unrelated"]) {
    for (const mode of ["push", "pull", "paused"]) {
      if (mode === "paused") continue
      await assert.rejects(tool.execute({target, mode}, f.exec), /current accepted local user/u)
    }
  }
  assert.equal(f.calls.length, 0)
  await f.claim()
  await tool.execute({target: "#original", mode: "push"}, f.exec)
  const request = f.calls.find(([name]) => name === "action")[1]
  assert.equal(request.managementSource.messageId, f.message.id)
  assert.equal(request.managementSource.sequence, 42)
  f.emit("session/event", f.agent.session, {type: "turn/end"})
  await assert.rejects(tool.execute({target: "#original", mode: "push"}, f.exec), /current accepted local user/u)
  f.collaboration.dispose()
})

test("subscription route recovery retains only current local evidence for the same audience", async t => {
  for (const scenario of ["same route", "list first", "changed account", "prior preparation", "ended turn"]) {
    await t.test(scenario, async () => {
      const f = naturalSelectionFixture({
        async collaborationBind() {
          if (scenario === "ended turn") f.emit("session/event", f.agent.session, {type: "turn/end"})
          return {scope: f.scope}
        },
        async collaborationAction(request) {
          if (request.action === "list-subscriptions") return {items: []}
          f.calls.push(["subscription", request]); return {subscriptionId: "cos_1", mode: "push"}
        },
      })
      await f.claim()
      if (scenario === "prior preparation") await f.tool("collaboration_prepare").execute({targetIds: ["mem_a"]}, f.exec)
      f.collaboration.sessionScopes.set(SESSION_ID, {...f.scope, bindingId: "old", bindingEpoch: "1", bindingRevision: "1",
        ...(scenario === "changed account" ? {accountId: "other"} : {})})
      // Bound the wait if the recovery loses the already committed message.
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 500)
      try {
        if (scenario === "list first") {
          await f.tool("collaboration_list_subscriptions").execute({}, f.exec)
          f.actions.collaborationStatus = async () => ({state: "ready", scope: f.scope})
        }
        const attempt = f.tool("collaboration_set_subscription").execute({target: "#discussion", mode: "push"}, {...f.exec, signal: controller.signal})
        if (["same route", "list first"].includes(scenario)) {
          assert.equal((await attempt).subscriptionId, "cos_1")
          const source = f.calls.find(([name]) => name === "subscription")[1].managementSource
          assert.equal(source.messageId, f.message.id); assert.equal(source.sequence, 42)
        } else {
          await assert.rejects(attempt, {code: "loop-collaboration/intent-not-accepted"})
          assert.equal(f.calls.some(([name]) => name === "subscription"), false)
          assert.equal(f.collaboration.activeIntentContexts.has(SESSION_ID), false)
        }
      } finally { clearTimeout(timer); f.collaboration.dispose() }
    })
  }
})

test("only the subscribed Session keeps reception tools across turns and route restoration", async () => {
  let bindingScope
  let configured = false
  let mutations = 0
  const f = naturalSelectionFixture({
    async collaborationStatus() {
      return bindingScope === undefined ? {state: "unbound"} : {state: "ready", scope: bindingScope, hasMessageSubscriptions: configured}
    },
    async collaborationBind() { bindingScope = f.scope; return {scope: bindingScope} },
    async collaborationAction(request) {
      mutations++
      configured = true
      return {subscriptionId: "cos_discussion", mode: request.arguments.mode}
    },
  })
  const names = () => visibleToolNames(f.registrations, f.agent)
  const reception = ["collaboration_directory", "collaboration_list_subscriptions", "collaboration_read_updates", "collaboration_set_subscription", "collaboration_wait"]
  const tool = f.tool("collaboration_set_subscription")
  assert.deepEqual(names(), [])
  await f.claim()
  await tool.execute({target: "#discussion", mode: "push"}, f.exec)
  f.emit("session/event", f.agent.session, {type: "turn/end"})
  assert.deepEqual(names(), reception)
  assert.equal(f.collaboration.currentUserInputs.size, 0)
  assert.equal(f.collaboration.activeIntentContexts.size, 0)
  assert.deepEqual(visibleToolNames(f.registrations, {session: {id: "session-other"}}), [])

  const remote = {...f.message, id: "remote-reply", source: {kind: "loop-collaboration", rpcId: "remote-rpc"}}
  await f.emit("agent/pre-step", {agent: f.agent, messages: [remote]}, () => ({kind: "enter", messages: [remote]}))
  await tool.execute({target: "#discussion", mode: "paused"}, f.exec)
  assert.equal(mutations, 2)

  const finish = {...f.message, id: "finish-local", content: [{type: "text", text: "Pause discussion"}], source: {kind: "user", rpcId: "finish-rpc"}}
  await f.emit("agent/pre-step", {agent: f.agent, messages: [finish]}, () => ({kind: "enter", messages: [finish]}))
  f.emit("session/event", f.agent.session, {type: "user/message", seq: 43, data: finish})
  await tool.execute({target: "#discussion", mode: "paused"}, f.exec)
  assert.equal(mutations, 3)
  assert.deepEqual(names(), reception, "no guide call is needed on the new local turn")
  f.emit("session/event", f.agent.session, {type: "turn/end"})
  f.emit("session/disposed", f.agent.session)
  assert.deepEqual(names(), [])
  await f.collaboration.status({sessionId: SESSION_ID})
  assert.deepEqual(names(), reception, "Host status restores discovery for the same durable route")
  bindingScope = {...bindingScope, accountId: "human-other", workspaceId: "wsp_other"}
  configured = false
  await f.collaboration.status({sessionId: SESSION_ID})
  assert.deepEqual(names(), [])
  assert.equal(f.collaboration.currentUserInputs.size, 0)
  f.collaboration.dispose()
})

test("remote message writes reserve a durable stable reply identity before send", async () => {
  const calls = []
  const f = runtimeFixture({async collaborationAuthorize(input) { calls.push(input); return {authorized: true, management: {target: "#discussion", scopeId: "chn_discussion"}} }})
  const args = {target: "#discussion", body: "Substantive result", clientMessageId: "reply-one"}
  const command = {name: "message.send", input: JSON.stringify(args)}
  await f.collaboration.authorizeAgentCall(SESSION_ID, command, {readOnly: false})
  assert.equal(JSON.parse(command.input).expectedScopeId, "chn_discussion")
  await f.collaboration.authorizeAgentCall(SESSION_ID, command, {readOnly: false})
  assert.equal(calls[0].reply.payloadDigest, calls[1].reply.payloadDigest)
  assert.equal(calls[0].reply.clientMessageId, args.clientMessageId)
  assert.equal(calls[0].reply.target, args.target)
  assert.match(calls[0].reply.payloadDigest, /^sha256:[a-f0-9]{64}$/u)
  delete args.clientMessageId
  await assert.rejects(f.collaboration.authorizeAgentCall(SESSION_ID, {name: "message.send", input: JSON.stringify(args)}, {readOnly: false}), /stable clientMessageId/u)
  assert.equal(calls.length, 2)
  f.collaboration.dispose()
})


test("remote feedback may stop its original discussion without manufacturing user input", async () => {
  const f = naturalSelectionFixture({async collaborationStatus() { return {state: "active"} }})
  const tool = f.tool("collaboration_set_subscription")
  await tool.execute({target: "#original", mode: "paused"}, f.exec)
  const request = f.calls.find(([name]) => name === "action")[1]
  assert.equal(request.managementSource, undefined)
  assert.deepEqual(request.arguments, {target: "#original", mode: "paused"})
  assert.equal(f.collaboration.currentUserInputs.size, 0)
  await assert.rejects(tool.execute({target: "#original", mode: "push"}, f.exec), /current accepted local user/u)
  await tool.execute({target: "#other", mode: "paused"}, f.exec)
  assert.equal(f.calls.at(-1)[1].managementSource, undefined, "Host validates exact persistent scope; the model turn supplies no authority")
  f.collaboration.dispose()
})

test("Task feedback reports the current authorization failure and does not reuse a local continuation", async () => {
  let blocked = false
  const calls = []
  const f = runtimeFixture({
    async collaborationAuthorize() { return blocked ? {authorized: false, state: "binding-conflict", reason: "Loop collaboration binding changed"} : {authorized: true, management: {taskId: "tsk_original", intentRef: "intent-original"}} },
    async collaborationAction(input) { calls.push(input); return {state: "accepted"} },
  })
  f.collaboration.activeContinuations.set(SESSION_ID, {continuationRef: "stale-local-input"})
  await f.collaboration.runAction("followup", SESSION_ID, {taskId: "tsk_original", body: "Validate this result"})
  assert.equal(calls[0].intentRef, "intent-original")
  assert.equal(calls[0].continuationRef, undefined)
  blocked = true
  await assert.rejects(f.collaboration.runAction("followup", SESSION_ID, {taskId: "tsk_original"}), /binding changed/u)
  assert.equal(calls.length, 1)
  f.collaboration.dispose()
})


test("goal turns and other-topic feedback manage accepted Tasks without a fresh Task event", async () => {
  const calls = []
  const f = runtimeFixture({
    async collaborationAuthorize(input) {
      calls.push(["authorize", input])
      return input.taskId === "tsk_original" ? {authorized: true, management: {taskId: input.taskId, intentRef: "original-dispatch"}} : {authorized: false, reason: "No accepted dispatch for this Task in the current Session binding"}
    },
    async collaborationAction(input) { calls.push(["action", input]); return {state: "accepted"} },
  })
  for (const topicOnly of [false, true]) {
    f.emit("session/event", f.agent.session, {type: "turn/end"})
    await f.collaboration.runAction("followup", SESSION_ID, {taskId: "tsk_original", body: "Review and correct the original work"})
    assert.deepEqual(calls.at(-2), ["authorize", {sessionId: SESSION_ID, taskId: "tsk_original", action: "followup"}])
    assert.equal(calls.at(-1)[1].intentRef, "original-dispatch")
    assert.equal(calls.at(-1)[1].continuationRef, undefined)
    await assert.rejects(f.collaboration.runAction("followup", SESSION_ID, {taskId: "tsk_other"}), /No accepted dispatch/u)
    await assert.rejects(f.collaboration.runAction("dispatch", SESSION_ID, {}), /cannot authorize new work/u)
    await assert.rejects(f.collaboration.authorizeAgentCall(SESSION_ID, {name: "task.create", input: "{}"}, {readOnly: false}), /new business action/u)
    await assert.rejects(f.collaboration.authorizeAgentCall(SESSION_ID, {name: "message.send", input: JSON.stringify({target: "#other", clientMessageId: "not-authorized"})}, {readOnly: false}), /No accepted dispatch/u)
    await f.collaboration.authorizeAgentCall(SESSION_ID, {name: "task.get", input: "{}"}, {readOnly: true})
  }
  f.collaboration.dispose()
})


test("management workflow context follows durable Session discovery across turns and restart without disarming", async () => {
  const f = runtimeFixture({async collaborationWatch() { return {} }})
  const context = f.ctx.systemPrompt.contextDefinitions.find(item => item.name === "loop-collaboration-management")
  const disarmed = []
  f.ctx.goals = {disarm: agent => disarmed.push(agent)}
  assert.equal(context.text({agent: f.agent}), "")
  const active = [{taskId: "tsk_one", taskAvailable: true, managementState: "active"}]
  f.collaboration.observeStatus(SESSION_ID, {state: "ready", scope: eventScope(), active})
  const guidance = context.text({agent: f.agent})
  assert.match(guidance, /call collaboration_wait\(\{\}\) before ending the turn/u)
  assert.match(guidance, /If task.review is absent/u)
  assert.match(guidance, /request only creates the formal record/u)
  assert.match(guidance, /original user authorized you to review/u)
  assert.match(guidance, /handoff you depend on has an accepted receipt/u)
  assert.match(guidance, /unknown write outcome must be reconciled using the original request identity/u)
  assert.match(guidance, /do not grant authority/u)
  assert.equal(context.text({agent: {session: {id: "another-session"}}}), "")
  assert.equal(context.text({}), "")
  f.emit("session/event", f.agent.session, {type: "turn/end"})
  assert.equal(context.text({agent: f.agent}), guidance)
  assert.deepEqual(disarmed, [], "guidance must not stop independent local work")
  f.collaboration.clearSessionActivation(SESSION_ID)
  assert.equal(context.text({agent: f.agent}), "")
  await f.collaboration.startBootstrapWatch({...eventScope(), state: "ready", active}, new AbortController().signal)
  assert.equal(context.text({agent: f.agent}), guidance)
  f.collaboration.observeStatus(SESSION_ID, {state: "ready", scope: eventScope(), active: []})
  assert.equal(context.text({agent: f.agent}), "")
  f.collaboration.observeStatus(SESSION_ID, {state: "ready", scope: eventScope(), active: [], hasMessageSubscriptions: true})
  assert.equal(context.text({agent: f.agent}), guidance, "discussion feedback needs the same explicit waiting workflow")
  assert.deepEqual(disarmed, [])
  f.collaboration.dispose()
})

test("wait resolves optional goals through the actual Host plugin injection boundary", async () => {
  const [{Context}, {inject}] = await Promise.all([
    import("@deepseek-ai/cordis"), import("../host-service.mjs"),
  ])
  const registrations = []
  const f = runtimeFixture({}, {toolRegistrations: registrations})
  const ctx = new Context()
  for (const name of inject) ctx.provide(name, f.ctx[name] ?? {})
  let runtime, hostContext
  const plugin = await ctx.plugin({inject, apply(child) {
    hostContext = child
    runtime = new LoopCollaborationRuntime({ctx: child, sessions: child.sessions,
      defineTool: value => value,
      getSessionController: () => ({resolveAgent: async () => ({agent: f.agent})}),
      actions: () => ({async collaborationWaitStatus() { return {state: "push_ready", taskId: "tsk_one"} }}),
    })
  }})
  try {
    const wait = registrations.find(item => item.definition.name === "collaboration_wait").definition
    assert.throws(() => hostContext.goals, /without inject/u, "real Cordis rejects the old property access")
    await assert.rejects(wait.execute({}, {agent: f.agent}), /cannot suspend automatic goal rounds/u)
    const disarmed = []
    const goalPlugin = await ctx.plugin(child => {
      child.provide("goals", {disarm: agent => disarmed.push(agent)})
    })
    assert.throws(() => hostContext.goals, /without inject/u)
    const result = await wait.execute({}, {agent: f.agent})
    assert.equal(result.state, "waiting_for_push")
    assert.deepEqual(disarmed, [f.agent])
    await goalPlugin.dispose()
    await assert.rejects(wait.execute({}, {agent: f.agent}), /cannot suspend automatic goal rounds/u)
    assert.deepEqual(disarmed, [f.agent], "removed optional service cannot retain stale authority")
  } finally {
    runtime?.dispose()
    f.collaboration.dispose()
    await plugin.dispose()
    await ctx.dispose?.()
  }
})

test("explicit collaboration wait disarms only the current goal and existing push wakes its inbox", async () => {
  const registrations = []
  const f = runtimeFixture({async collaborationWaitStatus(input) {
    assert.equal(input.sessionId, SESSION_ID)
    assert.equal(input.taskId, proxyEvent().event.event.taskId)
    return {state: "push_ready", taskId: input.taskId, bindingId: "cbind_1", bindingEpoch: "3"}
  }}, {toolRegistrations: registrations, defineTool: value => value})
  const disarmed = []
  f.ctx.goals = {disarm: agent => disarmed.push(agent)}
  f.emit("session/event", f.agent.session, {type: "turn/end"})
  assert.equal(disarmed.length, 0, "local work never auto-disarms merely because a remote Task exists")
  const tool = registrations.find(item => item.definition.name === "collaboration_wait").definition
  const taskId = proxyEvent().event.event.taskId
  const result = await tool.execute({taskId}, {agent: f.agent})
  assert.equal(result.state, "waiting_for_push")
  assert.equal(result.taskId, taskId)
  assert.deepEqual(disarmed, [f.agent])
  await f.collaboration.acceptProxyEvent(proxyEvent())
  assert.equal(f.agent.sent.length, 1)
  assert.equal(f.agent.sent[0].target, "next-turn")
  f.collaboration.dispose()
})

test("exact input failure wakes the original Session once without creating work authority", async () => {
  let admitted = true
  const f = runtimeFixture({async collaborationAuthorize() { return {authorized: admitted, retryable: false} }})
  const event = proxyEvent()
  event.event.delivery.eventKind = event.event.event.type = "collaboration.task_input_failed"
  const fact = {inputId: "original_input", agentId: "agt_worker", reason: "wake_failed", observedAt: "2026-11-15T08:00:00Z"}
  event.event.event.inputFailure = fact
  event.event.event.payload = {inputFailure: fact, body: "Historical input failure; Task outcome is unknown."}
  event.event.event.body = event.event.event.payload.body
  await f.collaboration.acceptProxyEvent(event)
  await f.collaboration.acceptProxyEvent(event)
  assert.equal(f.agent.sent.length, 1)
  assert.equal(f.agent.sent[0].target, "next-turn")
  assert.match(f.agent.sent[0].message.content[0].text, /original_input/u)
  assert.match(f.agent.sent[0].message.content[0].text, /not new user instructions/u)
  assert.equal(f.collaboration.currentUserInputs.size, 0)
  await assert.rejects(f.collaboration.runAction("dispatch", SESSION_ID, {}), /cannot authorize new work/u)
  await assert.rejects(f.collaboration.authorizeAgentCall(SESSION_ID, {name:"task.create", input:"{}"}, {readOnly:false}), /new business action/u)
  const denied = proxyEvent()
  denied.event.delivery.deliveryId = "denied_failure"
  denied.event.delivery.eventId = denied.event.event.eventId = "denied_failure"
  denied.event.delivery.eventKind = denied.event.event.type = "collaboration.task_input_failed"
  denied.event.event.inputFailure = fact
  denied.event.event.payload = {inputFailure:fact,body:"Must not enter after pause or access loss"}
  denied.event.event.body = denied.event.event.payload.body
  admitted = false
  await f.collaboration.acceptProxyEvent(denied)
  assert.equal(f.agent.sent.length, 1)
  f.collaboration.dispose()
})


test("local end-management closes the established source, not a fresh unused continuation", async () => {
  let sourceRef = "accepted-A"
  const requests = []
  const f = naturalSelectionFixture({async collaborationAuthorize(input) {
    assert.equal(input.action, "end-management")
    return {authorized: true, management: {taskId: "tsk_one", intentRef: sourceRef}}
  }, async collaborationAction(request) { requests.push(request); return {receipt: {taskId: "tsk_one"}} }})
  await f.claim()
  f.collaboration.activeContinuations.set(SESSION_ID, {continuationRef: "pending-B"})
  f.collaboration.activeIntentContexts.set(SESSION_ID, {intentRef: "pending-B"})
  const end = f.tool("collaboration_end_management")
  await end.execute({taskId: "tsk_one", reason: "End this delegation"}, f.exec)
  let request = requests.at(-1)
  assert.equal(request.intentRef, "accepted-A")
  assert.equal(request.continuationRef, undefined)
  assert.equal(f.calls.some(([name]) => name === "continuation" || name === "activate"), false)
  sourceRef = "accepted-B"
  await end.execute({taskId: "tsk_one", reason: "End the accepted replacement"}, f.exec)
  request = requests.at(-1)
  assert.equal(request.intentRef, "accepted-B")
  f.collaboration.dispose()
})

test("unreadable Task delegation keeps only closure discovery across turn and bootstrap", async () => {
  const registrations = []
  const f = runtimeFixture({async collaborationWatch() { return {} }}, {toolRegistrations: registrations, defineTool: value => value})
  const active = [{taskId: "tsk_private", taskAvailable: false, managementState: "active"}]
  f.collaboration.observeStatus(SESSION_ID, {state: "ready", scope: eventScope(), active})
  f.emit("session/event", f.agent.session, {type: "turn/end"})
  assert.deepEqual(visibleToolNames(registrations, f.agent), ["collaboration_directory", "collaboration_end_management"])
  f.collaboration.clearSessionActivation(SESSION_ID)
  await f.collaboration.startBootstrapWatch({...eventScope(), state: "ready", active}, new AbortController().signal)
  assert.deepEqual(visibleToolNames(registrations, f.agent), ["collaboration_directory", "collaboration_end_management"])
  f.collaboration.dispose()
})

async function nativeDeliveryFixture(t, serverBaseUrl = "https://loop.test", device = true, epoch = "3") {
  const root = mkdtempSync(join(tmpdir(), "loop-native-host-delivery-"))
  t.after(() => rmSync(root, {recursive: true, force: true}))
  const namespace = {
    ...eventScope(), serverBaseUrl, accountId: "account", installationId: "installation",
    hostSessionId: SESSION_ID, bindingEpoch: epoch, bindingRevision: epoch, ...(device ? {} : {deviceBindingId: ""}),
  }
  delete namespace.sessionId
  const binding = {bindingId: namespace.bindingId, bindingEpoch: BigInt(epoch), status: "active", sourceSessionId: SESSION_ID, agentMemberId: AGENT_MEMBER_ID}
  const store = new CollaborationStore(root)
  await store.transition(namespace, namespace, binding, {})
  const api = {
    tokens: {async credential() {return {
      principal_id: "account", workspace_id: "wsp_1", access_token: "test-stream-token",
      resource: serverBaseUrl + "/api/v1/workspaces/wsp_1/external/agent",
    }}},
    async request(_area, method, path) {
      assert.equal(method, "GET")
      assert.match(path, /^\/collaboration\/binding/u)
      return {binding}
    },
  }
  const service = new CollaborationService(api, {server: serverBaseUrl}, {}, root, namespace.installationId)
  return {store, namespace, api, service, binding, inbox: new CollaborationInbox(store, api)}
}

test("inbox claim evidence survives replay and excludes cancelled, changed and ended inputs", () => {
  const p = createCollaborationReceiptProjection()
  const message = {id: "local-message", role: "user", source: {kind: "user", rpcId: "local-request"},
    content: [{type: "text", text: "original instruction"}]}
  const pending = p.apply(p.init(), {type: "agent/inbox/spliced", seq: 0, data: {target: "next-step", start: 0, inserted: [message]}})
  const claim = outcome => p.apply(structuredClone(pending), {type: "agent/inbox/spliced", seq: 1,
    data: {target: "next-step", start: 0, removedCount: 1, outcome}})
  const evidence = (state, input) => {
    const f = runtimeFixture({}, {projectionState: state})
    try { return f.collaboration.acceptanceEvidence(SESSION_ID, input) }
    finally { f.collaboration.dispose() }
  }
  assert.equal(evidence(claim(), message).seq, 1)
  for (const state of [pending, claim("canceled"), p.apply(claim(), {type: "turn/end"})]) {
    assert.throws(() => evidence(state, message), /No matching Session inbox claim/)
  }
  for (const changed of [{...message, id: "other"}, {...message, source: {kind: "user", rpcId: "other"}},
    {...message, content: [{type: "text", text: "changed instruction"}]}]) {
    assert.throws(() => evidence(claim(), changed), /No matching Session inbox claim/)
  }
})

test("two selected agents activate once through native validation with the exact inbox claim", async t => {
  const n = await nativeDeliveryFixture(t)
  const requests = []
  const lookup = n.api.request
  n.api.request = async (area, method, path, body) => {
    if (method === "GET") return lookup(area, method, path)
    assert.equal(path, "/collaboration/intents")
    requests.push(body)
    return {userIntentId: "accepted-first-turn"}
  }
  const f = runtimeFixture({
    collaborationPrepareIntent: input => n.service.prepareIntent(input),
    collaborationCancel: input => n.service.cancel(input),
    collaborationBindIntent: input => n.service.bindIntent(input),
    collaborationActivateIntent: input => n.service.activateIntent(input),
  })
  t.after(() => f.collaboration.dispose())
  const targets = ["worker", "tester"].map(targetId => ({targetType: "agent", targetId, intendedActions: ["dispatch", "followup"]}))
  const mentions = targets.map(({targetId}) => `@[${targetId}](loop-collaboration:agent/${targetId})`).join(" ")
  await f.collaboration.prepareIntent({sessionId: SESSION_ID, serializedText: mentions, activateOnClaim: true,
    bindingRevision: "3", references: targets, shareScope: {scope: "task-description", resourceRefs: [], expandedAudience: true}})
  const message = {id: "original", role: "user", source: {kind: "user", rpcId: "first-turn"},
    content: [{type: "text", text: mentions + " implement and test"}]}
  const step = messages => f.emit("agent/pre-step", {agent: f.agent, messages: [message]}, () => ({kind: "enter", messages}))
  await step([])
  assert.equal(requests.length, 0)
  await step([message])
  f.emit("session/event", f.agent.session, {type: "user/message", seq: 5, data: message})
  const active = Object.values((await n.store.load(n.namespace)).intents).filter(intent => intent.state === "activated")
  assert.equal(active.length, 1)
  assert.equal(stringifyWire(active[0].acceptedSequence), "4")
  assert.equal(requests.length, 1)
  assert.deepEqual(requests[0].targetIds, ["worker", "tester"])
})

test("native push reconciliation requests snapshot recovery on the original route after a rebind", async t => {
  const n = await nativeDeliveryFixture(t)
  const next = {...n.namespace, bindingId: "next_binding", bindingEpoch: "4", bindingRevision: "4"}
  const request = {clientRequestId: "original", expectedBindingEpoch: 3n, expectedScopeId: "scope", mode: "push"}
  await n.store.update(n.namespace, state => {
    state.actions.original = {clientRequestId: request.clientRequestId, kind: "set-subscription",
      phase: "unknown", payloadHash: "recorded", request}
  })
  let sends = 0
  n.api.request = async (_area, method, path, body) => {
    assert.equal(method, "POST")
    assert.equal(path, "/collaboration/actions/set-subscription")
    assert.equal(stringifyWire(body), stringifyWire(request))
    sends++
    await n.store.transition(n.namespace, next, {...n.binding, bindingId: next.bindingId, bindingEpoch: 4n}, {})
    return {mode: "push", scopeId: "scope", subscriptionId: "original_subscription"}
  }
  const result = await n.service.reconcile({sessionId: SESSION_ID, clientRequestIds: [request.clientRequestId]})
  assert.equal(result.receipts[0].subscriptionId, "original_subscription")
  assert.equal(result.subscription.snapshotRequired, true)
  assert.deepEqual(result.watchRoute, {sessionId: SESSION_ID, bindingId: n.namespace.bindingId, bindingEpoch: "3"})
  assert.equal((await n.service.watchRoute(result.watchRoute)).archive, true)
  assert.equal((await n.store.load(next)).snapshotRequired, undefined)
  assert.equal(sends, 1)
})

test("native pull uses the same serializable Host inbox envelope as push", async t => {
  const n = await nativeDeliveryFixture(t)
  await n.store.update(n.namespace, state => { state.binding.protocolCapabilities = {messageSubscriptions: 1n} })
  const topic = {subscriptionId: "sub_pull", scopeId: "discussion", mode: "pull", revision: 1}
  const feedback = {...proxyEvent().event.event, ...topic, eventSeq: 9007199254740993n}
  n.api.request = async (_, method, path) => {
    assert.equal(method, "POST")
    if (path.endsWith("/list-subscriptions")) return {subscriptions: [topic], hasMore: false}
    assert.ok(path.endsWith("/read-updates"))
    return {events: [feedback], nextAfterEventSeq: feedback.eventSeq, watermarkEventSeq: feedback.eventSeq, hasMore: false}
  }
  const frames = []
  await n.service.action({sessionId: SESSION_ID, action: "read-updates", arguments: {subscriptionId: topic.subscriptionId}}, undefined,
    frame => frames.push(publicValue(frame)))
  assert.equal(frames.length, 1)
  assert.equal(Object.hasOwn(frames[0].event.delivery, "event"), false)
  assert.equal(frames[0].event.delivery.eventSeq, String(feedback.eventSeq))
  assert.notEqual(harnessSnapshotJsonValue(frames[0].event), undefined)
  const f = runtimeFixture()
  t.after(() => f.collaboration.dispose())
  await f.collaboration.acceptProxyEvent(frames[0])
  assert.equal(f.agent.sent.length, 1)
})

async function until(predicate) {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return
    await delay(10)
  }
  assert.fail("Timed out waiting for the isolated stream fixture")
}

test("native replay admits feedback without JSON coercion and publishes only scoped projection updates", async t => {
  const http = createServer(), server = new WebSocketServer({server: http})
  let watch
  t.after(async () => {
    await watch?.dispose()
    for (const socket of server.clients) socket.terminate()
    await new Promise(resolve => server.close(resolve))
    await new Promise(resolve => http.close(resolve))
  })
  http.listen(0, "127.0.0.1")
  await once(http, "listening")
  const n = await nativeDeliveryFixture(t, `http://127.0.0.1:${http.address().port}`)
  const f = runtimeFixture()
  t.after(() => f.collaboration.dispose())
  const frames = [], published = [], acks = []
  const publish = f.collaboration.publish.bind(f.collaboration)
  f.collaboration.publish = (event, sessionId) => { published.push({event, sessionId}); return publish(event, sessionId) }
  const result = proxyEvent().event.event
  const eventSeq = 9007199254740993n
  const feedback = {...result, eventSeq, messageSeq: eventSeq}
  const changed = {...feedback, eventSeq: eventSeq + 1n, eventId: "change_1", type: "collaboration.task_changed",
    task: {taskId: feedback.taskId, available: true, status: "in_review", revision: 3, description: "private"}}
  const generation = "cbind_1:3"
  const connected = once(server, "connection")
  watch = new CollaborationWatch(n.api, n.store, n.namespace, event => frames.push(event))
  const [socket] = await connected
  socket.on("message", raw => acks.push(String(raw)))
  socket.send(JSON.stringify({kind: "hello", generation, subscriptionId: "stream_1", agentMemberId: AGENT_MEMBER_ID}))
  socket.send(stringifyWire({kind: "event", event: feedback}))
  await until(() => acks.length === 1 && frames.some(frame => frame.event.delivery))
  assert.equal(watch.state, "connecting", "hello and a persisted stream ID do not establish replay readiness")
  const frame = frames.find(frame => frame.event.delivery)
  assert.equal(Object.hasOwn(frame.event.delivery, "event"), false)
  assert.equal(frame.event.delivery.eventSeq, String(eventSeq))
  assert.notEqual(harnessSnapshotJsonValue(frame.event), undefined)
  await f.collaboration.acceptProxyEvent(frame)
  await f.collaboration.acceptProxyEvent(frame)
  assert.equal(f.agent.sent.length, 1)
  assert.equal(f.agent.sent[0].target, "next-turn")
  assert.equal(f.agent.sent[0].interrupt, true)
  assert.match(f.agent.sent[0].message.content[0].text, /message_seq: 9007199254740993/u)
  socket.send(stringifyWire({kind: "replay_end", throughEventSeq: eventSeq}))
  await until(() => watch.state === "live")
  socket.send(stringifyWire({kind: "event", event: changed}))
  await until(() => frames.some(frame => frame.event.eventId === changed.eventId) && acks.length === 2)
  const projected = frames.find(frame => frame.event.eventId === changed.eventId)
  await f.collaboration.acceptProxyEvent({...projected, scope: {...projected.scope, sessionId: ""}})
  await f.collaboration.acceptProxyEvent(projected)
  assert.deepEqual(published.filter(item => item.event.kind === "action.changed"), [{
    event: {eventId: changed.eventId, kind: "action.changed", occurredAt: projected.event.occurredAt}, sessionId: SESSION_ID,
  }])
  const state = await n.store.load(n.namespace)
  assert.equal(state.events[feedback.eventId].state, "pending", "stream ACK is not Session commit")
  assert.equal(state.taskStates[feedback.taskId].status, "in_review")
  assert.equal(state.taskStates[feedback.taskId].description, undefined)
  assert.equal(f.agent.sent.length, 1, "a Task state projection must not wake the agent")
  await watch.dispose()
  assert.equal(watch.state, "stopped")
})

test("a restored native route keeps the accepted input across status and repeated preparation", async t => {
  const n = await nativeDeliveryFixture(t)
  await n.store.update(n.namespace, state => {
    Object.assign(state.namespace, {coordinatorAgentId:"agt_self", boardId:"chn_1"})
  })
  const f = naturalSelectionFixture({collaborationStatus: input => n.service.status(input)})
  t.after(() => f.collaboration.dispose())
  const [binding] = (await n.service.bindings()).bindings
  await f.collaboration.startBootstrapWatch(binding, new AbortController().signal)
  await f.claim()
  const status = await f.collaboration.status({sessionId:SESSION_ID})
  assert.equal(status.scope.deviceBindingId, undefined)
  assert.equal(status.deliveryScope, undefined)
  for (const targetIds of [["mem_a","mem_b"],["mem_b","mem_a"]]) {
    assert.equal((await f.tool("collaboration_prepare").execute({targetIds}, f.exec)).state,"ready")
  }
  assert.equal(f.calls.filter(([name]) => name === "activate").length, 1)
  const changed = await n.service.status({sessionId:SESSION_ID})
  changed.deliveryScope.deviceBindingId = "replacement-device"
  f.collaboration.observeStatus(SESSION_ID, changed)
  assert.equal(f.collaboration.currentUserInputs.has(SESSION_ID), false)
})

test("native status retries a durable pending delivery using only its authenticated route", async t => {
  const n = await nativeDeliveryFixture(t)
  await n.inbox.receive(n.namespace, {...proxyEvent().event.event, eventSeq: 8})
  let authorizations = 0
  const f = runtimeFixture({
    async collaborationStatus(input) {return publicValue(await n.service.status(input))},
    async collaborationWatch(input) {assert.equal(input.ensure, true)},
    async collaborationAuthorize() { authorizations++; return {authorized: true} },
  })
  t.after(() => f.collaboration.dispose())
  f.agent.status = "running"
  const status = await f.collaboration.status({sessionId: SESSION_ID})
  assert.equal(status.scope.sessionId, undefined)
  assert.equal(status.scope.deviceBindingId, undefined)
  assert.equal(Object.hasOwn(status, "deliveryScope"), false)
  assert.equal(authorizations, 1)
  assert.equal(f.agent.sent.length, 1)
  assert.equal(f.agent.sent[0].target, "next-step")
  await f.collaboration.status({sessionId: SESSION_ID})
  assert.equal(f.agent.sent.length, 1)
})

test("status without a verified recovery route leaves durable deliveries pending", async t => {
  const n = await nativeDeliveryFixture(t, undefined, false)
  const event = proxyEvent().event.event
  // Model a restored route whose event persisted before device metadata was repaired.
  await n.store.update(n.namespace, state => {
    state.events[event.eventId] = {...proxyEvent().event.delivery, kind: event.type, event, state: "pending"}
  })
  const f = runtimeFixture({
    async collaborationStatus(input) {return publicValue(await n.service.status(input))},
    async collaborationAuthorize() {assert.fail("must not use event-supplied route")},
    async collaborationAccept() {assert.fail("must not terminalize a delivery without verified routing")},
  })
  t.after(() => f.collaboration.dispose())
  const status = await f.collaboration.status({sessionId: SESSION_ID})
  assert.equal(status.state, "degraded")
  assert.match(status.reason, /authenticated Session route/u)
  assert.equal(f.agent.sent.length, 0)
})

test("mixed inbox splices track real indices in each lane and preserve both queues on commit", () => {
  const projection = createCollaborationReceiptProjection()
  const make = id => ({id, source: {kind: "loop-collaboration", deliveryId: id}})
  let seq = 0, state = projection.init()
  const splice = (target, start, removedCount, inserted, outcome) => {
    state = projection.apply(state, {type: "agent/inbox/spliced", seq: ++seq, data: {target, start, removedCount, inserted, outcome}})
  }
  splice("next-turn", 0, 0, [{id: "normal"}, make("canceled")])
  splice("next-step", 0, 0, [{id: "normal_step"}, make("claimed"), make("still_pending")])
  splice("next-turn", 1, 1, [], "canceled")
  splice("next-step", 0, 1, [], "canceled")
  splice("next-step", 0, 1, [], "claimed")
  assert.equal(state.entries.canceled.state, "canceled")
  assert.equal(state.entries.claimed.state, "claimed")
  state = projection.apply(state, {type: "user/message", seq: ++seq, data: make("claimed")})
  assert.equal(state.entries.claimed.state, "committed")
  assert.deepEqual(state.pendingNextTurn, [null])
  splice("next-step", 0, 1, [], "canceled")
  assert.equal(state.entries.still_pending.state, "canceled")
  assert.deepEqual(Object.keys(state.entries).sort(), ["canceled", "claimed", "still_pending"])
})

test("wait omits provider-filled empty selectors but forwards nonempty selectors for native validation", async t => {
  const registrations = [], inputs = []
  const f = runtimeFixture({async collaborationWaitStatus(input) {
    inputs.push(input)
    return {state: "scope_required"}
  }}, {toolRegistrations: registrations, defineTool: value => value})
  t.after(() => f.collaboration.dispose())
  const tool = registrations.find(item => item.definition.name === "collaboration_wait").definition
  for (const [args, selectors] of [
    [{taskId: "tsk_live", subscriptionId: ""}, {taskId: "tsk_live"}],
    [{taskId: "", subscriptionId: "sub_live"}, {subscriptionId: "sub_live"}],
    [{taskId: "", subscriptionId: ""}, {}],
    [{}, {}],
    [{taskId: "tsk_live", subscriptionId: "sub_live"}, {taskId: "tsk_live", subscriptionId: "sub_live"}],
    [{taskId: " "}, {taskId: " "}],
  ]) {
    await tool.execute(args, {agent: f.agent})
    assert.deepEqual(inputs.pop(), {sessionId: SESSION_ID, ...selectors})
  }
})

test("wait leaves the goal armed for unsafe states and feedback already queued during preflight", async t => {
  const registrations = [], event = proxyEvent()
  let state, disarmed = 0
  const f = runtimeFixture({async collaborationWaitStatus({taskId}) {
    if (state === "push_ready") await f.collaboration.acceptProxyEvent(event)
    return {state, taskId, bindingId: "cbind_1", bindingEpoch: "3"}
  }}, {toolRegistrations: registrations, defineTool: value => value})
  t.after(() => f.collaboration.dispose())
  f.ctx.goals = {disarm() {disarmed++}}
  const tool = registrations.find(item => item.definition.name === "collaboration_wait").definition
  const taskId = event.event.event.taskId
  for (state of ["scope_required", "pull", "paused", "delivery_pending", "delivery_unavailable", "delivery_gap", "push_unavailable", "push_ready"]) {
    const result = await tool.execute({taskId}, {agent: f.agent})
    assert.equal(result.state, state === "push_ready" ? "feedback_queued" : state)
    assert.equal(result.guide, "loop-proxy guide recovery")
    assert.equal(disarmed, 0)
  }
})


test("native wait checks the exact accepted scope, mode, replay and ledger without writes", async t => {
  const epoch = "9007199254740993"
  const n = await nativeDeliveryFixture(t, undefined, true, epoch)
  const request = n.api.request.bind(n.api), task = {sessionId: SESSION_ID, taskId: "tsk_wait"}
  const discussion = {sessionId: SESSION_ID, subscriptionId: "sub_discussion"}
  const sub = {subscriptionId: "sub_task", scopeId: "scope_task", mode: "pull"}
  const topic = {subscriptionId: discussion.subscriptionId, scopeId: "scope_discussion", mode: "push"}
  let override, stream = "connecting", implicitTaskMode = "push", rebindOnLookup
  n.api.request = async (area, method, path, body) => {
    if (method === "GET") {
      assert.equal(path, `/collaboration/binding?generation=cbind_1%3A${epoch}`)
      return request(area, method, path)
    }
    assert.equal(method, "POST")
    assert.equal(path, "/collaboration/actions/list-subscriptions")
    assert.equal(body.expectedBindingEpoch, BigInt(epoch))
    const wanted = body.target ? "scope_task" : ""
    if (body.target) assert.equal(body.target, "#tsk_wait")
    await rebindOnLookup?.()
    return body.cursor ? {subscriptions: override ? [override] : [], resolvedScopeId: wanted, hasMore: false, implicitTaskMode}
      : {subscriptions: [topic], resolvedScopeId: wanted, hasMore: true, nextCursor: "next", implicitTaskMode}
  }
  const wait = (input = task) => n.service.waitStatus(input, route => {
    assert.equal(route.bindingEpoch, epoch)
    assert.equal(route.hostSessionId, SESSION_ID)
    return stream
  })
  assert.equal((await wait()).state, "scope_unavailable")
  await n.store.update(n.namespace, state => {
    state.intents.accepted = {ref: "accepted", state: "activated", userIntentId: "human", sessionId: SESSION_ID,
      bindingRevision: epoch, acceptedSequence: 1, targets: [{intendedActions: ["dispatch"]}]}
    state.actions.accepted = {kind: "dispatch", phase: "completed", intentRef: "accepted", receipt: {receipt: {taskId: task.taskId}}}
    state.actions.unrelated = {clientRequestId: "unrelated", kind: "followup", phase: "unknown", request: {taskId: "other"}}
    state.events.unrelated = {taskId: "other", state: "pending", eventSeq: 1}
    state.subscriptionId = "persisted_transport_not_a_managed_subscription"
  })
  const before = stringifyWire(await n.store.load(n.namespace))
  assert.equal((await wait()).state, "push_unavailable")
  stream = "live"
  assert.equal((await wait({sessionId: SESSION_ID})).state, "push_ready")
  implicitTaskMode = undefined
  assert.equal((await wait()).state, "mode_unknown")
  implicitTaskMode = "push"
  override = sub
  assert.deepEqual(await wait(), {state: "pull", taskId: task.taskId, subscriptionId: sub.subscriptionId, bindingId: "cbind_1", bindingEpoch: epoch})
  override = {...sub, mode: "paused"}
  assert.equal((await wait()).state, "paused")
  override = undefined
  assert.equal(stringifyWire(await n.store.load(n.namespace)), before)
  await n.store.update(n.namespace, state => {
    state.managementSources = {[discussion.subscriptionId]: {sessionId: SESSION_ID, scopeId: topic.scopeId}}
    state.actions.task = {clientRequestId: "task-write", kind: "followup", phase: "dispatching", request: {taskId: task.taskId}}
    state.actions.topic = {clientRequestId: "topic-write", kind: "set-subscription", phase: "unknown", request: {expectedScopeId: topic.scopeId}}
  })
  assert.equal((await wait({sessionId: SESSION_ID})).state, "scope_required")
  assert.equal((await wait({sessionId: SESSION_ID, subscriptionId: "persisted_transport_not_a_managed_subscription"})).state, "scope_unavailable")
  assert.deepEqual((await wait()).clientRequestIds, ["task-write"])
  assert.deepEqual((await wait(discussion)).clientRequestIds, ["topic-write"])
  await n.store.update(n.namespace, state => {
    delete state.actions.task
    delete state.actions.topic
    state.events.legacy = {subscriptionId: discussion.subscriptionId, state: "pending", eventSeq: 2}
    state.events.wrong = {subscriptionId: discussion.subscriptionId, scopeId: "wrong", state: "pending", eventSeq: 3}
    state.deliveryGap = {retainedFromEventSeq: 1}
  })
  assert.equal((await wait(discussion)).state, "delivery_pending")
  assert.equal((await wait()).state, "delivery_gap")
  await n.store.update(n.namespace, state => {
    Object.assign(state.events.legacy, {state: "blocked", eventId: "legacy"})
    delete state.deliveryGap
  })
  assert.equal((await wait(discussion)).state, "delivery_unavailable")
  assert.equal((await wait()).state, "push_ready")
  const unavailable = {
    type: "collaboration.delivery_unavailable", eventId: "marker", eventSeq: 4,
    targetKind: "coordinator", targetBindingId: n.namespace.bindingId, targetBindingEpoch: epoch,
    targetSourceSessionId: SESSION_ID, originBindingId: n.namespace.bindingId, originBindingEpoch: epoch,
    originSourceSessionId: SESSION_ID, workspaceId: n.namespace.workspaceId, agentMemberId: AGENT_MEMBER_ID,
    deviceBindingId: n.namespace.deviceBindingId, taskId: task.taskId, message: {body: "never persist this"},
  }
  const marker = await n.inbox.receive(n.namespace, unavailable)
  assert.equal(marker.delivery, undefined)
  assert.equal(marker.document.events.marker, undefined)
  assert.doesNotMatch(stringifyWire(marker.document.snapshotSkipped), /never persist this/u)
  assert.equal((await wait()).eventId, "marker")
  const {taskId: _, ...discussionMarker} = unavailable
  await n.inbox.receive(n.namespace, {...discussionMarker, eventId: "topic_marker", eventSeq: 5, subscriptionId: topic.subscriptionId, scopeId: topic.scopeId})
  assert.equal((await wait(discussion)).eventId, "topic_marker")
  assert.equal((await wait()).eventId, "marker")
  n.binding.status = "retired"
  assert.equal((await wait()).state, "scope_unavailable")
  n.binding.status = "active"
  rebindOnLookup = async () => {
    rebindOnLookup = undefined
    const next = {...n.namespace, bindingId: "next", bindingEpoch: String(BigInt(epoch) + 1n)}
    await n.store.transition(n.namespace, next, {...n.binding, bindingId: "next", bindingEpoch: BigInt(next.bindingEpoch)}, {})
  }
  assert.equal((await wait()).state, "scope_unavailable")
})

for (const proof of ["committed", "canceled"]) test(`recovered ${proof} receipt requires flush and retries without reinjection`, async t => {
  const proxy = proxyEvent(), {event, delivery} = proxy.event
  const message = createCollaborationUserMessage(event, delivery)
  const projection = createCollaborationReceiptProjection()
  const pending = projection.apply(projection.init(), {
    type: "agent/inbox/spliced", seq: 30, data: {target: "next-turn", start: 0, removedCount: 0, inserted: [message]},
  })
  const state = projection.apply(pending, proof === "committed" ? {type: "user/message", seq: 31, data: message}
    : {type: "agent/inbox/spliced", seq: 31, data: {target: "next-turn", start: 0, removedCount: 1, inserted: [], outcome: "canceled"}})
  let flushes = 0, durable = false, failedAck = true
  const acks = []
  const f = runtimeFixture({async collaborationAccept(input) {
    acks.push(input)
    if (failedAck) throw new Error("simulated receipt failure")
  }}, {projectionState: state})
  t.after(() => f.collaboration.dispose())
  f.ctx.sessions.flush = async () => {flushes++; await delay(1); return durable}
  await Promise.all([f.collaboration.acceptProxyEvent(proxy), f.collaboration.acceptProxyEvent(proxy)])
  assert.equal(flushes, 1)
  assert.equal(acks.length, 0)
  durable = true
  await f.collaboration.acceptProxyEvent(proxy)
  failedAck = false
  await f.collaboration.acceptProxyEvent(proxy)
  assert.equal(flushes, 3)
  assert.equal(acks.length, 2)
  for (const ack of acks) {
    assert.equal(ack.status, proof === "committed" ? "accepted" : "cancelled")
    assert.equal(ack.sessionMessageId, message.id)
    assert.equal(ack.sessionSequence, 31)
    assert.equal(ack.bindingEpoch, proxy.scope.bindingEpoch)
    assert.equal(ack.contentHash, delivery.payloadHash)
  }
  assert.equal(f.agent.sent.length, 0)
})
