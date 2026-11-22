import test from "node:test"
import assert from "node:assert/strict"
import {Context} from "@deepseek-ai/cordis"
import {Loader} from "@deepseek-ai/cordis-plugin-loader"
import * as modelsPlugin from "../host-models.mjs"

test("official Cordis loader keeps model plugin dependencies and registers its catalog", async () => {
  const ctx = new Context()
  let registered = false
  const dispose = Object.assign(() => {}, {replace() {}})
  ctx.provide("llm", {registerAdapter(routes) {
    assert.equal(routes.length, 1)
    registered = true
    return dispose
  }})
  ctx.provide("sessions", {})
  ctx.provide("loopHostService", {addModelConnectionListener() { return () => {} }})
  ctx.provide("loopHostActions", {
    async modelRuntimeCatalog() {
      return {connections: [{
        status: "active", connectionId: "test-connection", workspaceId: "test-workspace", providerName: "Loop",
        models: [{id: "test-model", name: "Test model", source: "loop_proxy", providerId: "test-provider", wireApi: "openai-completions"}],
      }]}
    },
  })
  const plugin = Loader.prototype.unwrapExports(modelsPlugin)
  const fiber = ctx.plugin(plugin)
  try {
    await fiber
    await ctx.get("loopModelRuntime").sync()
    assert.equal(registered, true)
  } finally {
    await fiber.dispose()
    await ctx.fiber.dispose()
  }
})
