import {NativeSyncWriter} from '../backend/sync-writer.ts'
import {appendFileSync} from 'node:fs'
import assert from "node:assert/strict"
import {cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {setTimeout as delay} from "node:timers/promises"
import test from "node:test"

// Exercise the packaged sync entry with official telemetry and the native writer.
// No account, credential store or network service participates.
async function fixture(t, history = false) {
  const root = mkdtempSync(join(tmpdir(), "loop-capture-"))
  cpSync(resolve(import.meta.dirname, "../../loop-dsh/lib"), join(root, "lib"), {recursive: true})
  symlinkSync(resolve(import.meta.dirname, "../node_modules"), join(root, "node_modules"), "dir")
  writeFileSync(join(root, "package.json"), '{"type":"module"}')
  const log = join(root, "events.jsonl")
  const listeners = new Map()
  const disposers = []
  const events = []
  const session = {id: "session-capture", header: {version: 4, cwd: root}, seq: 1,
    snapshotEvents: (from, through) => events.filter(event => event.seq >= from && event.seq < through)}
  let loggedIn = false
  let includeHistory = history
  let profileChanged
  let invalidate
  let admission = null
  let reads = 0
  const service = {
    syncCapturePolicy: () => ({loggedIn, uploadDisconnectedHistory: includeHistory}),
    sessionSyncTarget: async () => {
      reads++
      if (admission) await admission
      return loggedIn ? {profile: "loop-test"} : null
    },
    setSessionUploadStatus() {},
    currentSyncProfile: async () => "loop-test",
    addServerProfileListener(fn) { profileChanged = fn; return () => {} },
    addSessionInvalidationListener(fn) { invalidate = fn; return () => {} },
  }
  const ctx = {
    get: name => name === "loopNativeSyncWriterFactory" ? recordingWriter(log) : service,
    sessions: {get: () => session},
    workspaceRegistry: {list: () => [{sessionIds: [session.id]}]},
    sessionQuery: {observeSession: () => assert.fail("live-only sync must not open cold history")},
    logger: {warn() {}},
    waterfall: (_name, value) => value,
    on(name, fn) { listeners.set(name, fn) },
    effect(fn) { disposers.push(fn()) },
  }
  const {apply} = await import(pathToFileURL(join(root, "lib/index.js")))
  const append = content => {
    const event = {type: "user/message", seq: session.seq++, time: Date.now(),
      data: {id: `message-${session.seq}`, source: {kind: "user"}, content: [{type: "text", text: content}]}}
    events.push(event)
    listeners.get("session/event")?.(session, event)
  }
  append("before plugin start")
  apply(ctx, {workspaceRoot: root, profile: "loop-test",
    queueLimit: 100, ackTimeoutMs: 1000, shutdownTimeoutMs: 5000})
  t.after(async () => {
    for (const dispose of disposers.reverse()) await dispose?.()
    rmSync(root, {recursive: true, force: true})
  })
  return {
    append,
    contents: () => {
      try { return readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line).event.content) }
      catch (error) { if (error.code === "ENOENT") return []; throw error }
    },
    login() { loggedIn = true; profileChanged("loop-test") },
    async logout() { loggedIn = false; await invalidate([session.id]) },
    history(value) { includeHistory = value; profileChanged("loop-test") },
    blockAdmission(value) { admission = value },
    reads: () => reads,
  }
}

async function until(predicate) {
  const deadline = Date.now() + 4000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("capture did not settle")
    await delay(10)
  }
}

test("default uploads only new signed-in events across login, logout and replay triggers", async t => {
  const f = await fixture(t)
  f.append("signed out")
  await delay(30)
  assert.equal(f.reads(), 0)
  f.login()
  f.append("first signed-in message")
  await until(() => f.contents().length === 1)
  await f.logout()
  f.append("between logins")
  f.login()
  f.append("second signed-in message")
  await until(() => f.contents().length === 2)
  assert.deepEqual(f.contents(), ["first signed-in message", "second signed-in message"])
})

test("explicit history opt-in replays accessible history; switching off stops replay", async t => {
  const f = await fixture(t)
  f.append("signed out")
  f.history(true)
  f.login()
  await until(() => f.contents().length === 2)
  assert.deepEqual(f.contents(), ["before plugin start", "signed out"])
  f.history(false)
  await f.logout()
  f.append("later signed out")
  f.login()
  f.append("later signed in")
  await until(() => f.contents().length === 3)
  assert.equal(f.contents().at(-1), "later signed in")
})

test("logout fences events whose upload admission is still pending", async t => {
  const f = await fixture(t)
  let release
  f.blockAdmission(new Promise(resolve => { release = resolve }))
  f.login()
  f.append("old connection pending")
  await until(() => f.reads() > 0)
  await f.logout()
  f.append("signed out")
  f.login()
  f.blockAdmission(null)
  release()
  f.append("new connection")
  await until(() => f.contents().length === 1)
  assert.deepEqual(f.contents(), ["new connection"])
})

function recordingWriter(log) {
  return config => new NativeSyncWriter(config, async (profile, externalSessionId, pendingContext) => ({
    async recordObserved(event) {
      appendFileSync(log, JSON.stringify({profile, externalSessionId, pendingContext, event}) + "\n")
      return true
    },
    async flush() {},
  }))
}
