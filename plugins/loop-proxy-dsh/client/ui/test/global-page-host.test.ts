import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import remote from '../../../remote.mjs'

const bundle = readFileSync(new URL('../../../client.js', import.meta.url), 'utf8')

test('global Loop page is owned by the persistent shell overlay seat', () => {
  assert.match(
    bundle,
    /\["globalServerStatus", globalPageSchema, "GlobalServerStatusRequest"\][\s\S]*\["globalServerWorkspaceStatus", globalPageSchema, "GlobalServerWorkspaceStatusRequest"\][\s\S]*\["configureGlobalServer", configureGlobalServerSchema, "ConfigureGlobalServerRequest"\][\s\S]*\["configureGlobalServerWorkspace", configureGlobalServerWorkspaceSchema, "ConfigureGlobalServerWorkspaceRequest"\]/u,
  )
  assert.match(bundle, /name: "shell\.overlay",\s*id: "loop-proxy\.global-page"/u)
  assert.match(bundle, /className: loop_ui_default\.globalHost/u)
  assert.match(bundle, /"data-loop-global-host": ""/u)
  assert.match(bundle, /"data-active": active \? "true" : void 0/u)
  assert.match(bundle, /visibility: hidden/u)
  assert.doesNotMatch(bundle, /className: loop_ui_default\.globalToolbar/u)
  assert.match(bundle, /onClick: actions\.reconnect/u)
  assert.match(bundle, /attachWorkspacePage: \(frame, pageUrl\)/u)
  assert.match(bundle, /newGlobalWorkspaceBridgeNonce/u)
  assert.match(bundle, /expectedServerRevision/u)
  assert.match(bundle, /name: "settings\.section",\s*id: LOOP_SETTINGS_ID/u)
  assert.match(bundle, /name: "settings\.launcher",\s*priority: LOOP_LAUNCHER_PRIORITY/u)
  assert.match(bundle, /name: "sidebar\.panellist\.actions",\s*id: "loop-proxy\.modules"/u)
  assert.match(bundle, /LOOP_PROJECTS_PANEL_ID = "loop-projects"/u)
  assert.match(bundle, /path: "\/projects"/u)
  assert.match(bundle, /id: "loop-tasks"/u)
  assert.match(bundle, /id: "loop-workflows"/u)
  assert.match(bundle, /type: "navigate"/u)
  assert.match(bundle, /type !== "route"/u)
  assert.doesNotMatch(bundle, /ProjectBindingDetail/u)
  assert.doesNotMatch(bundle, /screen === "page"/u)
  assert.match(bundle, /projectSyncSettings/u)
})

test('panel selection does not guard the iframe out of the persistent host', () => {
  const start = bundle.indexOf('function LoopPageFrame')
  const end = bundle.indexOf('function LoopGlobalHost', start)
  assert.notEqual(start, -1)
  const frameSource = bundle.slice(start, end === -1 ? undefined : end)

  assert.match(
    frameSource,
    /if \(state\.screen !== "ready" \|\| state\.page === null\) return null;[\s\S]*"iframe"/u,
  )
  assert.match(frameSource, /if \(!active \|\| state\.screen !== "ready"/u)
  assert.match(frameSource, /`\$\{state\.frameKey\}:\$\{state\.page\.url\}`/u)

  const hostStart = bundle.indexOf('function LoopGlobalHost')
  const hostEnd = bundle.indexOf('function LoopSettings', hostStart)
  const hostSource = bundle.slice(hostStart, hostEnd === -1 ? undefined : hostEnd)
  assert.match(hostSource, /setAttribute\("inert", ""\)/u)
  assert.match(hostSource, /LoopPageFrame,[\s\S]*?active/u)
  assert.doesNotMatch(hostSource, /active &&\s*\/\* @__PURE__ \*\/[^(]*\(LoopPageFrame/u)
})

test('published workspace Remote schema requires the observed server revision', () => {
  const descriptor = remote.methods['loopHost/configureGlobalServerWorkspace']
  const input = descriptor.input()
  assert.deepEqual(input.parse({
    request: {
      workspaceId: 'wsp_alpha',
      expectedServerRevision: 'rev-server-a',
    },
  }), {
    request: {
      workspaceId: 'wsp_alpha',
      expectedServerRevision: 'rev-server-a',
    },
  })
  assert.throws(() => input.parse({
    request: { workspaceId: 'wsp_alpha' },
  }), /expectedServerRevision/u)
})
