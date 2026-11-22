import assert from "node:assert/strict"
import test from "node:test"
import {createHash} from "node:crypto"

import {Context, resolveConfig} from "@deepseek-ai/cordis"
import Loader from "@deepseek-ai/cordis-plugin-loader"
import AgentDefaultModel from "@deepseek-ai/dsh-agent-default-model"

import {saveExplicitDefaultModel} from "../host-default-model.mjs"
import {validateSetDefaultModel} from "../host-protocol.mjs"
import {loopModelPickerID, loopModelRouteFromDigest, loopModelRouteInput} from "../model-identity.mjs"
import remote from "../remote.mjs"

const descriptor = {
  id: "model-a",
  name: "Model A",
  source: "loop_proxy",
  providerId: "provider-a",
  providerName: "Provider A",
  wireApi: "openai-completions",
}
const provider = loopModelRouteFromDigest(createHash("sha256").update(loopModelRouteInput("wsp_alpha", "eag_alpha")).digest("hex"))
const model = loopModelPickerID(descriptor)

function loopRequest(overrides = {}) {
  return {
    kind: "loop",
    provider,
    model,
    connectionId: "eag_alpha",
    workspaceId: "wsp_alpha",
    expectedServerRevision: "rev-alpha",
    expectedAccountPrincipal: "hum_alpha",
    ...overrides,
  }
}

function activeStatus(overrides = {}) {
  return {
    state: "active",
    accountPrincipal: "hum_alpha",
    connections: [{
      connectionId: "eag_alpha",
      workspaceId: "wsp_alpha",
      providerName: "Loop",
      models: [descriptor],
      status: "active",
      updatedAt: "2026-11-09T00:00:00Z",
    }],
    ...overrides,
  }
}

async function ownerHarness(options = {}) {
  const ctx = new Context()
  let sessionCreates = 0
  ctx.provide("sessions", {
    create() {
      sessionCreates += 1
      throw new Error("default-model selection must not create a Session")
    },
  })
  if (options.editor !== undefined) ctx.provide("configEditor", options.editor)
  await ctx.plugin(Loader)
  ctx.loader.builtins["agent-default-model"] = AgentDefaultModel
  const id = await ctx.loader.create({
    id: "agent-default-model",
    name: "cordis:agent-default-model",
    config: {provider: "stored-provider", model: "stored-model"},
  })
  const entry = ctx.loader.resolve(id)
  await entry.fiber.await()
  return {
    ctx,
    entry,
    owner: ctx.agentDefaultModel,
    sessionCreates: () => sessionCreates,
  }
}

function updatingEditor(ctx, entry, behavior = {}) {
  return {
    calls: 0,
    async edit(target, change) {
      this.calls += 1
      if (behavior.entered !== undefined) behavior.entered.resolve()
      if (behavior.release !== undefined) await behavior.release.promise
      if (behavior.error !== undefined) throw behavior.error
      if (behavior.noop === true) return
      const next = change(
        structuredClone(target.options.config ?? {}),
        {},
      )
      const fiber = target.fiber
      assert.equal(target, entry)
      resolveConfig(fiber.runtime, fiber.ctx.waterfall(fiber, "internal/config", next, () => next))
      await target.update({config: next})
      await fiber.await()
      if (behavior.errorAfterApply !== undefined) throw behavior.errorAfterApply
      ctx.emit("app-boot/config-reload")
    },
  }
}

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return {promise, resolve}
}

function llm() {
  return {
    async resolveCallConfig(selection) {
      const external = selection.provider === "external-key" && selection.model === "external-model"
      if (!external && (selection.provider !== provider || selection.model !== model)) {
        throw new Error("model is not routable")
      }
      return external ? {...selection} : {...selection, reasoningEffort: "high"}
    },
  }
}

test("the public Host request accepts only bounded exact candidate fields", () => {
  assert.deepEqual(validateSetDefaultModel(loopRequest()), loopRequest())
  assert.deepEqual(validateSetDefaultModel({
    kind: "external",
    provider: "external-key",
    model: "external-model",
  }), {
    kind: "external",
    provider: "external-key",
    model: "external-model",
  })
  assert.throws(() => validateSetDefaultModel({
    ...loopRequest(),
    configPath: "/tmp/profile.yml",
  }), /unknown field/u)
  assert.throws(() => validateSetDefaultModel({
    kind: "external",
    provider,
    model,
  }), /kind must match/u)
  assert.throws(() => validateSetDefaultModel({
    kind: "loop",
    provider,
    model,
  }), /non-empty bounded string/u)
  assert.ok(remote.descriptors.some(descriptor => descriptor.method === "setDefaultModel"))
})

