import test from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import {mkdtempSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"

import {BlockAssembler} from "@deepseek-ai/dsh-llm"

import {BindingStore} from "../binding-store.mjs"
import {LoopModelRuntime, projectModelDescriptors} from "../host-models.mjs"
import {LoopHostRuntime} from "../host-runtime.mjs"
import {validateModelSession} from "../host-protocol.mjs"

const HOST_SESSION = "session-11111111-2222-3333-4444-555555555555"
const tool = {
  name: "lookup",
  description: "Look up one value.",
  parameters: {
    type: "object",
    properties: {key: {type: "number"}},
    required: ["key"],
  },
}

const protocolCases = [{
  wireApi: "openai-completions",
  providerId: "",
  modelId: "loop/deepseek-v4-pro",
  source: "loop_hosted",
}, {
  wireApi: "openai-completions",
  providerId: "",
  modelId: "loop/deepseek-v4-flash",
  source: "loop_hosted",
}, {
  wireApi: "openai-completions",
  providerId: "ump_profile",
  modelId: "deepseek-v4-pro",
  source: "loop_personal",
  providerName: "DeepSeek",
  presetKey: "deepseek",
}, {
  wireApi: "openai-completions",
  providerId: "deepseek",
  modelId: "deepseek-v4-pro",
  source: "loop_proxy",
}, {
  wireApi: "openai-responses",
  providerId: "cloudflare-ai-gateway",
  modelId: "gpt-5",
  source: "loop_proxy",
}, {
  wireApi: "anthropic-messages",
  providerId: "anthropic",
  modelId: "claude-fable-5",
  source: "loop_proxy",
}]

test("real PiAiAdapter streams tools and replays reasoning on the second local turn", async () => {
  for (const protocol of protocolCases) {
    await runProtocol(protocol)
  }
})

test("hosted tool replay accepts an upstream tool call with no reasoning text", async () => {
  await runProtocol({...protocolCases[0], omitReasoning: true})
})

test("personal model sessions require the exact profile route", () => {
  const request = {
    connectionId: "eag_personal",
    hostSessionId: HOST_SESSION,
    modelId: "deepseek-v4-pro",
    providerId: "ump_profile",
    source: "loop_personal",
    wireApi: "openai-completions",
  }
  assert.equal(validateModelSession(request).providerId, "ump_profile")
  assert.throws(
    () => validateModelSession({...request, providerId: undefined}),
    /personal model providerId is required/u,
  )
})

test("unknown BYOK models remain selectable while unsupported capabilities stay conservative", async () => {
  const actions = {
    modelRuntimeCatalog: async () => ({
      accountPrincipal: "usr-a",
      connections: [{
        connectionId: "eag_unknown",
        workspaceId: "wsp-a",
        providerName: "Custom gateway",
        models: [{
          id: "vendor-private-model",
          name: "Private model",
          source: "loop_proxy",
          providerId: "private-vendor",
          providerName: "Private vendor",
          wireApi: "openai-completions",
        }],
        status: "active",
        updatedAt: "2026-11-08T00:00:00Z",
      }],
    }),
  }
  const {adapter, route} = await registeredAdapter(actions)
  const models = await adapter.listModels(route)
  assert.deepEqual(models.map(model => model.name), ["Private model"])
  const resolved = await adapter.resolveModel(route, models[0].id)
  assert.equal(resolved.context.contextWindow, 131_072)
  assert.equal(resolved.defaultMaxTokens, 8_192)
  assert.equal(adapter.providerRetryPolicy(route).maxRetries, 0)
})

test("editable personal provider names cannot supply builtin model capabilities", () => {
  const wires = ["openai-completions", "openai-responses", "anthropic-messages"]
  const [forged] = projectModelDescriptors(wires.map(wireApi => ({
    id: "gpt-5",
    name: "gpt-5",
    source: "loop_personal",
    providerId: "ump_forged",
    providerName: "OpenAI",
    wireApi,
  })))
  assert.equal(forged.wireApi, "openai-completions")
  assert.equal(forged.contextWindow, undefined)
  assert.equal(forged.maxOutputTokens, undefined)
  assert.equal(forged.reasoningEfforts, undefined)
  assert.equal(forged.knownCatalog, undefined)

  const [trusted] = projectModelDescriptors(wires.map(wireApi => ({
    id: "gpt-5",
    name: "gpt-5",
    source: "loop_personal",
    providerId: "ump_trusted",
    providerName: "Renamed by the user",
    presetKey: "openai",
    wireApi,
  })))
  assert.equal(trusted.wireApi, "openai-responses")
  assert.ok(trusted.contextWindow > 0)
  assert.ok(trusted.maxOutputTokens > 0)
})

test("expired authorizations stay in Settings but leave the native model picker", async () => {
  const connections = ["active", "needs_auth", "error"].map((status, index) => ({
    connectionId: `grant-${index}`, workspaceId: "workspace-one", providerName: "Loop",
    status, models: [{id: "model-one", name: "Model One", source: "loop_proxy", providerId: "provider-one", wireApi: "openai-completions"}],
  }))
  const status = {accountPrincipal: "user-one", connections}
  const {adapter, runtime} = await registeredAdapter({modelRuntimeCatalog: async () => status})
  assert.equal(adapter.catalogs.size, 1)
  assert.equal(runtime.projectStatus(status).connections.length, 3)
})

test("catalog projection chooses known native wire and falls back deterministically", () => {
  for (const expected of [{
    id: "deepseek-v4-flash",
    providerId: "deepseek",
    providerName: "DeepSeek",
    wireApi: "openai-completions",
  }, {
    id: "gpt-5",
    providerId: "openai",
    providerName: "OpenAI",
    wireApi: "openai-responses",
  }, {
    id: "claude-sonnet-4-5",
    providerId: "anthropic",
    providerName: "Anthropic",
    wireApi: "anthropic-messages",
  }]) {
    const projected = projectModelDescriptors([...protocolCases.map(protocol => ({
      id: expected.id,
      name: expected.id,
      source: "loop_proxy",
      providerId: expected.providerId,
      providerName: expected.providerName,
      wireApi: protocol.wireApi,
    }))].reverse())
    assert.equal(projected.length, 1)
    assert.equal(projected[0].wireApi, expected.wireApi)
  }

  const fallback = projectModelDescriptors([...protocolCases.map(protocol => ({
    id: "vendor-shared",
    name: "Vendor Shared",
    source: "loop_proxy",
    providerId: "vendor-private",
    providerName: "Vendor",
    wireApi: protocol.wireApi,
  }))])
  assert.equal(fallback.length, 1)
  assert.equal(fallback[0].wireApi, "openai-completions")
})

test("previous wire-qualified picker ids still resolve after catalog projection", async () => {
  const models = protocolCases.map(protocol => ({
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    source: "loop_proxy",
    providerId: "deepseek",
    providerName: "DeepSeek",
    wireApi: protocol.wireApi,
  }))
  const actions = {
    modelRuntimeCatalog: async () => ({
      accountPrincipal: "usr-a",
      connections: [{
        connectionId: "eag_legacy",
        workspaceId: "wsp-a",
        providerName: "Loop QA",
        models,
        status: "active",
        updatedAt: "2026-11-08T00:00:00Z",
      }],
    }),
  }
  const {adapter, route} = await registeredAdapter(actions)
  const visible = await adapter.listModels(route)
  assert.equal(visible.length, 1)
  assert.equal(visible[0].id, "openai-completions:loop_proxy:deepseek:deepseek-v4-flash")
  for (const model of models) {
    const resolved = await adapter.resolveModel(route, protocolPicker(model))
    assert.equal(resolved.name, "DeepSeek V4 Flash")
  }
})

test("same public model id remains distinct across providers and sources", async () => {
  const raw = {
    accountPrincipal: "usr-a",
    connections: [{
      connectionId: "eag_one",
      workspaceId: "wsp-a",
      providerName: "Loop QA",
      models: [
        {
          id: "shared-model",
          name: "Shared Model",
          source: "loop_proxy",
          providerId: "provider-a",
          providerName: "Loop QA",
          wireApi: "openai-completions",
        },
        {
          id: "shared-model",
          name: "Shared Model",
          source: "loop_personal",
          providerId: "ump_profile",
          providerName: "Loop QA",
          wireApi: "openai-responses",
        },
        {
          id: "shared-model",
          name: "Shared Model",
          source: "loop_hosted",
          providerName: "Loop QA",
          wireApi: "openai-completions",
        },
      ],
      status: "active",
      updatedAt: "2026-11-08T00:00:00Z",
    }],
  }
  const actions = {modelRuntimeCatalog: async () => raw}
  const {adapter, route, runtime} = await registeredAdapter(actions)
  const picker = await adapter.listModels(route)
  const settings = runtime.projectStatus(raw)
  assert.equal(picker.length, 3)
  assert.equal(settings.connections[0].models.length, 3)
  assert.equal(
    picker.find(model => model.name.includes("Personal")).id,
    "openai-responses:loop_personal:ump_profile:shared-model",
  )
  assert.deepEqual(picker.map(model => model.name), settings.connections[0].models.map(model => model.name))
  assert.deepEqual(picker.map(model => model.name), [
    "Shared Model · Loop hosted",
    "Shared Model · Personal · Loop QA",
    "Shared Model · Organization · Loop QA",
  ])
})

test("personal-only catalogs identify the personal source in the native picker", async () => {
  const raw = {
    accountPrincipal: "usr-a",
    connections: [{
      connectionId: "eag_personal_only",
      workspaceId: "wsp-a",
      providerName: "Loop QA",
      models: [{
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        source: "loop_personal",
        providerId: "ump_profile",
        providerName: "DeepSeek",
        wireApi: "openai-completions",
      }],
      status: "active",
      updatedAt: "2026-11-08T00:00:00Z",
    }],
  }
  const {adapter, route, runtime} = await registeredAdapter({modelRuntimeCatalog: async () => raw})
  assert.deepEqual((await adapter.listModels(route)).map(model => model.name), [
    "DeepSeek V4 Pro · Personal · DeepSeek",
  ])
  assert.deepEqual(runtime.projectStatus(raw).connections[0].models.map(model => model.name), [
    "DeepSeek V4 Pro · Personal · DeepSeek",
  ])
})

test("catalog refresh removes deleted personal profiles without changing the selected route", async () => {
  const models = [
    {
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      source: "loop_personal",
      providerId: "ump_profile",
      providerName: "Personal DeepSeek",
      wireApi: "openai-completions",
    },
    {
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      source: "loop_proxy",
      providerId: "opvd_org",
      providerName: "Organization DeepSeek",
      wireApi: "openai-completions",
    },
  ]
  const status = {
    accountPrincipal: "usr-a",
    connections: [{
      connectionId: "eag_catalog",
      workspaceId: "wsp-a",
      providerName: "Loop QA",
      models,
      status: "active",
      updatedAt: "2026-11-08T00:00:00Z",
    }],
  }
  const actions = {modelRuntimeCatalog: async () => status}
  const {adapter, route, runtime} = await registeredAdapter(actions)
  const before = await adapter.listModels(route)
  assert.equal(before.length, 2)
  const personalPicker = before.find(model => model.name.includes("Personal")).id
  const organizationPicker = before.find(model => model.name.includes("Organization")).id

  status.connections[0].models = [models[1]]
  await runtime.sync()

  const after = await adapter.listModels(route)
  assert.deepEqual(after.map(model => model.id), [organizationPicker])
  await assert.rejects(
    async () => {
      for await (const _chunk of adapter.stream({
        provider: route,
        model: personalPicker,
        sessionId: HOST_SESSION,
        messages: [],
      })) {
        // The deleted profile must not recreate a catalog entry.
      }
    },
    error => error.code === "UNKNOWN_MODEL",
  )
  assert.equal(runtime.projectStatus(status).connections[0].models[0].providerId, "opvd_org")
})

test("Host startup restores the selected account into the runtime action scope", async t => {
  const root = mkdtempSync(join(tmpdir(), "loop-model-account-"))
  t.after(() => rmSync(root, {recursive: true, force: true}))
  const server = "https://loop.example.test"
  const account = "usr_restored"
  const store = new BindingStore({
    root,
    installationId: "installation-model-account",
    defaultServiceBaseUrl: server,
  })
  await store.setGlobalServer(server)
  await store.setActiveAccount(account, server)
  await store.setProjectSyncSettings(server, {
    lastSyncedAt: "2026-11-07T00:00:00Z",
    lastError: "stale project trust failure",
  })
  let actionAccount = ""
  let releaseCatalog
  const catalogGate = new Promise(resolve => { releaseCatalog = resolve })
  const runtime = new LoopHostRuntime({
    store,
    workspaces: {get: () => undefined, list: () => []},
    sessions: {get: () => undefined},
    accountPrincipal: "",
    defaultServiceBaseUrl: server,
    actions: {
      currentAccountPrincipal: () => actionAccount,
      setAccountPrincipal: principal => { actionAccount = principal },
      currentLoopWorkspaceId: () => "wsp_a",
      setServiceBaseUrl: async () => {},
      modelStatus: async () => ({state: "needs_auth", connections: [], accountPrincipal: account}),
      projectSyncCatalog: async () => {
        await catalogGate
        return {
          state: "needs_auth",
          reason: "Loop Project sync authorization is required",
        }
      },
      prepareProjectSync: async () => {
        throw new Error("project sync must stop before preparation")
      },
      disconnectModelConnection: async () => ({state: "needs_auth", connections: []}),
    },
  })

  await runtime.waitForActions()

  assert.equal(runtime.accountPrincipal, account)
  assert.equal(actionAccount, account)
  const before = await runtime.projectSyncSettings()
  assert.equal(before.state, "needs_auth")
  assert.equal(before.reason, "Loop Project sync authorization has not been verified")
  assert.equal(before.lastSyncedAt, "2026-11-07T00:00:00Z")

  releaseCatalog()
  const refreshed = await runtime.syncProjects({})
  assert.equal(refreshed.state, "needs_auth")
  assert.equal(refreshed.reason, "Loop Project sync authorization is required")
  assert.equal(refreshed.lastSyncedAt, "2026-11-07T00:00:00Z")
  assert.equal((await runtime.projectSyncSettings()).state, "needs_auth")
  assert.equal((await store.getProjectSyncSettings(server)).lastError, "")

  const disconnected = await runtime.disconnectModelConnection({connectionId: "eag_last"})
  assert.deepEqual(disconnected.connections, [])
  assert.equal(runtime.accountPrincipal, account)
  assert.equal(actionAccount, account)
  assert.equal(await store.getActiveAccount(server), account)
  assert.deepEqual((await runtime.modelStatus()).connections, [])
})

async function runProtocol(protocol) {
  const upstream = await modelServer(protocol.wireApi, protocol.omitReasoning)
  try {
    const sessionRequests = []
    const actions = {
      modelRuntimeCatalog: async () => ({
        accountPrincipal: "usr-a",
        connections: [{
          connectionId: "eag_" + protocol.wireApi,
          workspaceId: "wsp-a",
          providerName: "Loop QA",
          models: [{
            id: protocol.modelId,
            name: protocol.modelId,
            source: protocol.source,
            providerId: protocol.providerId,
            providerName: protocol.providerName ?? "Loop QA",
            presetKey: protocol.presetKey,
            wireApi: protocol.wireApi,
          }],
          status: "active",
          updatedAt: "2026-11-08T00:00:00Z",
        }],
      }),
      ensureModelSession: async input => {
        sessionRequests.push(input)
        if (protocol.source === "loop_hosted") assert.equal(Object.hasOwn(input, "providerId"), false)
        return {
          sessionId: "ems_local",
          connectionId: input.connectionId,
          baseURL: upstream.url + "/v1",
          localKey: "local-host-key",
          expiresAt: "2026-11-08T01:00:00Z",
          refreshAt: "2026-11-08T00:30:00Z",
          modelId: input.modelId,
          wireApi: input.wireApi,
        }
      },
    }
    const {adapter, route} = await registeredAdapter(actions)
    const models = await adapter.listModels(route)
    assert.equal(models.length, 1)
    const picker = models[0].id
    const resolved = await adapter.resolveModel(route, picker)
    if (protocol.source === "loop_hosted") assert.equal(resolved.reasoning, undefined)
    if (protocol.source === "loop_personal") {
      assert.ok(resolved.reasoning?.efforts.some(effort => effort.id === "high"))
    }
    const options = {
      provider: route,
      model: picker,
      sessionId: HOST_SESSION,
      messages: [{
        role: "user",
        content: [{type: "text", text: "Use the lookup tool."}],
      }],
      tools: [tool],
      ...protocol.source === "loop_hosted" ? {} : {reasoningEffort: "high"},
    }

    const assembler = new BlockAssembler()
    for await (const chunk of adapter.stream(options)) assembler.push(chunk)
    const first = assembler.blocks()
    const call = first.find(block => block.type === "tool-call")
    assert.ok(call, protocol.wireApi + " should stream a tool call")
    assert.equal(first.some(block => block.type === "reasoning"), !protocol.omitReasoning, protocol.wireApi + " reasoning presence")

    const history = [
      ...options.messages,
      {
        id: "assistant-1",
        role: "assistant",
        content: first,
        source: {
          kind: "model",
          provider: route,
          model: picker,
          replayState: assembler.replayState,
        },
      },
      {
        id: "tool-result-1",
        role: "tool",
        content: [{type: "text", text: "42"}],
        source: {kind: "tool", callId: call.id},
        toolCallId: call.id,
      },
      {
        role: "user",
        content: [{type: "text", text: "Now answer with the result."}],
      },
    ]
    for await (const _chunk of adapter.stream({...options, messages: history})) {
      // Drain the real adapter stream so the second local request reaches completion.
    }

    if (protocol.source === "loop_hosted") {
      for (const request of upstream.requests) {
        assert.equal(request.body.thinking, undefined)
        assert.equal(request.body.store, undefined)
      }
    }
    assert.equal(sessionRequests.length, 2)
    assert.deepEqual(sessionRequests[0], sessionRequests[1], "both turns should request the same lease binding")
    assert.equal(upstream.requests.length, 2)
    assert.equal(new URL(upstream.requests[0].path, upstream.url).pathname, expectedPath(protocol.wireApi))
    assert.equal(new URL(upstream.requests[1].path, upstream.url).pathname, expectedPath(protocol.wireApi))
    assertLocalAuthentication(protocol.wireApi, upstream.requests[0].headers)
    assertLocalAuthentication(protocol.wireApi, upstream.requests[1].headers)
    assert.ok(Array.isArray(upstream.requests[0].body.tools), protocol.wireApi + " should forward tools")
    assert.ok(upstream.requests[1].body.tools.length > 0, protocol.wireApi + " should replay tools")
    assertSecondTurnReasoning(
      protocol.wireApi,
      upstream.requests[1].body,
      protocol.source !== "loop_hosted",
      protocol.source === "loop_hosted",
      protocol.omitReasoning,
    )
  } finally {
    await upstream.close()
  }
}

async function registeredAdapter(actions) {
  let adapter
  let routes
  const ctx = {
    get: () => undefined,
    llm: {
      registerAdapter(value, valueAdapter) {
        routes = value
        adapter = valueAdapter
        return {replace(next) { routes = next }}
      },
    },
  }
  const runtime = new LoopModelRuntime(ctx, actions)
  await runtime.sync()
  assert.ok(adapter)
  assert.ok(routes.length > 0)
  return {adapter, route: routes[0], runtime}
}

function expectedPath(wireApi) {
  return {
    "openai-completions": "/v1/chat/completions",
    "openai-responses": "/v1/responses",
    "anthropic-messages": "/v1/messages",
  }[wireApi]
}

function protocolPicker(model) {
  return [
    model.wireApi,
    model.source,
    encodeURIComponent(model.providerId ?? ""),
    encodeURIComponent(model.id),
  ].join(":")
}

function assertLocalAuthentication(wireApi, headers) {
  if (wireApi === "anthropic-messages") {
    assert.equal(headers["x-api-key"], "local-host-key")
    return
  }
  assert.equal(headers.authorization, "Bearer local-host-key")
}

function assertSecondTurnReasoning(wireApi, body, vendorThinking, hosted, omitReasoning = false) {
  if (wireApi === "openai-completions") {
    const assistant = body.messages.find(message => message.role === "assistant")
    assert.ok(assistant)
    assert.ok(Object.hasOwn(assistant, "reasoning_content"))
    assert.equal(assistant.reasoning_content, omitReasoning ? "" : "inspect the request")
    assert.ok(Array.isArray(assistant.tool_calls) && assistant.tool_calls.length > 0)
    assert.ok(body.messages.some(message => message.role === "tool"))
    assert.ok(body.messages.some(message => message.role === "tool" &&
      message.tool_call_id === assistant.tool_calls[0].id && message.content === "42"))
    if (hosted) {
      assert.equal(typeof assistant.content, "string")
      assert.notEqual(assistant.content, null)
      assert.equal(body.messages.filter(message => message.role === "assistant").length, 1)
    }
    assert.equal(body.thinking?.type, vendorThinking ? "enabled" : undefined)
    return
  }
  if (wireApi === "anthropic-messages") {
    const serialized = JSON.stringify(body)
    assert.match(serialized, /signed-reasoning/u)
    assert.match(serialized, /tool_use/u)
    assert.match(serialized, /tool_result/u)
    return
  }
  const serialized = JSON.stringify(body)
  assert.match(serialized, /encrypted-reasoning/u)
  assert.match(serialized, /function_call/u)
  assert.match(serialized, /function_call_output/u)
}

async function modelServer(wireApi, omitReasoning = false) {
  const requests = []
  const server = http.createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString("utf8")
    requests.push({
      path: request.url,
      headers: request.headers,
      body: raw === "" ? {} : JSON.parse(raw),
    })
    if (wireApi === "openai-completions" && requests.length > 1) {
      const assistant = requests[1].body.messages?.find(message =>
        message.role === "assistant" && Array.isArray(message.tool_calls) && message.tool_calls.length > 0)
      if (typeof assistant?.content !== "string" || typeof assistant?.reasoning_content !== "string") {
        response.writeHead(400, {"content-type": "application/json"})
        response.end(JSON.stringify({
          error: {
            code: "resolver.request.invalid",
            message: "assistant tool-call message requires string content",
          },
        }))
        return
      }
    }
    response.writeHead(200, {"content-type": "text/event-stream"})
    const turn = requests.length
    for (const frame of responseFrames(wireApi, turn, omitReasoning)) response.write(frame)
    response.end()
  })
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  return {
    url: "http://127.0.0.1:" + address.port,
    requests,
    close: () => new Promise((resolve, reject) => {
      server.close(error => error === undefined ? resolve() : reject(error))
    }),
  }
}

