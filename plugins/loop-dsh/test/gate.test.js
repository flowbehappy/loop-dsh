import assert from "node:assert/strict"
import test from "node:test"
import {setTimeout as delay} from "node:timers/promises"
import {SessionSyncGate} from "../lib/gate.js"

async function until(predicate) {
  const deadline = Date.now() + 2000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("background operation did not settle")
    await delay(2)
  }
}

test("local event handlers return immediately while admission is slow; bursts coalesce", async () => {
  let release
  const admitted = new Promise(resolve => { release = resolve })
  const delivered = []
  let checks = 0
  const gate = new SessionSyncGate(async () => { checks++; return admitted })
  try {
    for (let i = 0; i < 10000; i++) gate.queue("s", () => { delivered.push("history") })
    assert.equal(checks, 0, "no log processing inside the foreground callback")
    assert.equal(gate.jobs.size, 1)
    await until(() => checks === 1)
    assert.deepEqual(delivered, [])
    release({profile: "sync"})
    await until(() => delivered.length === 1)
    assert.equal(checks, 1)
  } finally { release({profile: "sync"}); await gate.shutdown() }
})

test("failed admission retains the local capture job and retries without another user event", async () => {
  let online = false
  const statuses = []
  const delivered = []
  const gate = new SessionSyncGate(async () => {
    if (!online) throw new Error("offline")
    return {profile: "sync"}
  }, undefined, {retryMin: 10, retryMax: 20, onStatus: (_, state) => statuses.push(state)})
  try {
    gate.queue("s", () => { delivered.push("history and new messages") })
    await until(() => statuses.includes("failed"))
    assert.deepEqual(delivered, [])
    online = true
    await until(() => delivered.length === 1)
    assert.deepEqual(statuses.slice(-2), ["uploading", "queued"])
  } finally { await gate.shutdown() }
})

test("long histories yield between slices and do not starve another Session", async () => {
  const order = []
  const gate = new SessionSyncGate(async () => ({profile: "sync"}))
  let remaining = 3
  try {
    gate.queue("long", () => { order.push("long"); return --remaining > 0 })
    gate.queue("short", () => { order.push("short") })
    await until(() => order.length === 4)
    assert.deepEqual(order, ["long", "short", "long", "long"])
  } finally { await gate.shutdown() }
})

test("shutdown cancels pending retries without running local capture", async () => {
  let calls = 0
  const gate = new SessionSyncGate(async () => null, undefined, {retryMin: 10})
  gate.queue("s", () => { calls++ })
  await until(() => gate.jobs.get("s")?.delay === 20)
  await gate.shutdown()
  await delay(20)
  assert.equal(calls, 0)
  assert.equal(gate.jobs.size, 0)
})

test("a new Session uploads while another Session is backing off", async () => {
  const delivered = []
  const gate = new SessionSyncGate(async id => {
    if (id === "offline") throw new Error("offline")
    return {profile: "sync"}
  }, undefined, {retryMin: 60000})
  try {
    gate.queue("offline", () => {})
    await until(() => gate.jobs.get("offline")?.delay === 60000)
    await until(() => gate.jobs.get("offline")?.due > Date.now())
    gate.queue("ready", () => { delivered.push("ready") })
    await until(() => delivered.length === 1)
  } finally { await gate.shutdown() }
})
