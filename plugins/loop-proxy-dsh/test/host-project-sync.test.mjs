import assert from "node:assert/strict"
import test from "node:test"
import {LoopHostRuntime} from "../host-runtime.mjs"

// Old tabs may remain open during a plugin update. They must not mutate local
// directories or recreate retired reverse project imports.
for (const method of ["setProjectSyncSettings", "changeProjectDirectory"]) {
  test(`${method} reports the retired workflow without filesystem changes`, async () => {
    await assert.rejects(LoopHostRuntime.prototype[method].call({}, {path: "/"}), {
      code: "loop-host/workflow-retired",
    })
  })
}