function responseFrames(wireApi, turn, omitReasoning = false) {
  if (wireApi === "openai-completions") return completionFrames(turn, omitReasoning)
  if (wireApi === "openai-responses") return responsesFrames(turn)
  return anthropicFrames(turn)
}

function completionFrames(turn, omitReasoning) {
  if (turn === 1) {
    return [
      data({
        choices: [{
          index: 0,
          delta: {
            role: "assistant",
            ...omitReasoning ? {} : {reasoning_content: "inspect the request"},
            tool_calls: [{
              index: 0,
              id: "call_1",
              type: "function",
              function: {name: "lookup", arguments: "{\"key\":1}"},
            }],
          },
          finish_reason: null,
        }],
      }),
      data({
        choices: [{index: 0, delta: {}, finish_reason: "tool_calls"}],
        usage: {prompt_tokens: 3, completion_tokens: 2},
      }),
      "data: [DONE]\n\n",
    ]
  }
  return [
    data({
      choices: [{
        index: 0,
        delta: {role: "assistant", content: "42"},
        finish_reason: null,
      }],
    }),
    data({
      choices: [{index: 0, delta: {}, finish_reason: "stop"}],
      usage: {prompt_tokens: 5, completion_tokens: 1},
    }),
    "data: [DONE]\n\n",
  ]
}