test("the official default owner persists an explicit Loop choice after delayed editor completion", async () => {
  const entered = deferred()
  const release = deferred()
  const harness = await ownerHarness()
  const editor = updatingEditor(harness.ctx, harness.entry, {entered, release})
  harness.ctx.provide("configEditor", editor)

  let settled = false
  const pending = saveExplicitDefaultModel({
    request: loopRequest(),
    status: activeStatus(),
    currentServerRevision: "rev-alpha",
    currentWorkspaceId: "wsp_alpha", currentAccountPrincipal: "hum_alpha",
    llm: llm(),
    agentDefaultModel: harness.owner,
    configEditor: editor,
  }).finally(() => { settled = true })
  await entered.promise
  assert.equal(settled, false)
  release.resolve()
  const result = await pending

  assert.deepEqual(result.selection, {
    provider,
    model,
    reasoningEffort: "high",
  })
  assert.deepEqual(harness.owner.currentSelection(), result.selection)
  assert.equal(harness.sessionCreates(), 0)
  await harness.ctx.fiber.dispose()
})

test("missing or read-only persistence never reports default-model success", async () => {
  const harness = await ownerHarness()
  const request = loopRequest()
  const common = {
    request,
    status: activeStatus(),
    currentServerRevision: "rev-alpha",
    currentWorkspaceId: "wsp_alpha", currentAccountPrincipal: "hum_alpha",
    llm: llm(),
    agentDefaultModel: harness.owner,
  }

  await assert.rejects(
    saveExplicitDefaultModel({...common, configEditor: undefined}),
    error => error.code === "loop-host/model-default-readonly",
  )
  await assert.rejects(
    saveExplicitDefaultModel({
      ...common,
      configEditor: updatingEditor(harness.ctx, harness.entry, {noop: true}),
    }),
    error => error.code === "loop-host/model-default-not-persisted",
  )
  assert.deepEqual(harness.owner.currentSelection(), {
    provider: "stored-provider",
    model: "stored-model",
  })
  await harness.ctx.fiber.dispose()
})

test("an exact external Key default does not depend on Loop model status", async () => {
  const harness = await ownerHarness()
  const editor = updatingEditor(harness.ctx, harness.entry)
  harness.ctx.provide("configEditor", editor)
  const result = await saveExplicitDefaultModel({
    request: {
      kind: "external",
      provider: "external-key",
      model: "external-model",
    },
    status: null,
    currentServerRevision: "",
    llm: llm(),
    agentDefaultModel: harness.owner,
    configEditor: editor,
  })
  assert.deepEqual(result.selection, {
    provider: "external-key",
    model: "external-model",
  })
  await harness.ctx.fiber.dispose()
})

test("a failed editor write rejects and the same value can be retried", async () => {
  const harness = await ownerHarness()
  const behavior = {error: new Error("read-only")}
  const editor = updatingEditor(harness.ctx, harness.entry, behavior)
  harness.ctx.provide("configEditor", editor)
  const request = loopRequest()
  await assert.rejects(
    saveExplicitDefaultModel({
      request,
      status: activeStatus(),
      currentServerRevision: "rev-alpha",
      currentWorkspaceId: "wsp_alpha", currentAccountPrincipal: "hum_alpha",
      llm: llm(),
      agentDefaultModel: harness.owner,
      configEditor: editor,
    }),
    error => error.code === "loop-host/model-default-save",
  )
  behavior.error = undefined
  const result = await saveExplicitDefaultModel({
    request,
    status: activeStatus(),
    currentServerRevision: "rev-alpha",
    currentWorkspaceId: "wsp_alpha", currentAccountPrincipal: "hum_alpha",
    llm: llm(),
    agentDefaultModel: harness.owner,
    configEditor: editor,
  })
  assert.equal(result.selection.provider, provider)
  assert.equal(result.selection.model, model)
  await harness.ctx.fiber.dispose()
})

test("an old Loop identity cannot write the default before persistence starts", async () => {
  const harness = await ownerHarness()
  const editor = updatingEditor(harness.ctx, harness.entry)
  await assert.rejects(
    saveExplicitDefaultModel({
      request: loopRequest({expectedAccountPrincipal: "hum_other"}),
      status: activeStatus(),
      currentServerRevision: "rev-alpha",
      currentWorkspaceId: "wsp_alpha", currentAccountPrincipal: "hum_alpha",
      llm: llm(),
      agentDefaultModel: harness.owner,
      configEditor: editor,
    }),
    error => error.code === "loop-host/model-default-scope",
  )
  assert.equal(editor.calls, 0)
  await harness.ctx.fiber.dispose()
})

test("a routable provider from another connection is rejected before resolution or saving", async () => {
  let resolves = 0
  let saves = 0
  await assert.rejects(saveExplicitDefaultModel({
    request: loopRequest({provider: "loop-model-foreignroute"}),
    status: activeStatus(),
    currentServerRevision: "rev-alpha",
    currentWorkspaceId: "wsp_alpha", currentAccountPrincipal: "hum_alpha",
    llm: {resolveCallConfig: async choice => { resolves++; return choice }},
    agentDefaultModel: {saveSelection: async () => { saves++ }, currentSelection: () => ({})},
    configEditor: {},
  }), error => error.code === "loop-host/model-default-scope")
  assert.equal(resolves, 0)
  assert.equal(saves, 0)
})

