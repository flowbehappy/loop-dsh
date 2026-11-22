import test from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import {once} from "node:events"

import {LoopModelAdapter} from "../host-models.mjs"

for (const wireApi of ["openai-completions", "openai-responses", "anthropic-messages"]) {
  for (const status of [401, 403, 500]) {
    test(`${wireApi} preserves gateway ${status} diagnostics without replay`, async t => {
      const diagnostic = status === 401
        ? {code: "needs_authorization", message: "model connection authorization is no longer active"}
        : status === 403
          ? {code: "model_forbidden", message: "model use is disabled in personal assistant permissions"}
          : {code: "service_unavailable", message: "model gateway is unavailable"}
      let requests = 0
      const server = http.createServer((request, response) => {
        requests++
        request.resume()
        response.writeHead(status, {"content-type": "application/json"})
        response.end(JSON.stringify({error: diagnostic}))
      })
      server.listen(0, "127.0.0.1")
      await once(server, "listening")
      t.after(() => new Promise(resolve => server.close(resolve)))
      const descriptor = {
        id: "loop/test", name: "Test", source: "loop_hosted", wireApi,
      }
      const provider = "loop-test"
      const catalog = {provider, name: "Loop", connectionId: "connection-test",
        byPicker: new Map([["test-picker", descriptor]])}
      const adapter = new LoopModelAdapter({get: () => undefined}, {
        ensureModelSession: async () => ({
          baseURL: `http://127.0.0.1:${server.address().port}/v1`, localKey: "local-test-key",
        }),
      }, new Map([[provider, catalog]]))
      const chunks = []
      for await (const chunk of adapter.stream({
        provider, model: "test-picker",
        sessionId: "session-11111111-2222-3333-4444-555555555555",
        messages: [{role: "user", content: [{type: "text", text: "Reply OK."}]}], tools: [],
      })) chunks.push(chunk)
      const finish = chunks.find(chunk => chunk.type === "finish")
      assert.equal(finish.reason.kind, "error")
      assert.ok(finish.reason.failure.message.includes(diagnostic.message))
      if (status === 401 || status === 403) {
        assert.equal(finish.reason.failure.code, "LOOP_MODEL_AUTH")
      } else {
        assert.notEqual(finish.reason.failure.code, "LOOP_MODEL_AUTH")
      }
      assert.equal(requests, 1)
    })
  }
}