function anthropicFrames(turn) {
  const frames = [
    anthropic({
      type: "message_start",
      message: {
        id: "msg_" + turn,
        type: "message",
        role: "assistant",
        model: "claude-fable-5",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: {input_tokens: 3, output_tokens: 0},
      },
    }),
  ]
  if (turn === 1) {
    frames.push(
      anthropic({
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "thinking",
          thinking: "inspect the request",
          signature: "signed-reasoning",
        },
      }),
      anthropic({type: "content_block_stop", index: 0}),
      anthropic({
        type: "content_block_start",
        index: 1,
        content_block: {type: "tool_use", id: "toolu_1", name: "lookup", input: {}},
      }),
      anthropic({
        type: "content_block_delta",
        index: 1,
        delta: {type: "input_json_delta", partial_json: "{\"key\":1}"},
      }),
      anthropic({type: "content_block_stop", index: 1}),
      anthropic({
        type: "message_delta",
        delta: {stop_reason: "tool_use", stop_sequence: null},
        usage: {output_tokens: 2},
      }),
    )
  } else {
    frames.push(
      anthropic({
        type: "content_block_start",
        index: 0,
        content_block: {type: "text", text: ""},
      }),
      anthropic({
        type: "content_block_delta",
        index: 0,
        delta: {type: "text_delta", text: "42"},
      }),
      anthropic({type: "content_block_stop", index: 0}),
      anthropic({
        type: "message_delta",
        delta: {stop_reason: "end_turn", stop_sequence: null},
        usage: {output_tokens: 1},
      }),
    )
  }
  frames.push(anthropic({type: "message_stop"}))
  return frames
}

