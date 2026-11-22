import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {resolve} from "node:path"
import test from "node:test"
import vm from "node:vm"

const source = readFileSync(resolve(import.meta.dirname, "..", "client.js"), "utf8")

function loadClientModule() {
  let loaded
  vm.runInNewContext(source, {
    window: {
      __ModuleLoader__: {
        load(entry) {
          loaded = entry
        },
      },
    },
    document: {
      querySelector: () => null,
      createElement: () => ({dataset: {}}),
      head: {append: () => {}},
    },
  })
  assert.equal(loaded.id, "@pingkai/loop-dsh")
  assert.equal(typeof loaded.factory, "function")
  return loaded.factory(() => undefined)
}

test("published client bundle registers one lazy DSH module for the package", () => {
  let loaded
  const appended = []
  vm.runInNewContext(source, {
    window: {
      __ModuleLoader__: {
        load(entry) {
          loaded = entry
        },
      },
    },
    document: {
      querySelector: () => null,
      createElement: () => ({dataset: {}}),
      head: {append: value => { appended.push(value) }},
    },
  })
  assert.equal(loaded.id, "@pingkai/loop-dsh")
  assert.equal(typeof loaded.factory, "function")
  const remote = name => {
    const stub = function () {}
    return new Proxy(stub, {get: () => stub})
  }
  const module = loaded.factory(remote)
  assert.equal(module.name, "@pingkai/loop-dsh/client")
  assert.deepEqual(Array.from(module.inject), ["remote"])
  assert.equal(typeof module.apply, "function")
  assert.equal(appended.length, 1)
  assert.match(source, /@deepseek-ai\/dsh-client-ui-primitives/)
  assert.doesNotMatch(source, /^\s*import\s+/mu)
  assert.doesNotMatch(source, /loop-new-session|module\.newSession/u)
})

test("client requires uiSession for model start and disposes UI before Remote", async () => {
  const module = loadClientModule()
  const calls = []
  let dependencies
  const ctx = {
    remote: {
      async $mount() {
        calls.push("mount")
        return async () => { calls.push("unmount") }
      },
    },
    inject(next) {
      dependencies = next
      calls.push("inject")
      return {
        then(resolve) { resolve() },
        async dispose() { calls.push("ui-dispose") },
      }
    },
  }

  const dispose = await module.apply(ctx)
  assert.ok(dependencies.includes("uiSession"))
  assert.ok(dependencies.includes("sessions"))
  assert.ok(dependencies.includes("remote.session"), "model catalog and selection require the Session Remote in this child context")
  assert.ok(dependencies.includes("uiConversation"), "Loop reference display uses the conversation text registry")
  assert.ok(dependencies.includes("modules"))

  await dispose()
  assert.deepEqual(calls, ["mount", "inject", "ui-dispose", "unmount"])
})

test("client startup failure disposes the UI child before unmounting Remote", async () => {
  const module = loadClientModule()
  const calls = []
  const ctx = {
    remote: {
      async $mount() {
        calls.push("mount")
        return async () => { calls.push("unmount") }
      },
    },
    inject() {
      calls.push("inject")
      return {
        then(_resolve, reject) { reject(new Error("ui failed")) },
        async dispose() { calls.push("ui-dispose") },
      }
    },
  }

  await assert.rejects(module.apply(ctx), /ui failed/u)
  assert.deepEqual(calls, ["mount", "inject", "ui-dispose", "unmount"])
})

test("renderer handles the pasted login token only in the sign-in path", () => {
  assert.doesNotMatch(source, /access_token|refresh[_ -]?token|cookie\s*[:=]/iu)
  const loginModules = new Set([
    "host-protocol.mjs", "client/ui/account-connection-controller.ts",
    "client/ui/login-dialog-controller.ts", "client/ui/loop-login-dialog.tsx",
  ])
  let moduleName = ""
  for (const line of source.split("\n")) {
    moduleName = /^    \/\/ (.+)$/u.exec(line)?.[1] ?? moduleName
    if (/access[ -]?token/iu.test(line)) assert.ok(loginModules.has(moduleName), moduleName)
    if (loginModules.has(moduleName)) assert.doesNotMatch(line, /localStorage|sessionStorage|indexedDB|console\.log/u)
  }
})
