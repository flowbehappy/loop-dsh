import assert from "node:assert/strict"
import {readFileSync} from "node:fs"
import {join} from "node:path"
import test from "node:test"

const root = join(import.meta.dirname, "..")
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))

test("Host and client entry points are packaged for the official bundle loader", () => {
  assert.equal(manifest.exports["./managed-actions"], "./managed-native-actions.mjs")
  assert.equal(manifest.exports["./host-service"], "./host-service.mjs")
  assert.equal(manifest.exports["./host-loop-skills"], "./host-loop-skills.mjs")
  assert.equal(manifest.exports["./host-worksite"], "./host-worksite.mjs")
  assert.equal(manifest.exports["./host-models"], "./host-models.mjs")
  assert.equal(manifest.exports["./client"].default, "./client.js")
  assert.equal(manifest.exports["./remote"].default, "./remote.mjs")
  for (const file of [
    "managed-native-actions.mjs",
    "host-actions-core.mjs",
    "host-collaboration.mjs",
    "host-collaboration-ui-journal.mjs",
    "host-default-model.mjs",
    "host-loop-skills.mjs",
    "host-service.mjs",
    "host-worksite.mjs",
    "worksite-origin.mjs",
    "host-models.mjs",
    "model-identity.mjs",
    "model-identity.d.mts",
    "host-runtime.mjs",
    "host-protocol.mjs",
    "binding-store.mjs",
    "remote.mjs",
    "remote.d.ts",
    "client.js",
    "client/index.d.ts",
  ]) {
    assert.ok(manifest.files.includes(file), `${file} must be published`)
  }
  assert.equal(manifest.dsh.client.platform, "web")
  assert.ok(manifest.dsh.client.inject.includes("@deepseek-ai/dsh-api-gateway"))
  assert.ok(manifest.dsh.client.inject.includes("@deepseek-ai/dsh-api-remotes"))
  assert.ok(manifest.dsh.client.inject.includes("@deepseek-ai/dsh-api-session-controller"))
  assert.ok(manifest.dsh.client.inject.includes("@deepseek-ai/dsh-client-ui-input-trigger"))
  assert.deepEqual(manifest.dsh.client.external, [])
  assert.ok(manifest.peerDependencies["@deepseek-ai/dsh-llm"])
  assert.ok(manifest.peerDependencies["@deepseek-ai/dsh-skill"])
  assert.ok(manifest.peerDependencies["@deepseek-ai/dsh-llm-pi-ai"])
  assert.ok(manifest.peerDependencies["@earendil-works/pi-ai"])
  assert.equal(manifest.devDependencies["@deepseek-ai/dsh-agent-default-model"], "0.2.2-rc.1")
  assert.equal(manifest.devDependencies["@deepseek-ai/dsh-typert-protocol"], "0.2.2-rc.1")
  assert.match(manifest.peerDependencies["@deepseek-ai/dsh-typert-protocol"], /0\.2\.2-rc\.1/u)
  assert.match(manifest.engines.dsh, /0\.2\.2-rc\.1/u)
})

test("Host service exposes the exact gateway-visible Typert Remote binding", () => {
  const source = readFileSync(join(root, "host-service.mjs"), "utf8")
  assert.match(source, /import \{RemoteError, TypertRemoteService\} from "@deepseek-ai\/dsh-typert-protocol"/u)
  assert.match(source, /class LoopHostService extends TypertRemoteService/u)
  assert.match(source, /super\(ctx, "loopHostService", \{namespace: "loopHost"\}\)/u)
  assert.match(source, /sessions: ctx\.sessions,\s*sessionQuery: ctx\.sessionQuery,\s*workspaces: ctx\.workspaceRegistry,/u)
  assert.match(source, /async setDefaultModel\(request, signal\)/u)
})

test("managed Web and Desktop use the native action and sync providers", () => {
  for (const file of ["cordis.patch.yml", "cordis.managed.patch.yml"]) {
    const source = readFileSync(join(root, file), "utf8")
    assert.match(source, /name: '@pingkai\/loop-dsh\/managed-actions'/u)
    assert.match(source, /loopNativeSyncWriterFactory/u)
    assert.doesNotMatch(source, /helperExecutable|hostSyncBinary/u)
    assert.ok(source.indexOf("id: loop-proxy-dsh-models") > source.indexOf("id: loop-managed-actions"))
    assert.match(source, /- id: loop-proxy-dsh\n      name: '@pingkai\/loop-dsh'$/mu)
  }
})