function responsesFrames(turn) {
  if (turn === 1) {
    const reasoning = {
      type: "reasoning",
      id: "rs_1",
      encrypted_content: "encrypted-reasoning",
      summary: [{type: "summary_text", text: "inspect the request"}],
    }
    const call = {
      type: "function_call",
      call_id: "call_1",
      id: "fc_1",
      name: "lookup",
      arguments: "{\"key\":1}",
    }
    return [
      data({type: "response.created", response: {id: "resp_1"}}),
      data({type: "response.output_item.added", output_index: 0, item: reasoning}),
      data({type: "response.output_item.done", output_index: 0, item: reasoning}),
      data({type: "response.output_item.added", output_index: 1, item: call}),
      data({type: "response.output_item.done", output_index: 1, item: call}),
      data({
        type: "response.completed",
        response: {
          id: "resp_1",
          status: "completed",
          output: [reasoning, call],
          usage: {input_tokens: 3, output_tokens: 2, total_tokens: 5},
        },
      }),
    ]
  }
  const message = {
    type: "message",
    id: "msg_2",
    role: "assistant",
    content: [{type: "output_text", text: "42", annotations: []}],
  }
  return [
    data({type: "response.created", response: {id: "resp_2"}}),
    data({type: "response.output_item.added", output_index: 0, item: message}),
    data({type: "response.output_item.done", output_index: 0, item: message}),
    data({
      type: "response.completed",
      response: {
        id: "resp_2",
        status: "completed",
        output: [message],
        usage: {input_tokens: 5, output_tokens: 1, total_tokens: 6},
      },
    }),
  ]
}

function data(value) {
  return "data: " + JSON.stringify(value) + "\n\n"
}

function anthropic(value) {
  return "event: " + value.type + "\ndata: " + JSON.stringify(value) + "\n\n"
}
