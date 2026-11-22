import assert from "node:assert/strict"
import {createHash} from "node:crypto"
import test from "node:test"

import {
  loopModelPickerID,
  loopModelRouteFromDigest,
  loopModelRouteInput,
  parseLoopModelPickerID,
} from "../model-identity.mjs"

test("provider route formatting is shared with the Loop model adapter", () => {
  const digest = createHash("sha256")
    .update(loopModelRouteInput("wsp_alpha", "eag_alpha"))
    .digest("hex")
  assert.equal(
    loopModelRouteFromDigest(digest),
    `loop-model-${digest.slice(0, 20)}`,
  )
})

test("picker identity round-trips encoded provider and model IDs", () => {
  const model = {
    wireApi: "anthropic-messages",
    source: "loop_personal",
    providerId: "provider:a/b",
    id: "model:one/two",
  }
  const picker = loopModelPickerID(model)
  assert.equal(
    picker,
    "anthropic-messages:loop_personal:provider%3Aa%2Fb:model%3Aone%2Ftwo",
  )
  assert.deepEqual(parseLoopModelPickerID(picker), {
    wireApi: "anthropic-messages",
    source: "loop_personal",
    providerId: "provider:a/b",
    modelId: "model:one/two",
  })
  assert.equal(parseLoopModelPickerID("model-a"), null)
  assert.equal(parseLoopModelPickerID("wire:source:%E0%A4%A:model"), null)
})