test("an identity change while resolving the route prevents the actual save", async () => {
  let identity = {currentServerRevision: "rev-alpha", currentWorkspaceId: "wsp_alpha", currentAccountPrincipal: "hum_alpha"}
  let saves = 0
  await assert.rejects(saveExplicitDefaultModel({
    request: loopRequest(), status: activeStatus(),
    getCurrentIdentity: () => identity,
    llm: {resolveCallConfig: async choice => {
      identity = {...identity, currentAccountPrincipal: "hum_other"}
      return choice
    }},
    agentDefaultModel: {saveSelection: async () => { saves++ }, currentSelection: () => ({})},
    configEditor: {},
  }), error => error.code === "loop-host/model-default-scope")
  assert.equal(saves, 0)
})

test("an editor failure after changing live config is unknown and same-value retry can confirm it", async () => {
  const harness = await ownerHarness()
  const behavior = {errorAfterApply: new Error("profile write failed")}
  const editor = updatingEditor(harness.ctx, harness.entry, behavior)
  harness.ctx.provide("configEditor", editor)
  const input = {
    request: loopRequest(), status: activeStatus(), currentServerRevision: "rev-alpha",
    currentWorkspaceId: "wsp_alpha", currentAccountPrincipal: "hum_alpha", llm: llm(), agentDefaultModel: harness.owner,
    configEditor: editor,
  }
  await assert.rejects(saveExplicitDefaultModel(input), error => error.code === "loop-host/model-default-unknown")
  assert.equal(harness.owner.currentSelection().provider, provider)
  behavior.errorAfterApply = undefined
  assert.equal((await saveExplicitDefaultModel(input)).selection.provider, provider)
  await harness.ctx.fiber.dispose()
})

test("cancellation during the editor write does not claim the default stayed unchanged", async () => {
  const harness = await ownerHarness()
  const entered = deferred()
  const release = deferred()
  const editor = updatingEditor(harness.ctx, harness.entry, {entered, release})
  harness.ctx.provide("configEditor", editor)
  const abort = new AbortController()
  const pending = saveExplicitDefaultModel({
    request: loopRequest(), status: activeStatus(), currentServerRevision: "rev-alpha",
    currentWorkspaceId: "wsp_alpha", currentAccountPrincipal: "hum_alpha", llm: llm(), agentDefaultModel: harness.owner,
    configEditor: editor, signal: abort.signal,
  })
  await entered.promise
  abort.abort()
  release.resolve()
  await assert.rejects(pending, error => error.code === "loop-host/model-default-unknown")
  assert.equal(harness.owner.currentSelection().provider, provider)
  await harness.ctx.fiber.dispose()
})

for (const changedIdentity of [
  {currentServerRevision: "rev-other"},
  {currentAccountPrincipal: "hum_other"},
  {currentWorkspaceId: "wsp_other"},
]) {
  test(`an identity change during the official editor save is unknown: ${Object.keys(changedIdentity)[0]}`, async () => {
    const harness = await ownerHarness()
    const entered = deferred()
    const release = deferred()
    const editor = updatingEditor(harness.ctx, harness.entry, {entered, release})
    harness.ctx.provide("configEditor", editor)
    let identity = {
      currentServerRevision: "rev-alpha",
      currentAccountPrincipal: "hum_alpha",
      currentWorkspaceId: "wsp_alpha",
    }
    const pending = saveExplicitDefaultModel({
      request: loopRequest(), status: activeStatus(), getCurrentIdentity: () => identity,
      llm: llm(), agentDefaultModel: harness.owner, configEditor: editor,
    })
    await entered.promise
    identity = {...identity, ...changedIdentity}
    release.resolve()
    await assert.rejects(pending, error => error.code === "loop-host/model-default-unknown")
    assert.equal(harness.owner.currentSelection().provider, provider, "report uncertainty without claiming rollback")
    await harness.ctx.fiber.dispose()
  })
}

test("a request for a workspace other than the Host selection is rejected before save", async () => {
  let saves = 0
  await assert.rejects(saveExplicitDefaultModel({
    request: loopRequest(), status: activeStatus(),
    currentServerRevision: "rev-alpha", currentAccountPrincipal: "hum_alpha", currentWorkspaceId: "wsp_other",
    llm: llm(), agentDefaultModel: {saveSelection: async () => { saves++ }, currentSelection: () => ({})},
    configEditor: {},
  }), error => error.code === "loop-host/model-default-scope")
  assert.equal(saves, 0)
})
