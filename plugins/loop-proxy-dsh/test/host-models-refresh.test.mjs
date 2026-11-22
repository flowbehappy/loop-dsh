import test from "node:test"
import assert from "node:assert/strict"
import {LoopModelRuntime} from "../host-models.mjs"

function fixture() {
  const model = (id, source = "loop_personal") => ({
    id, name: id, source, providerId: `provider-${id}`, wireApi: "openai-completions",
  })
  let current = {connections: [{
    connectionId: "connection", workspaceId: "workspace", providerName: "Loop",
    status: "active", models: [model("initial")],
  }]}
  let remote = structuredClone(current)
  let notifications = 0
  let reads = 0
  let refreshes = 0
  const actions = {
    async modelRuntimeCatalog() { reads++; return structuredClone(current) },
    async refreshModelConnections() { refreshes++; current = structuredClone(remote) },
  }
  const ctx = {llm: {registerAdapter() {
    notifications++
    return Object.assign(() => {}, {replace() { notifications++ }})
  }}}
  const runtime = new LoopModelRuntime(ctx, actions)
  return {
    runtime, actions, model,
    setRemote(value) { remote = value },
    setCurrent(value) { current = value },
    snapshot() { return structuredClone(current) },
    counts() { return {notifications, reads, refreshes} },
    async models() {
      const [route] = runtime.adapter.catalogs.keys()
      return route === undefined ? [] : runtime.adapter.listModels(route)
    },
  }
}

test("background refresh publishes personal and administrator additions without changing selection", async t => {
  t.mock.timers.enable({apis: ["setTimeout"]})
  const f = fixture()
  t.after(() => f.runtime.dispose())
  await f.runtime.sync()
  const initial = (await f.models())[0].id
  const next = f.snapshot()
  next.connections[0].models.push(f.model("personal-new"), f.model("admin-new", "loop_proxy"))
  f.setRemote(next)
  f.runtime.startRefreshing()
  f.runtime.startRefreshing()
  t.mock.timers.tick(15_000)
  await f.runtime.refreshInFlight
  assert.equal(f.counts().refreshes, 1)
  assert.equal(f.counts().notifications, 2)
  assert.equal((await f.models()).length, 3)
  assert.ok((await f.models()).some(model => model.id === initial))
  // The registry is the only mutation: no default/session selection API exists
  // on this context, so a refresh cannot silently replace the user's selection.
  await f.runtime.refresh()
  assert.equal(f.counts().notifications, 2)
  next.connections[0].models.splice(0, 1)
  f.setRemote(next)
  await f.runtime.refresh()
  assert.equal((await f.models()).length, 2)
  assert.equal(f.counts().notifications, 3)
})

test("a login with zero models discovers the first later addition", async t => {
  const f = fixture()
  t.after(() => f.runtime.dispose())
  const empty = f.snapshot()
  empty.connections[0].models = []
  f.setCurrent(empty)
  await f.runtime.sync()
  assert.equal(f.counts().notifications, 0)
  await f.runtime.refresh()
  assert.equal((await f.models()).length, 1)
  assert.equal(f.counts().notifications, 1)
})

test("concurrent refreshes coalesce and reread current scope after logout", async t => {
  const f = fixture()
  t.after(() => f.runtime.dispose())
  await f.runtime.sync()
  let finish
  f.actions.refreshModelConnections = () => new Promise(resolve => { finish = resolve })
  const refresh = f.runtime.refresh()
  assert.equal(f.runtime.refresh(), refresh)
  f.setCurrent({connections: []})
  await f.runtime.sync()
  finish({connections: [{status: "active", models: [f.model("stale-account")]}]})
  await refresh
  assert.deepEqual(await f.models(), [])
})

test("transient refresh failure retries on the next tick and disposal aborts pending work", async t => {
  t.mock.timers.enable({apis: ["setTimeout"]})
  const f = fixture()
  await f.runtime.sync()
  const refresh = f.actions.refreshModelConnections
  f.actions.refreshModelConnections = async () => { throw new Error("offline") }
  f.runtime.startRefreshing()
  t.mock.timers.tick(15_000)
  await assert.rejects(f.runtime.refreshInFlight, /offline/u)
  await Promise.resolve()
  await Promise.resolve()
  f.actions.refreshModelConnections = refresh
  t.mock.timers.tick(15_000)
  await f.runtime.refreshInFlight
  assert.equal(f.counts().refreshes, 1)
  let signal, finish
  f.actions.refreshModelConnections = (_input, value) => {
    signal = value
    return new Promise(resolve => { finish = resolve })
  }
  const pending = f.runtime.refresh()
  const reads = f.counts().reads
  await f.runtime.dispose()
  assert.equal(signal.aborted, true)
  finish()
  await pending
  t.mock.timers.tick(60_000)
  assert.equal(f.counts().reads, reads)
})

test("a scope change during a catalog read discards that read and drains the current scope", async t => {
  const f = fixture()
  t.after(() => f.runtime.dispose())
  await f.runtime.sync()
  const old = f.snapshot()
  old.connections[0].models.push(f.model("stale"))
  const read = f.actions.modelRuntimeCatalog
  let finish
  f.actions.modelRuntimeCatalog = () => new Promise(resolve => { finish = resolve })
  const pending = f.runtime.sync()
  f.setCurrent({connections: []})
  f.actions.modelRuntimeCatalog = read
  assert.equal(f.runtime.sync(), pending)
  finish(old)
  await pending
  assert.deepEqual(await f.models(), [])
  assert.equal(f.counts().notifications, 2, "only initial registration and current-scope removal")
})
