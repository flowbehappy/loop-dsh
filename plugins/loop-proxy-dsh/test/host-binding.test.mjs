import assert from "node:assert/strict"
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import test from "node:test"

import {BindingStore} from "../binding-store.mjs"
import {LoopHostRuntime} from "../host-runtime.mjs"

const WORKSPACE = resolve(tmpdir())
const WORKSPACE_ID = "ws_0123456789abcdef"
const PROJECT_ID = "proj_0123456789abcdef"
const CHANNEL_ID = "chn_0123456789abcdef"
const AGENT_ID = "agt_0123456789abcdef"

function target(overrides = {}) {
  return {
    loopServiceBaseUrl: "https://loop.example.test",
    loopWorkspaceId: "workspace-loop",
    loopWorkspaceName: "研发团队",
    projectId: PROJECT_ID,
    projectName: "TiDB 9.0 发布",
    defaultChannelId: CHANNEL_ID,
    agentId: AGENT_ID,
    agentName: "发布助手",
    accountName: "小林",
    webUrl: "https://loop.example.test/projects/" + PROJECT_ID,
    ...overrides,
  }
}

function fixture(options = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "loop-host-binding-test-")))
  chmodSync(root, 0o700)
  let clock = Date.parse("2026-11-07T00:00:00Z")
  let id = 0
  const store = new BindingStore({
    root,
    installationId: "installation-0123456789abcdef",
    defaultServiceBaseUrl: options.defaultServiceBaseUrl,
    now: () => new Date(clock++),
    randomID: () => `rev-${++id}`,
  })
  return {root, store}
}

test("binding state is private, atomic, and idempotent for the same target", async () => {
  const {root, store} = fixture()
  try {
    await store.init()
    assert.equal(statSync(root).mode & 0o777, 0o700)
    const first = await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "tidb-release",
      expectedRevision: null,
      target: target(),
    })
    const replay = await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "renamed",
      expectedRevision: null,
      target: target(),
    })
    assert.equal(replay.revision, first.revision)
    assert.equal(replay.workspaceTitle, "tidb-release")
    await assert.rejects(store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "tidb-release",
      expectedRevision: null,
      target: target({projectId: "proj_other"}),
    }), /binding revision changed/)
    const changed = await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "tidb-release",
      expectedRevision: first.revision,
      target: target({projectId: "proj_other", projectName: "Other"}),
    })
    assert.notEqual(changed.revision, first.revision)
    const stateFile = readFileSync(join(root, `account-${await accountFilename("account-one")}.json`), "utf8")
    assert.doesNotMatch(stateFile, /access_token|refresh_token|cookie|authorization code/i)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("project-only bindings preserve context without a channel or automatic sync", async () => {
  const {root, store} = fixture()
  try {
    const binding = await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "project-context",
      expectedRevision: null,
      target: target({defaultChannelId: CHANNEL_ID}),
    })
    assert.equal(binding.projectId, PROJECT_ID)
    assert.equal(binding.defaultChannelId, "")
    const session = await store.captureSession("account-one", {
      workspaceId: WORKSPACE_ID,
      sessionId: "project-only-session",
      sessionCreatedAt: Date.parse(binding.boundAt),
      binding,
    })
    assert.equal(session.projectId, PROJECT_ID)
    assert.equal(session.syncEnabled, false)
    assert.equal(session.syncPreference, "off")
    // Earlier plugin versions persisted the project channel on both records.
    await rewriteAccountState(root, state => {
      Object.values(state.bindings)[0].defaultChannelId = CHANNEL_ID
      Object.assign(state.sessions[session.sessionId], {defaultChannelId:CHANNEL_ID, syncEnabled:true, syncPreference:"project_default"})
    })
    const reloaded = await store.getBinding("account-one",WORKSPACE_ID,WORKSPACE)
    assert.equal(reloaded.defaultChannelId,"")
    const saved = await store.getSession("account-one",WORKSPACE_ID,session.sessionId)
    assert.deepEqual([saved.defaultChannelId,saved.syncEnabled,saved.syncPreference],["",false,"off"])
    const next = await store.captureSession("account-one",{
      workspaceId:WORKSPACE_ID,sessionId:"after-upgrade",sessionCreatedAt:Date.parse(binding.boundAt),binding:reloaded,
    })
    assert.deepEqual([next.projectId,next.defaultChannelId,next.syncEnabled],[PROJECT_ID,"",false])
    await assert.rejects(store.putBinding("account-one", {
      workspaceId: "ws_channel",
      workspacePath: WORKSPACE,
      workspaceTitle: "channel-target",
      expectedRevision: null,
      target: target({placementKind: "channel_session", defaultChannelId: undefined}),
    }), /channel id/)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("bindings are isolated by authenticated account and stable Workspace path", async () => {
  const {root, store} = fixture()
  try {
    await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "tidb-release",
      expectedRevision: null,
      target: target(),
    })
    assert.equal(await store.getBinding("account-two", WORKSPACE_ID, WORKSPACE), null)
    assert.equal(await store.getBinding("account-one", WORKSPACE_ID, `${WORKSPACE}-old`), null)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("local Worksite server persists across restart without accepting public HTTP", async () => {
  const {root, store} = fixture({defaultServiceBaseUrl: "http://LOOP.WORK.LOCALHOST:3302"})
  try {
    assert.equal(await store.getGlobalServer(), "http://loop.work.localhost:3302")
    const restarted = new BindingStore({root})
    assert.equal(await restarted.getGlobalServer(), "http://loop.work.localhost:3302")
    for (const host of ["localhost.evil", "loop.work.localhost.evil", "notlocalhost", "192.168.1.2"]) {
      assert.throws(() => new BindingStore({root, defaultServiceBaseUrl: `http://${host}`}), /Loop service URL is invalid/u)
    }
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("Loop workspace selection is persisted independently for each server", async () => {
  const serverA = "https://loop-a.example.test"
  const serverB = "https://loop-b.example.test"
  const {root, store} = fixture({defaultServiceBaseUrl: serverA})
  try {
    await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "workspace",
      expectedRevision: null,
      target: target({loopServiceBaseUrl: serverA, loopWorkspaceId: "wsp_server_a"}),
    })
    await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "workspace",
      expectedRevision: null,
      target: target({loopServiceBaseUrl: serverB, loopWorkspaceId: "wsp_server_b"}),
    })
    assert.equal(
      await store.getLoopWorkspaceForServer("account-one", serverA),
      "wsp_server_a",
    )
    assert.equal(
      await store.getLoopWorkspaceForServer("account-one", serverB),
      "wsp_server_b",
    )
    const restarted = new BindingStore({
      root,
      installationId: "installation-0123456789abcdef",
      defaultServiceBaseUrl: serverA,
    })
    assert.equal(
      await restarted.getLoopWorkspaceForServer("account-one", serverA),
      "wsp_server_a",
    )
    assert.equal(
      await restarted.getLoopWorkspaceForServer("account-one", serverB),
      "wsp_server_b",
    )
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("ambiguous Loop workspace bindings do not select a server workspace", async () => {
  const server = "https://loop.example.test"
  const {root, store} = fixture({defaultServiceBaseUrl: server})
  try {
    await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "workspace-a",
      expectedRevision: null,
      target: target({loopWorkspaceId: "wsp_one"}),
    })
    await store.putBinding("account-one", {
      workspaceId: "ws_abcdef0123456789",
      workspacePath: WORKSPACE,
      workspaceTitle: "workspace-b",
      expectedRevision: null,
      target: target({loopWorkspaceId: "wsp_two"}),
    })
    assert.equal(await store.getLoopWorkspaceForServer("account-one", server), null)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("removal planning keeps another Workspace binding and scopes its Session cleanup", async () => {
  const {root, store} = fixture()
  try {
    const workspaceB = "ws_abcdef0123456789"
    await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "workspace-a",
      expectedRevision: null,
      target: target(),
    })
    await store.putBinding("account-one", {
      workspaceId: workspaceB,
      workspacePath: WORKSPACE,
      workspaceTitle: "workspace-b",
      expectedRevision: null,
      target: target({projectId: "proj_b", projectName: "QA Project B"}),
    })
    const bindingA = await store.getBinding("account-one", WORKSPACE_ID, WORKSPACE)
    const bindingB = await store.getBinding("account-one", workspaceB, WORKSPACE)
    await store.captureSession("account-one", {
      workspaceId: WORKSPACE_ID,
      sessionId: "session-a",
      sessionCreatedAt: Date.parse(bindingA.boundAt),
      binding: bindingA,
    })
    await store.captureSession("account-one", {
      workspaceId: workspaceB,
      sessionId: "session-b",
      sessionCreatedAt: Date.parse(bindingB.boundAt),
      binding: bindingB,
    })

    assert.deepEqual(await store.workspaceRemovalPlan("account-one", WORKSPACE_ID), {
      found: true,
      hasRemainingBindings: true,
      sessionIds: ["session-a"],
    })
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("new Sessions inherit once and old Sessions remain on their original target", async () => {
  const {root, store} = fixture()
  try {
    let now = Date.parse("2026-11-07T00:00:00Z")
    const actions = {
      async beginBind() {
        return {state: "active", binding: target()}
      },
      async completeBind() {
        return {binding: target()}
      },
      async unbind() {},
    }
    const workspaces = new Map([[WORKSPACE_ID, {
      id: WORKSPACE_ID,
      path: WORKSPACE,
      title: "tidb-release",
      sessionIds: ["session-old", "session-new"],
    }]])
    const sessions = new Map([
      ["session-old", {header: {createdAt: now - 1000}}],
      ["session-new", {header: {createdAt: now + 1000}}],
    ])
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {
        get: id => workspaces.get(id),
        list: () => [...workspaces.values()],
      },
      sessions: {get: id => sessions.get(id)},
      actions,
      accountPrincipal: "account-one",
      now: () => now,
    })
    const ref = {workspaceId: WORKSPACE_ID, path: WORKSPACE, displayTitle: "tidb-release"}
    const bound = await runtime.beginBind(ref)
    assert.equal(bound.state, "active")
    assert.equal(await runtime.captureSession(WORKSPACE_ID, "session-old"), null)
    assert.equal(await runtime.sessionSyncEnabled("session-old"), false)
    const inherited = await runtime.sessionContext({workspaceId: WORKSPACE_ID, sessionId: "session-new"})
    assert.equal(inherited.state, "inherited")
    assert.equal(inherited.projectId, PROJECT_ID)
    assert.equal(inherited.defaultChannelId, "")

    now += 10_000
    const binding = await store.getBinding("account-one", WORKSPACE_ID, WORKSPACE)
    await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "tidb-release",
      expectedRevision: binding.revision,
      target: target({projectId: "proj_switched", projectName: "Switched"}),
    })
    const old = await runtime.sessionContext({workspaceId: WORKSPACE_ID, sessionId: "session-new"})
    assert.equal(old.state, "blocked")
    assert.equal(old.projectId, PROJECT_ID)
    assert.match(old.reason, /original project binding/)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("first bind without an account returns the login challenge and needs-auth view", async () => {
  const {root, store} = fixture()
  try {
    let loginUrl =
      "https://loop.example.test/tenant/loop/external-host/page-reauthorize#challenge=opaque&state=recovery-state"
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {get: () => ({
        id: WORKSPACE_ID,
        path: WORKSPACE,
        title: "tidb-release",
        sessionIds: [],
      })},
      sessions: {get: () => undefined},
      actions: {
        async beginBind() {
          return {
            state: "needs_auth",
            challenge: {
              id: "challenge-first",
              loginUrl,
              expiresAt: "2026-11-07T00:10:00Z",
            },
          }
        },
      },
      accountPrincipal: "",
    })
    const result = await runtime.beginBind({
      workspaceId: WORKSPACE_ID,
      path: WORKSPACE,
      displayTitle: "tidb-release",
      mode: "bind",
    })
    assert.equal(result.state, "needs_auth")
    assert.equal(result.challenge.id, "challenge-first")
    assert.equal(result.challenge.loginUrl, loginUrl)
    assert.equal(result.binding.state, "needs_auth")
    assert.equal(result.binding.workspace.workspaceId, WORKSPACE_ID)
    assert.equal(result.binding.revision, "")

    for (const invalidHash of [
      "#challenge=opaque&state=recovery-state&extra=value",
      "#challenge=opaque&challenge=duplicate&state=recovery-state",
      "#challenge=&state=recovery-state",
      "#challenge=opaque&state=recovery-state&locale=",
    ]) {
      loginUrl = "https://loop.example.test/external-host/page-reauthorize" + invalidHash
      await assert.rejects(
        () => runtime.beginBind({
          workspaceId: WORKSPACE_ID,
          path: WORKSPACE,
          displayTitle: "tidb-release",
          mode: "bind",
        }),
        /Login challenge URL is invalid/u,
      )
    }
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("beginBind recovers and persists the trusted helper account before binding", async () => {
  const server = "https://loop.example.test"
  const {root, store} = fixture({defaultServiceBaseUrl: server})
  try {
    await store.setGlobalServer(server)
    const calls = []
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {get: () => ({id: WORKSPACE_ID, path: WORKSPACE, sessionIds: []})},
      sessions: {get: () => undefined},
      actions: {
        async status(input) {
          calls.push("status")
          assert.equal(input.accountPrincipal, "")
          return {state: "active", accountPrincipal: "account-helper"}
        },
        async beginBind(input) {
          calls.push("beginBind")
          assert.equal(input.accountPrincipal, "account-helper")
          assert.equal(input.locale, "zh")
          return {state: "active", binding: target()}
        },
      },
      accountPrincipal: "",
      defaultServiceBaseUrl: server,
    })
    const result = await runtime.beginBind({
      workspaceId: WORKSPACE_ID,
      path: WORKSPACE,
      displayTitle: "tidb-release",
      mode: "bind",
      locale: "zh",
    })
    assert.equal(result.state, "active")
    assert.deepEqual(calls, ["status", "beginBind"])
    assert.equal(runtime.accountPrincipal, "account-helper")
    assert.equal(await store.getActiveAccount(server), "account-helper")
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("beginBind keeps an existing trusted account without helper re-adoption", async () => {
  const server = "https://loop.example.test"
  const {root, store} = fixture({defaultServiceBaseUrl: server})
  try {
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {get: () => ({id: WORKSPACE_ID, path: WORKSPACE, sessionIds: []})},
      sessions: {get: () => undefined},
      actions: {
        async status() {
          assert.fail("an existing account must not be replaced from helper status")
        },
        async beginBind(input) {
          assert.equal(input.accountPrincipal, "account-existing")
          return {state: "active", binding: target()}
        },
      },
      accountPrincipal: "account-existing",
      defaultServiceBaseUrl: server,
    })
    const result = await runtime.beginBind({
      workspaceId: WORKSPACE_ID,
      path: WORKSPACE,
      displayTitle: "tidb-release",
      mode: "bind",
    })
    assert.equal(result.state, "active")
    assert.equal(runtime.accountPrincipal, "account-existing")
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("server cutover cannot adopt an account reported by the old helper", async () => {
  const serverA = "https://loop-a.example.test"
  const serverB = "https://loop-b.example.test"
  const {root, store} = fixture({defaultServiceBaseUrl: serverA})
  try {
    let current = serverA
    const bindingAccounts = []
    const actions = {
      globalPageServiceBaseUrl: () => current,
      async setServiceBaseUrl(server) {
        current = server
      },
      async probeGlobalPage(server) {
        return {url: `${server}/external-host/page-login#next=%2Fworkspaces`}
      },
      async status() {
        return current === serverA
          ? {state: "active", accountPrincipal: "account-a"}
          : {state: "needs_auth", accountPrincipal: "account-a"}
      },
      async beginBind(input) {
        bindingAccounts.push({server: current, account: input.accountPrincipal})
        if (current === serverA && input.accountPrincipal === "account-a") {
          return {state: "active", binding: target({loopServiceBaseUrl: serverA})}
        }
        return {state: "needs_auth"}
      },
    }
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {get: () => ({id: WORKSPACE_ID, path: WORKSPACE, sessionIds: []})},
      sessions: {get: () => undefined},
      actions,
      accountPrincipal: "",
      defaultServiceBaseUrl: serverA,
    })
    // This test covers account cutover; project-sync scheduling has its own tests.
    runtime.scheduleProjectSync = () => {}
    const ref = {workspaceId: WORKSPACE_ID, path: WORKSPACE, displayTitle: "tidb-release"}
    assert.equal((await runtime.beginBind(ref)).state, "active")
    assert.equal(await store.getActiveAccount(serverA), "account-a")

    await runtime.configureGlobalServer({serverUrl: serverB})
    assert.equal((await runtime.beginBind(ref)).state, "needs_auth")
    assert.equal(runtime.accountPrincipal, "")
    assert.equal(await store.getActiveAccount(serverB), "")

    await runtime.configureGlobalServer({serverUrl: serverA})
    assert.equal((await runtime.beginBind(ref)).state, "active")
    assert.equal(runtime.accountPrincipal, "account-a")
    assert.deepEqual(bindingAccounts, [
      {server: serverA, account: "account-a"},
      {server: serverB, account: ""},
      {server: serverA, account: "account-a"},
    ])
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("server cutover restores each server's Loop workspace and rejects an unselected server", async () => {
  const serverA = "https://loop-a.example.test"
  const serverB = "https://loop-b.example.test"
  const serverC = "https://loop-c.example.test"
  const {root, store} = fixture({defaultServiceBaseUrl: serverA})
  try {
    await store.setLoopWorkspaceForServer(serverB, "wsp_server_b")
    await store.setActiveAccount("account-one", serverA)
    await store.setActiveAccount("account-one", serverB)
    await store.setActiveAccount("account-one", serverC)
    let selectedService = serverA
    let selectedWorkspace = "wsp_server_a"
    const configured = []
    const actions = {
      globalPageServiceBaseUrl: () => selectedService,
      currentLoopWorkspaceId: () => selectedWorkspace,
      async setServiceBaseUrl(server, workspace) {
        selectedService = server
        selectedWorkspace = workspace
        configured.push([server, workspace])
      },
      async probeGlobalPage(server) {
        return {url: `${server}/external-host/page-login#next=%2Fworkspaces`}
      },
      async beginBind(input) {
        return {
          state: "active",
          binding: target({
            loopServiceBaseUrl: selectedService,
            loopWorkspaceId: selectedWorkspace,
            projectId: selectedService === serverA ? "proj_server_a" : "proj_server_b",
            projectName: selectedService === serverA ? "Server A" : "Server B",
          }),
        }
      },
    }
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {get: () => ({id: WORKSPACE_ID, path: WORKSPACE, sessionIds: []})},
      sessions: {get: () => undefined},
      actions,
      accountPrincipal: "account-one",
      defaultServiceBaseUrl: serverA,
    })
    const ref = {workspaceId: WORKSPACE_ID, path: WORKSPACE, displayTitle: "local-workspace"}
    assert.equal((await runtime.beginBind(ref)).binding.loop.workspaceId, "wsp_server_a")
    assert.equal(ref.workspaceId, WORKSPACE_ID)

    await runtime.configureGlobalServer({serverUrl: serverB})
    assert.equal((await runtime.beginBind(ref)).binding.loop.workspaceId, "wsp_server_b")
    assert.equal(ref.workspaceId, WORKSPACE_ID)

    await runtime.configureGlobalServer({serverUrl: serverA})
    assert.equal((await runtime.beginBind(ref)).binding.loop.workspaceId, "wsp_server_a")

    await runtime.configureGlobalServer({serverUrl: serverC})
    await assert.rejects(
      runtime.beginBind(ref),
      error => error?.code === "loop-host/workspace-required" &&
        /Select a Loop workspace/u.test(error.message),
    )
    assert.deepEqual(await runtime.globalServerWorkspaceStatus(), {loopWorkspaceId: null})
    const serverStatus = await runtime.globalServerStatus()
    await runtime.configureGlobalServerWorkspace({
      workspaceId: "wsp_server_c",
      expectedServerRevision: serverStatus.serverRevision,
    })
    assert.deepEqual(await runtime.globalServerWorkspaceStatus(), {loopWorkspaceId: "wsp_server_c"})
    assert.equal((await runtime.beginBind(ref)).binding.loop.workspaceId, "wsp_server_c")
    assert.equal(await store.getLoopWorkspaceForServer("account-one", serverC), "wsp_server_c")
    assert.deepEqual(configured.slice(-4), [
      [serverB, "wsp_server_b"],
      [serverA, "wsp_server_a"],
      [serverC, ""],
      [serverC, "wsp_server_c"],
    ])
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("server revision fences queued workspace writes across cutover and return", async () => {
  const serverA = "https://loop-a.example.test"
  const serverB = "https://loop-b.example.test"
  const {root, store} = fixture({defaultServiceBaseUrl: serverA})
  try {
    await store.setActiveAccount("account-one", serverA)
    await store.setLoopWorkspaceForServer(serverB, "wsp_b")
    let currentServer = serverA
    let currentWorkspace = "wsp_a"
    let releaseProbe
    let probeStarted
    const probing = new Promise(resolve => { probeStarted = resolve })
    const configured = []
    const actions = {
      globalPageServiceBaseUrl: () => currentServer,
      currentLoopWorkspaceId: () => currentWorkspace,
      async setServiceBaseUrl(server, workspace) {
        currentServer = server
        currentWorkspace = workspace
        configured.push([server, workspace])
      },
      probeGlobalPage(server) {
        if (server !== serverB) {
          return {url: `${server}/external-host/page-login#next=%2Fworkspaces`}
        }
        probeStarted()
        return new Promise(resolve => {
          releaseProbe = () => resolve({
            url: `${server}/external-host/page-login#next=%2Fworkspaces`,
          })
        })
      },
    }
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {get: () => ({id: WORKSPACE_ID, path: WORKSPACE, sessionIds: []})},
      sessions: {get: () => undefined},
      actions,
      accountPrincipal: "account-one",
      defaultServiceBaseUrl: serverA,
    })
    // This fixture exercises server cutover, not the background project sync owner.
    // Disable scheduling before initialization resumes so cleanup cannot race its writes.
    runtime.scheduleProjectSync = () => {}
    await runtime.waitForActions()
    const initial = await runtime.globalServerStatus()
    configured.length = 0
    const switching = runtime.configureGlobalServer({serverUrl: serverB})
    await probing
    const staleWorkspace = runtime.configureGlobalServerWorkspace({
      workspaceId: "wsp_a",
      expectedServerRevision: initial.serverRevision,
    }).then(value => ({value}), error => ({error}))
    let statusResolved = false
    const queuedStatus = runtime.globalServerStatus().then(value => {
      statusResolved = true
      return value
    })
    await new Promise(resolve => setTimeout(resolve, 30))
    assert.deepEqual(configured, [])
    assert.equal(statusResolved, false)
    releaseProbe()
    const switched = await switching
    assert.notEqual(switched.serverRevision, initial.serverRevision)
    assert.deepEqual(await queuedStatus, {
      serverUrl: serverB,
      serverRevision: switched.serverRevision,
      connection: {state: "unavailable"},
    })
    const staleOutcome = await staleWorkspace
    assert.equal(staleOutcome.error?.code, "loop-host/conflict")
    assert.match(staleOutcome.error?.message || "", /server revision changed/u)
    assert.equal(await store.getLoopWorkspaceForServer("account-one", serverB), "wsp_b")
    assert.equal(currentWorkspace, "wsp_b")

    const returned = await runtime.configureGlobalServer({serverUrl: serverA})
    assert.notEqual(returned.serverRevision, initial.serverRevision)
    assert.equal(currentWorkspace, "wsp_a")
    await assert.rejects(
      runtime.configureGlobalServerWorkspace({
        workspaceId: "wsp_old",
        expectedServerRevision: initial.serverRevision,
      }),
      error => error?.code === "loop-host/conflict",
    )
    await runtime.configureGlobalServerWorkspace({
      workspaceId: "wsp_a_next",
      expectedServerRevision: returned.serverRevision,
    })
    assert.deepEqual(await runtime.globalServerWorkspaceStatus(), {
      loopWorkspaceId: "wsp_a_next",
    })
    const signedPage = `${serverA}/external-host/page-session#page_launch=test-launch&page_origin=https%3A%2F%2Fharness.example.test&next=%2Fworkspaces`
    actions.globalPage = async () => ({url: signedPage})
    const sameServer = await runtime.configureGlobalServer({serverUrl: serverA})
    assert.equal(sameServer.page.url, `${serverA}/external-host/page-login#next=%2Fworkspaces`)
    assert.equal(sameServer.serverRevision, returned.serverRevision)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("Host Remote schemas reject unknown fields and unsafe locators", async () => {
  const {default: remote} = await import("../remote.mjs")
  const status = remote.methods["loopHost/status"]
  assert.deepEqual(status.input({strict: true}).parse({
    request: {workspaceId: WORKSPACE_ID, path: WORKSPACE, displayTitle: "tidb-release"},
  }).request.workspaceId, WORKSPACE_ID)
  assert.throws(() => status.input({strict: true}).parse({
    request: {workspaceId: WORKSPACE_ID, path: WORKSPACE, displayTitle: "tidb-release", accessToken: "nope"},
  }), /unknown field/)
  assert.throws(() => status.input({strict: true}).parse({
    request: {workspaceId: "../../escape", path: WORKSPACE, displayTitle: "tidb-release"},
  }), /workspaceId is invalid/)
  assert.throws(() => status.input({strict: true}).parse({
    request: {workspaceId: WORKSPACE_ID, path: "relative", displayTitle: "tidb-release"},
  }), /must be absolute/)

  const globalPage = remote.methods["loopHost/globalPage"]
  assert.deepEqual(globalPage.input({strict: true}).parse({request: {}}), {request: {}})
  assert.throws(() => globalPage.input({strict: true}).parse({
    request: {workspaceId: WORKSPACE_ID},
  }), /unknown field/)
  assert.throws(() => globalPage.input({strict: true}).parse({
    request: {pagePath: "//evil.example/path"},
  }), /unknown field/)
  const configureServer = remote.methods["loopHost/configureGlobalServer"]
  assert.deepEqual(configureServer.input({strict: true}).parse({
    request: {serverUrl: "https://loop.example.test"},
  }), {request: {serverUrl: "https://loop.example.test"}})
  assert.throws(() => configureServer.input({strict: true}).parse({
    request: {serverUrl: "", accessToken: "no"},
  }), /unknown field|non-empty bounded string/)

  const beginBind = remote.methods["loopHost/beginBind"]
  assert.deepEqual(beginBind.input({strict: true}).parse({
    request: {
      workspaceId: WORKSPACE_ID,
      path: WORKSPACE,
      displayTitle: "tidb-release",
      mode: "bind",
      locale: "zh",
      choice: {projectId: PROJECT_ID, agentId: AGENT_ID},
    },
  }).request, {
    workspaceId: WORKSPACE_ID,
    path: WORKSPACE,
    displayTitle: "tidb-release",
    mode: "bind",
    locale: "zh",
    choice: {projectId: PROJECT_ID, agentId: AGENT_ID},
  })
  assert.throws(() => beginBind.input({strict: true}).parse({
    request: {
      workspaceId: WORKSPACE_ID,
      path: WORKSPACE,
      displayTitle: "tidb-release",
      mode: "invalid",
    },
  }), /mode must be bind or switch/)
  assert.throws(() => beginBind.input({strict: true}).parse({
    request: {
      workspaceId: WORKSPACE_ID,
      path: WORKSPACE,
      displayTitle: "tidb-release",
      locale: "fr",
    },
  }), /locale must be zh or en/)

  assert.equal(remote.methods["loopHost/beginModelAuthorization"], undefined)
  assert.equal(remote.methods["loopHost/completeModelAuthorization"], undefined)

  const unbind = remote.methods["loopHost/unbind"]
  assert.throws(() => unbind.input({strict: true}).parse({
    request: {
      workspaceId: WORKSPACE_ID,
      path: WORKSPACE,
      displayTitle: "tidb-release",
      expectedRevision: "rev-one",
      hasRemainingBindings: true,
    },
  }), /unknown field/)

  const setSync = remote.methods["loopHost/setSync"]
  assert.deepEqual(setSync.input({strict: true}).parse({
    request: {
      workspaceId: WORKSPACE_ID,
      sessionId: "session-sync",
      enabled: true,
      confirmedSourceSequence: 41,
    },
  }), {
    request: {
      workspaceId: WORKSPACE_ID,
      sessionId: "session-sync",
      enabled: true,
      confirmedSourceSequence: 41,
    },
  })

  const workspaceStatus = remote.methods["loopHost/globalServerWorkspaceStatus"]
  assert.deepEqual(
    workspaceStatus.input({strict: true}).parse({request: {}}),
    {request: {}},
  )
  const configureWorkspace = remote.methods["loopHost/configureGlobalServerWorkspace"]
  assert.deepEqual(
    configureWorkspace.input({strict: true}).parse({
      request: {
        workspaceId: "wsp_server_b",
        expectedServerRevision: "server-revision-one",
      },
    }),
    {
      request: {
        workspaceId: "wsp_server_b",
        expectedServerRevision: "server-revision-one",
      },
    },
  )
  assert.throws(() => configureWorkspace.input({strict: true}).parse({
    request: {
      workspaceId: "wsp_server_b",
      expectedServerRevision: "server-revision-one",
      serverUrl: "https://evil.example",
    },
  }), /unknown field/)
  assert.throws(() => configureWorkspace.input({strict: true}).parse({
    request: {workspaceId: "wsp_server_b"},
  }), /non-empty bounded string/)

  const projectSettings = remote.methods["loopHost/projectSyncSettings"]
  assert.deepEqual(projectSettings.input({strict: true}).parse({request: {}}), {request: {}})
  assert.throws(() => projectSettings.input({strict: true}).parse({
    request: {defaultRoot: "/tmp/projects"},
  }), /unknown field/)

  const setProjectSettings = remote.methods["loopHost/setProjectSyncSettings"]
  assert.deepEqual(setProjectSettings.input({strict: true}).parse({
    request: {enabled: true, defaultRoot: "/tmp/projects"},
  }), {request: {enabled: true, defaultRoot: "/tmp/projects"}})
  assert.throws(() => setProjectSettings.input({strict: true}).parse({
    request: {},
  }), /require enabled or defaultRoot/)
  assert.throws(() => setProjectSettings.input({strict: true}).parse({
    request: {defaultRoot: "relative"},
  }), /must be absolute/)

  const changeDirectory = remote.methods["loopHost/changeProjectDirectory"]
  assert.deepEqual(changeDirectory.input({strict: true}).parse({
    request: {projectId: PROJECT_ID, path: "/tmp/release", expectedBindingRevision: "rev-one"},
  }), {
    request: {projectId: PROJECT_ID, path: "/tmp/release", expectedBindingRevision: "rev-one"},
  })
  assert.throws(() => changeDirectory.input({strict: true}).parse({
    request: {projectId: PROJECT_ID, path: "/tmp/release", workspaceId: WORKSPACE_ID},
  }), /unknown field/)
})

test("selection can omit an unconfirmed default channel and page sessions stay target-bound", async () => {
  const {root, store} = fixture()
  try {
    let now = Date.parse("2026-11-07T00:00:00Z")
    let pageOrigin = "http://127.0.0.1:64321"
    const actions = {
      async beginBind() {
        return {
          state: "select_target",
          projects: [{
            workspaceId: "workspace-loop",
            workspaceName: "研发团队",
            projectId: PROJECT_ID,
            projectName: "TiDB 9.0 发布",
            role: "edit",
          }],
          agents: [{agentId: AGENT_ID, displayName: "发布助手"}],
          challenge: {
            id: "challenge-one",
            loginUrl: "https://loop.example.test/oauth/authorize",
            expiresAt: "2026-11-07T00:10:00Z",
          },
        }
      },
      async completeBind() {
        return {binding: target()}
      },
      async openLoopPage(input) {
        assert.equal(input.binding.projectId, PROJECT_ID)
        assert.equal(input.pagePath, "/w/workspace-loop/projects/prj/board?filter=open")
        assert.deepEqual(Object.keys(input.binding).sort(), [
          "accountName",
          "agentId",
          "agentName",
          "defaultChannelId",
          "loopServiceBaseUrl",
          "loopWorkspaceId",
          "loopWorkspaceName",
          "projectId",
          "projectName",
          "webUrl",
        ])
        const fragment = new URLSearchParams({
          page_launch: "opaque-launch",
          page_origin: pageOrigin,
          next: `/w/wsp/${PROJECT_ID}/tasks`,
        })
        return {
          url: `https://loop.example.test/external-host/page-session#${fragment}`,
          expiresAt: "2026-11-07T01:00:00Z",
        }
      },
    }
    const workspaces = new Map([[WORKSPACE_ID, {
      id: WORKSPACE_ID,
      path: WORKSPACE,
      title: "tidb-release",
      sessionIds: ["session-new"],
    }]])
    const sessions = new Map([["session-new", {header: {createdAt: now + 5000}}]])
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {get: id => workspaces.get(id)},
      sessions: {get: id => sessions.get(id)},
      actions,
      accountPrincipal: "account-one",
      now: () => now,
    })
    const ref = {workspaceId: WORKSPACE_ID, path: WORKSPACE, displayTitle: "tidb-release"}
    const choices = await runtime.beginBind({...ref, mode: "switch"})
    assert.equal(choices.state, "select_target")
    assert.equal(choices.projects[0].defaultChannelId, undefined)
    await runtime.completeBind({
      ...ref,
      challengeId: "challenge-one",
      projectId: PROJECT_ID,
      agentId: AGENT_ID,
      expectedRevision: null,
    })
    await runtime.sessionContext({workspaceId: WORKSPACE_ID, sessionId: "session-new"})
    const page = await runtime.openLoopPage({
      ...ref,
      projectId: PROJECT_ID,
      sessionId: "session-new",
      pagePath: "/w/workspace-loop/projects/prj/board?filter=open",
    })
    assert.match(page.url, /#page_launch=opaque-launch/u)
    assert.doesNotMatch(page.url, /\?page_launch/u)
    pageOrigin = "dsh-app://app"
    const desktopPage = await runtime.openLoopPage({
      ...ref,
      projectId: PROJECT_ID,
      sessionId: "session-new",
      pagePath: "/w/workspace-loop/projects/prj/board?filter=open",
    })
    assert.match(desktopPage.url, /page_origin=dsh-app%3A%2F%2Fapp/u)
    await assert.rejects(runtime.openLoopPage({
      ...ref,
      projectId: "proj_other",
    }), /not bound/)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("the global Loop page is available without a Workspace binding", async () => {
  const {root, store} = fixture()
  try {
    const actions = {
      globalPageServiceBaseUrl() {
        return "https://loop.example.test/tenant/loop"
      },
      globalPage(input) {
        assert.deepEqual(input, {})
        return {
          url: "https://loop.example.test/tenant/loop/external-host/page-login#next=%2Ftenant%2Floop%2Fworkspaces",
        }
      },
    }
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {get: () => undefined},
      sessions: {get: () => undefined},
      actions,
      accountPrincipal: "",
    })
    const page = await runtime.globalPage({})
    assert.deepEqual(page, {
      url: "https://loop.example.test/tenant/loop/external-host/page-login#next=%2Ftenant%2Floop%2Fworkspaces",
    })
    actions.globalPage = () => ({url:"https://loop.example.test/tenant/loop/external-host/page-session#page_launch=one-time&page_origin=dsh-app%3A%2F%2Fapp&next=%2F"})
    assert.match((await runtime.globalPage({})).url, /page-session/)
    for (const unsafeURL of [
      "https://loop.example.test/tenant/loop/external-host/page-session#page_launch=x&page_origin=dsh-app%3A%2F%2Fapp&next=https%3A%2F%2Fevil.test",
      "https://evil.test/tenant/loop/external-host/page-login#next=%2Ftenant%2Floop%2F",
      "https://loop.example.test/external-host/page-login#next=%2Fworkspaces",
      "https://loop.example.test/tenant/loop/w/workspace-loop",
      "https://loop.example.test/tenant/loop/external-host/page-login#next=%2Ftenant%2Floop%2Fworkspaces&token=secret",
    ]) {
      actions.globalPage = () => ({url: unsafeURL})
      await assert.rejects(
        runtime.globalPage({}),
        error => error?.code === "loop-host/backend-invalid",
      )
    }
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("Workspace unbind forwards shared-authorization and Session cleanup facts", async () => {
  const {root, store} = fixture()
  try {
    const workspaceB = "ws_abcdef0123456789"
    const bindingA = await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "workspace-a",
      expectedRevision: null,
      target: target(),
    })
    const bindingB = await store.putBinding("account-one", {
      workspaceId: workspaceB,
      workspacePath: WORKSPACE,
      workspaceTitle: "workspace-b",
      expectedRevision: null,
      target: target({projectId: "proj_b", projectName: "QA Project B"}),
    })
    await store.captureSession("account-one", {
      workspaceId: WORKSPACE_ID,
      sessionId: "session-a",
      sessionCreatedAt: Date.parse(bindingA.boundAt),
      binding: bindingA,
    })
    await store.captureSession("account-one", {
      workspaceId: workspaceB,
      sessionId: "session-b",
      sessionCreatedAt: Date.parse(bindingB.boundAt),
      binding: bindingB,
    })
    await store.setSessionSync("account-one", WORKSPACE_ID, "session-a", true)
    await store.setSessionSync("account-one", workspaceB, "session-b", true)
    let forwarded
    let releaseUnbind
    let startedUnbind
    const unbindStarted = new Promise(resolve => { startedUnbind = resolve })
    const workspaces = new Map([
      [WORKSPACE_ID, {
        id: WORKSPACE_ID,
        path: WORKSPACE,
        sessionIds: ["session-a", "session-a-new"],
      }],
      [workspaceB, {
        id: workspaceB,
        path: WORKSPACE,
        sessionIds: ["session-b", "session-b-new"],
      }],
    ])
    const sessions = new Map([
      ["session-a", {header: {createdAt: Date.parse(bindingA.boundAt)}}],
      ["session-a-new", {header: {createdAt: Date.parse(bindingA.updatedAt)}}],
      ["session-b", {header: {createdAt: Date.parse(bindingB.boundAt)}}],
      ["session-b-new", {header: {createdAt: Date.parse(bindingB.updatedAt)}}],
    ])
    await rewriteAccountState(root, state => {
      // This historical Session had explicitly enabled an upload to this channel.
      Object.assign(state.sessions["session-b"], {defaultChannelId: CHANNEL_ID, syncPreference: "on", syncEnabled: true})
    })
    const actions = {
      currentSyncProfile() {
        return "account-sync"
      },
      unbind(input) {
        forwarded = input
        startedUnbind()
        return new Promise(resolve => { releaseUnbind = resolve })
      },
    }
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {get: id => workspaces.get(id)},
      sessions: {get: id => sessions.get(id)},
      actions,
      accountPrincipal: "account-one",
    })
    const invalidated = []
    runtime.addSessionInvalidationListener(sessionIds => invalidated.push(sessionIds))
    const unbinding = runtime.unbind({
      workspaceId: WORKSPACE_ID,
      path: WORKSPACE,
      displayTitle: "workspace-a",
      expectedRevision: bindingA.revision,
      recoveryMode: "human_confirmed",
    })
    await unbindStarted
    assert.equal(await runtime.sessionSyncEnabled("session-a"), false)
    assert.equal(await runtime.sessionSyncEnabled("session-b"), true)
    assert.equal(
      (await runtime.sessionContext({
        workspaceId: WORKSPACE_ID,
        sessionId: "session-a",
      })).state,
      "blocked",
    )
    assert.equal(await runtime.captureSession(WORKSPACE_ID, "session-a-new"), null)
    assert.equal(
      (await runtime.sessionContext({
        workspaceId: workspaceB,
        sessionId: "session-b",
      })).state,
      "inherited",
    )
    releaseUnbind()
    await unbinding

    assert.deepEqual(invalidated, [["session-a"]])
    assert.equal(forwarded.hasRemainingBindings, true)
    assert.deepEqual(forwarded.sessionIds, ["session-a"])
    assert.equal(forwarded.recoveryMode, "human_confirmed")
    assert.equal(await store.getBinding("account-one", WORKSPACE_ID, WORKSPACE), null)
    assert.equal(
      (await store.getBinding("account-one", workspaceB, WORKSPACE)).projectId,
      "proj_b",
    )
    assert.equal(await store.getSession("account-one", WORKSPACE_ID, "session-a"), null)
    assert.equal(
      (await store.getSession("account-one", workspaceB, "session-b")).projectId,
      "proj_b",
    )
    assert.equal(
      (await store.captureSession("account-one", {
        workspaceId: workspaceB,
        sessionId: "session-b-new",
        sessionCreatedAt: Date.parse(bindingB.updatedAt),
        binding: await store.getBinding("account-one", workspaceB, WORKSPACE),
      })).projectId,
      "proj_b",
    )
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("failed Workspace unbind stays fail-closed and preserves retry state", async () => {
  const {root, store} = fixture()
  try {
    const binding = await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "workspace-a",
      expectedRevision: null,
      target: target(),
    })
    await store.captureSession("account-one", {
      workspaceId: WORKSPACE_ID,
      sessionId: "session-a",
      sessionCreatedAt: Date.parse(binding.boundAt),
      binding,
    })
    await store.setSessionSync("account-one", WORKSPACE_ID, "session-a", true)
    let attempts = 0
    const helperInputs = []
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {get: () => ({id: WORKSPACE_ID, path: WORKSPACE, sessionIds: ["session-a"]})},
      sessions: {get: () => undefined},
      actions: {
        async unbind(input) {
          helperInputs.push(input)
          attempts += 1
          if (attempts === 1) throw new Error("temporary helper failure")
        },
      },
      accountPrincipal: "account-one",
    })
    const request = {
      workspaceId: WORKSPACE_ID,
      path: WORKSPACE,
      displayTitle: "workspace-a",
      expectedRevision: binding.revision,
    }

    await assert.rejects(runtime.unbind(request), /temporary helper failure/)
    assert.equal(helperInputs[0].hasRemainingBindings, false)
    assert.deepEqual(helperInputs[0].sessionIds, ["session-a"])
    assert.equal(await runtime.sessionSyncEnabled("session-a"), false)
    assert.equal((await store.getBinding("account-one", WORKSPACE_ID, WORKSPACE)).unbinding, true)

    await runtime.unbind(request)
    assert.equal(attempts, 2)
    assert.equal(helperInputs[1].hasRemainingBindings, false)
    assert.equal(await store.getBinding("account-one", WORKSPACE_ID, WORKSPACE), null)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("connection lease serializes unbind across independent runtime instances", async () => {
  const {root, store} = fixture()
  const secondStore = new BindingStore({
    root,
    installationId: "installation-0123456789abcdef",
  })
  try {
    await store.init()
    let releaseFirst
    let firstStarted
    let secondStarted = false
    const firstHeld = new Promise(resolve => { firstStarted = resolve })
    const first = store.withConnectionLease("account-one", undefined, async () => {
      firstStarted()
      await new Promise(resolve => { releaseFirst = resolve })
    })
    await firstHeld
    const second = secondStore.withConnectionLease("account-one", undefined, async () => {
      secondStarted = true
    })
    await new Promise(resolve => setTimeout(resolve, 50))
    assert.equal(secondStarted, false)
    releaseFirst()
    await Promise.all([first, second])
    assert.equal(secondStarted, true)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("concurrent A/B unbind leaves exactly one final connection cleanup", async () => {
  const {root, store} = fixture()
  try {
    const workspaceB = "ws_abcdef0123456789"
    const bindingA = await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "workspace-a",
      expectedRevision: null,
      target: target(),
    })
    const bindingB = await store.putBinding("account-one", {
      workspaceId: workspaceB,
      workspacePath: WORKSPACE,
      workspaceTitle: "workspace-b",
      expectedRevision: null,
      target: target({projectId: "proj_b", projectName: "QA Project B"}),
    })
    const remaining = []
    const actions = {
      async unbind(input) {
        remaining.push(input.hasRemainingBindings)
      },
    }
    const workspaces = new Map([
      [WORKSPACE_ID, {id: WORKSPACE_ID, path: WORKSPACE, sessionIds: []}],
      [workspaceB, {id: workspaceB, path: WORKSPACE, sessionIds: []}],
    ])
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {get: id => workspaces.get(id)},
      sessions: {get: () => undefined},
      actions,
      accountPrincipal: "account-one",
    })

    await Promise.all([
      runtime.unbind({
        workspaceId: WORKSPACE_ID,
        path: WORKSPACE,
        displayTitle: "workspace-a",
        expectedRevision: bindingA.revision,
      }),
      runtime.unbind({
        workspaceId: workspaceB,
        path: WORKSPACE,
        displayTitle: "workspace-b",
        expectedRevision: bindingB.revision,
      }),
    ])

    assert.deepEqual(remaining.sort(), [false, true])
    assert.equal(await store.getBinding("account-one", WORKSPACE_ID, WORKSPACE), null)
    assert.equal(await store.getBinding("account-one", workspaceB, WORKSPACE), null)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("a new binding cannot enter while final unbind owns the connection lease", async () => {
  const {root, store} = fixture()
  const secondStore = new BindingStore({
    root,
    installationId: "installation-0123456789abcdef",
  })
  try {
    const workspaceB = "ws_abcdef0123456789"
    const bindingA = await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "workspace-a",
      expectedRevision: null,
      target: target(),
    })
    let releaseUnbind
    let unbindStarted
    let completeCalls = 0
    let sharedRevoked = false
    const started = new Promise(resolve => { unbindStarted = resolve })
    const runtimeA = new LoopHostRuntime({
      store,
      workspaces: {get: () => ({id: WORKSPACE_ID, path: WORKSPACE, sessionIds: []})},
      sessions: {get: () => undefined},
      actions: {
        unbind(input) {
          assert.equal(input.hasRemainingBindings, false)
          sharedRevoked = true
          unbindStarted()
          return new Promise(resolve => { releaseUnbind = resolve })
        },
      },
      accountPrincipal: "account-one",
    })
    const runtimeB = new LoopHostRuntime({
      store: secondStore,
      workspaces: {get: () => ({id: workspaceB, path: WORKSPACE, sessionIds: []})},
      sessions: {get: () => undefined},
      actions: {
        async completeBind() {
          completeCalls += 1
          if (sharedRevoked) throw new Error("Loop authorization is required")
          return {binding: target({projectId: "proj_b", projectName: "QA Project B"})}
        },
      },
      accountPrincipal: "account-one",
    })

    const unbinding = runtimeA.unbind({
      workspaceId: WORKSPACE_ID,
      path: WORKSPACE,
      displayTitle: "workspace-a",
      expectedRevision: bindingA.revision,
    })
    await started
    const bindingNew = assert.rejects(runtimeB.completeBind({
      workspaceId: workspaceB,
      path: WORKSPACE,
      displayTitle: "workspace-b",
      challengeId: "challenge-b",
      projectId: "proj_b",
      agentId: AGENT_ID,
      expectedRevision: null,
    }), /authorization is required/)
    await new Promise(resolve => setTimeout(resolve, 50))
    assert.equal(completeCalls, 0)
    releaseUnbind()
    await unbinding
    await bindingNew
    assert.equal(await store.getBinding("account-one", workspaceB, WORKSPACE), null)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("retry after one local delete failure eventually finalizes the shared connection", async () => {
  const {root, store} = fixture()
  try {
    const workspaceB = "ws_abcdef0123456789"
    const bindingA = await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "workspace-a",
      expectedRevision: null,
      target: target(),
    })
    const bindingB = await store.putBinding("account-one", {
      workspaceId: workspaceB,
      workspacePath: WORKSPACE,
      workspaceTitle: "workspace-b",
      expectedRevision: null,
      target: target({projectId: "proj_b", projectName: "QA Project B"}),
    })
    const calls = []
    const removeBinding = store.removeBinding.bind(store)
    let failAOnce = true
    store.removeBinding = async (...args) => {
      if (args[1] === WORKSPACE_ID && failAOnce) {
        failAOnce = false
        throw new Error("local mapping delete failed")
      }
      return await removeBinding(...args)
    }
    const workspaces = new Map([
      [WORKSPACE_ID, {id: WORKSPACE_ID, path: WORKSPACE, sessionIds: []}],
      [workspaceB, {id: workspaceB, path: WORKSPACE, sessionIds: []}],
    ])
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {get: id => workspaces.get(id)},
      sessions: {get: () => undefined},
      actions: {
        async unbind(input) {
          calls.push({workspaceId: input.workspace.workspaceId, remaining: input.hasRemainingBindings})
        },
      },
      accountPrincipal: "account-one",
    })
    const requestA = {
      workspaceId: WORKSPACE_ID,
      path: WORKSPACE,
      displayTitle: "workspace-a",
      expectedRevision: bindingA.revision,
    }
    const requestB = {
      workspaceId: workspaceB,
      path: WORKSPACE,
      displayTitle: "workspace-b",
      expectedRevision: bindingB.revision,
    }

    await assert.rejects(runtime.unbind(requestA), /local mapping delete failed/)
    assert.equal((await store.getBinding("account-one", WORKSPACE_ID, WORKSPACE)).unbinding, true)
    await runtime.unbind(requestB)
    await runtime.unbind(requestA)

    assert.deepEqual(calls, [
      {workspaceId: WORKSPACE_ID, remaining: true},
      {workspaceId: workspaceB, remaining: false},
      {workspaceId: WORKSPACE_ID, remaining: false},
    ])
    assert.equal(await store.getBinding("account-one", WORKSPACE_ID, WORKSPACE), null)
    assert.equal(await store.getBinding("account-one", workspaceB, WORKSPACE), null)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("sync actions forward only the helper's project and channel context", async () => {
  const {root, store} = fixture()
  try {
    const contexts = []
    const syncInputs = []
    const actions = {
      async beginBind() {
        return {state: "active", binding: target({placementKind: "channel_session"})}
      },
      async syncStatus(input) {
        contexts.push(input.context)
        return {state: "off", pending: 0, historyPartial: false}
      },
      async setSync(input) {
        contexts.push(input.context)
        assert.equal(input.context.agentId, AGENT_ID)
        syncInputs.push(input)
        return {state: input.enabled ? "on" : "off", pending: 0, historyPartial: false}
      },
      async retrySync(input) {
        contexts.push(input.context)
        return {state: "off", pending: 0, historyPartial: false}
      },
    }
    const now = Date.parse("2026-11-07T00:00:00Z")
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {get: () => ({
        id: WORKSPACE_ID,
        path: WORKSPACE,
        title: "tidb-release",
        sessionIds: ["session-sync"],
      })},
      sessions: {get: () => ({header: {createdAt: now + 1000}, seq: 43})},
      actions,
      accountPrincipal: "account-one",
      now: () => now,
    })
    const ref = {workspaceId: WORKSPACE_ID, path: WORKSPACE, displayTitle: "tidb-release"}
    await runtime.beginBind(ref)
    const request = {workspaceId: WORKSPACE_ID, sessionId: "session-sync"}
    const initial = await runtime.syncStatus(request)
    assert.equal(initial.state, "pending", "status does not bind or upload an uncaptured Session")
    await runtime.setSync({...request, enabled: true})
    await runtime.setSync({...request, enabled: false})
    await runtime.setSync({...request, enabled: true})
    await runtime.retrySync(request)
    assert.deepEqual(contexts, [
      {projectId: "", defaultChannelId: CHANNEL_ID, agentId: AGENT_ID},
      {projectId: "", defaultChannelId: CHANNEL_ID, agentId: AGENT_ID},
      {projectId: "", defaultChannelId: CHANNEL_ID, agentId: AGENT_ID},
      {projectId: "", defaultChannelId: CHANNEL_ID, agentId: undefined},
    ])
    assert.deepEqual(syncInputs.map(input => input.confirmedSourceSequence), [undefined, undefined, 42])
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("a new Session waits for the Workspace registry projection before capture", async () => {
  const {root, store} = fixture()
  try {
    const now = Date.parse("2026-11-07T00:00:00Z")
    const workspace = {
      id: WORKSPACE_ID,
      path: WORKSPACE,
      title: "tidb-release",
      sessionIds: [],
    }
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {get: id => id === WORKSPACE_ID ? workspace : undefined},
      sessions: {get: id => id === "session-new-race"
        ? {header: {createdAt: now + 100}}
        : undefined},
      actions: {
        currentSyncProfile() {
          return "account-sync"
        },
        async beginBind() {
          return {state: "active", binding: target()}
        },
      },
      accountPrincipal: "account-one",
      now: () => now,
    })
    await runtime.beginBind({workspaceId: WORKSPACE_ID, path: WORKSPACE, displayTitle: "tidb-release"})
    setTimeout(() => { workspace.sessionIds.push("session-new-race") }, 5)

    const record = await runtime.captureSession(WORKSPACE_ID, "session-new-race")
    assert.equal(record.sessionId, "session-new-race")
    assert.equal(record.projectId, PROJECT_ID)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("first sync admission captures a Session missed by the created hook", async () => {
  const {root, store} = fixture()
  try {
    const now = Date.parse("2026-11-07T00:00:00Z")
    const workspace = {
      id: WORKSPACE_ID,
      path: WORKSPACE,
      title: "tidb-release",
      sessionIds: [],
    }
    const syncInputs = []
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {
        get: id => id === WORKSPACE_ID ? workspace : undefined,
        list: () => [workspace],
      },
      sessions: {get: id => id === "session-admission"
        ? {header: {createdAt: now + 100}}
        : undefined},
      actions: {
        currentSyncProfile() {
          return "account-sync"
        },
        async beginBind() {
          return {state: "active", binding: target({placementKind: "channel_session"})}
        },
        async setSync(input) {
          syncInputs.push(structuredClone(input))
          return {state: "on", pending: 0, historyPartial: false}
        },
      },
      accountPrincipal: "account-one",
      now: () => now,
    })
    await runtime.beginBind({workspaceId: WORKSPACE_ID, path: WORKSPACE, displayTitle: "tidb-release"})

    // The session/created hook can run before WorkspaceRegistry projects the ID.
    setTimeout(() => { workspace.sessionIds.push("session-admission") }, 5)

    assert.equal(await runtime.sessionSyncEnabled("session-admission"), true)
    const record = await store.getSession("account-one", WORKSPACE_ID, "session-admission")
    assert.equal(record.projectId, "")
    assert.equal(record.defaultChannelId, CHANNEL_ID)
    assert.equal(record.syncPreference, "project_default")
    assert.equal(syncInputs[0].confirmedSourceSequence, 0)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("live sync gating defaults on for new Sessions, respects opt-out, and requires the current binding revision", async () => {
  const {root, store} = fixture()
  try {
    const now = Date.parse("2026-11-07T00:00:00Z")
    const workspace = {
      id: WORKSPACE_ID,
      path: WORKSPACE,
      title: "tidb-release",
      sessionIds: ["session-gated"],
    }
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {
        get: id => id === WORKSPACE_ID ? workspace : undefined,
        list: () => [workspace],
      },
      sessions: {get: id => id === "session-gated"
        ? {header: {createdAt: now + 100}, seq: 43}
        : undefined},
      actions: {
        currentSyncProfile() {
          return "account-sync"
        },
        async beginBind() {
          return {state: "active", binding: target({placementKind: "channel_session"})}
        },
        async setSync(input) {
          return {
            state: input.enabled ? "on" : "off",
            pending: 0,
            historyPartial: false,
          }
        },
        async syncStatus() {
          return {state: "off", pending: 0, historyPartial: false}
        },
      },
      accountPrincipal: "account-one",
      now: () => now,
    })
    const ref = {workspaceId: WORKSPACE_ID, path: WORKSPACE, displayTitle: "tidb-release"}
    const syncInputs = []
    runtime.actions.setSync = async input => {
      syncInputs.push(structuredClone(input))
      return {
        state: !input.enabled
          ? "off"
          : input.confirmedSourceSequence === 0
          ? "needs_auth"
          : "on",
        pending: 0,
        historyPartial: false,
      }
    }
    await runtime.beginBind(ref)
    await runtime.captureSession(WORKSPACE_ID, "session-gated")
    assert.equal(await runtime.sessionSyncEnabled("session-gated"), true)
    assert.equal(syncInputs[0].confirmedSourceSequence, 0)
    assert.deepEqual(syncInputs[0].context, {
      projectId: "",
      defaultChannelId: CHANNEL_ID,
      agentId: AGENT_ID,
    })

    await runtime.setSync({
      workspaceId: WORKSPACE_ID,
      sessionId: "session-gated",
      enabled: true,
    })
    assert.equal(syncInputs[1].confirmedSourceSequence, undefined)
    assert.equal(
      (await store.getSession("account-one", WORKSPACE_ID, "session-gated")).syncPreference,
      "project_default",
    )

    await runtime.setSync({
      workspaceId: WORKSPACE_ID,
      sessionId: "session-gated",
      enabled: false,
    })
    assert.equal(await runtime.sessionSyncEnabled("session-gated"), false)
    assert.equal(
      (await store.getSession("account-one", WORKSPACE_ID, "session-gated")).syncPreference,
      "off",
    )
    await runtime.setSync({
      workspaceId: WORKSPACE_ID,
      sessionId: "session-gated",
      enabled: true,
    })
    assert.equal(syncInputs[3].confirmedSourceSequence, 42)
    assert.equal(await runtime.sessionSyncEnabled("session-gated"), true)
    assert.equal(
      (await store.getSession("account-one", WORKSPACE_ID, "session-gated")).syncPreference,
      "on",
    )
    const current = await store.getBinding("account-one", WORKSPACE_ID, WORKSPACE)
    await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "tidb-release",
      expectedRevision: current.revision,
      target: target({projectId: "proj_other", projectName: "Other"}),
    })
    assert.equal(await runtime.sessionSyncEnabled("session-gated"), false)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("a sync authorization challenge preserves automatic intent without claiming active sync", async () => {
  const {root, store} = fixture()
  try {
    let syncLoginUrl = "https://loop.example.test/oauth/authorize"
    const now = Date.parse("2026-11-07T00:00:00Z")
    const workspace = {
      id: WORKSPACE_ID,
      path: WORKSPACE,
      title: "tidb-release",
      sessionIds: ["session-sync-auth"],
    }
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {
        get: id => id === WORKSPACE_ID ? workspace : undefined,
        list: () => [workspace],
      },
      sessions: {get: id => id === "session-sync-auth"
        ? {header: {createdAt: now + 100}}
        : undefined},
      actions: {
        currentSyncProfile() {
          return "account-sync"
        },
        async beginBind() {
          return {state: "active", binding: target({placementKind: "channel_session"})}
        },
        async setSync() {
          return {
            state: "needs_auth",
            pending: 0,
            historyPartial: false,
            challenge: {
              id: "sync-auth",
              loginUrl: syncLoginUrl,
              expiresAt: "2026-11-07T00:10:00Z",
            },
          }
        },
      },
      accountPrincipal: "account-one",
      now: () => now,
    })
    const ref = {workspaceId: WORKSPACE_ID, path: WORKSPACE, displayTitle: "tidb-release"}
    await runtime.beginBind(ref)
    await runtime.captureSession(WORKSPACE_ID, "session-sync-auth")
    syncLoginUrl = "https://loop.example.test/oauth/authorize#unexpected=value"
    await assert.rejects(
      () => runtime.setSync({
        workspaceId: WORKSPACE_ID,
        sessionId: "session-sync-auth",
        enabled: true,
      }),
      /Login challenge URL is invalid/u,
    )
    syncLoginUrl = "https://loop.example.test/oauth/authorize"
    const result = await runtime.setSync({
      workspaceId: WORKSPACE_ID,
      sessionId: "session-sync-auth",
      enabled: true,
    })
    assert.equal(result.sync.state, "needs_auth")
    assert.equal(await runtime.sessionSyncEnabled("session-sync-auth"), true)
    assert.equal(
      (await store.getSession("account-one", WORKSPACE_ID, "session-sync-auth")).syncPreference,
      "project_default",
    )
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("Agent commands wait for a newly created Session's Workspace projection", async () => {
  const {root, store} = fixture()
  try {
    const now = Date.parse("2026-11-07T00:00:00Z")
    const workspace = {
      id: WORKSPACE_ID,
      path: WORKSPACE,
      title: "tidb-release",
      sessionIds: [],
    }
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {
        get: id => id === WORKSPACE_ID ? workspace : undefined,
        list: () => [workspace],
      },
      sessions: {get: id => id === "session-agent-race"
        ? {header: {createdAt: now + 100}}
        : undefined},
      actions: {
        async beginBind() {
          return {state: "active", binding: target()}
        },
        async agentCatalog() {
          return {actions: ["task.get"]}
        },
        async agentSchema() {
          return {name: "task.get", inputSchema: {type: "object"}}
        },
        async agentAction() {
          return {data: {}, metadata: {}}
        },
      },
      accountPrincipal: "account-one",
      now: () => now,
    })
    await runtime.beginBind({workspaceId: WORKSPACE_ID, path: WORKSPACE, displayTitle: "tidb-release"})
    setTimeout(() => { workspace.sessionIds.push("session-agent-race") }, 5)

    const result = await runtime.agentCommand("session-agent-race", {verb: "actions", name: ""})
    assert.equal(result.output, "task.get")
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("stale revisions fail before complete or unbind reaches the trusted helper", async () => {
  const {root, store} = fixture()
  try {
    const binding = await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "tidb-release",
      expectedRevision: null,
      target: target(),
    })
    let calls = 0
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {get: () => ({
        id: WORKSPACE_ID,
        path: WORKSPACE,
        title: "tidb-release",
        sessionIds: [],
      })},
      sessions: {get: () => undefined},
      actions: {
        async completeBind() {
          calls += 1
          return {binding: target()}
        },
        async unbind() {
          calls += 1
        },
      },
      accountPrincipal: "account-one",
    })
    const request = {workspaceId: WORKSPACE_ID, path: WORKSPACE, displayTitle: "tidb-release"}
    await assert.rejects(runtime.completeBind({
      ...request,
      challengeId: "challenge-one",
      projectId: PROJECT_ID,
      agentId: AGENT_ID,
      expectedRevision: "rev-stale",
    }), /revision changed/)
    await assert.rejects(runtime.unbind({...request, expectedRevision: "rev-stale"}), /revision changed/)
    assert.equal(calls, 0)
    assert.equal((await store.getBinding("account-one", WORKSPACE_ID, WORKSPACE)).revision, binding.revision)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("the authenticated account is restored after a Host restart without exposing another account", async () => {
  const {root, store} = fixture()
  try {
    await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "tidb-release",
      expectedRevision: null,
      target: target(),
    })
    await store.setActiveAccount("account-one")
    const restarted = new BindingStore({
      root,
      installationId: "installation-0123456789abcdef",
    })
    assert.equal(await restarted.getActiveAccount(), "account-one")
    const runtime = new LoopHostRuntime({
      store: restarted,
      workspaces: {get: () => ({
        id: WORKSPACE_ID,
        path: WORKSPACE,
        title: "tidb-release",
        sessionIds: [],
      })},
      sessions: {get: () => undefined},
      actions: {},
      accountPrincipal: "",
    })
    const status = await runtime.status({
      workspaceId: WORKSPACE_ID,
      path: WORKSPACE,
      displayTitle: "tidb-release",
    })
    assert.equal(status.state, "active")
    assert.equal(status.loop.projectId, PROJECT_ID)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("signed-out account states start and keep the global Loop entry available", async () => {
  const server = "https://loop.example.test"
  const workspace = {id: WORKSPACE_ID, path: WORKSPACE, title: "tidb-release", sessionIds: []}
  const actions = {
    globalPageServiceBaseUrl: () => server,
    async setServiceBaseUrl(url) {
      assert.equal(url, server)
    },
    async globalPage() {
      return {url: `${server}/external-host/page-login#next=%2Fworkspaces`}
    },
    async status() {
      assert.fail("a signed-out account must not call the Workspace status helper")
    },
  }
  const makeStore = root => new BindingStore({
    root,
    installationId: "installation-0123456789abcdef",
    defaultServiceBaseUrl: server,
  })
  const start = root => new LoopHostRuntime({
    store: makeStore(root),
    workspaces: {get: () => workspace},
    sessions: {get: () => undefined},
    actions,
    accountPrincipal: "",
  })
  const scenarios = [
    ["new user", async () => {}],
    ["logout", async root => {
      await makeStore(root).setActiveAccount("")
    }],
    ["server switch", async root => {
      await makeStore(root).setActiveAccount("", server)
    }],
    ["legacy upgrade", async root => {
      const path = join(root, "active-account.json")
      writeFileSync(path, `${JSON.stringify({version: 1, accountPrincipal: ""})}\n`, {mode: 0o600})
      chmodSync(path, 0o600)
    }],
  ]
  for (const [label, prepare] of scenarios) {
    const {root} = fixture()
    try {
      await prepare(root)
      for (let restart = 0; restart < 2; restart += 1) {
        const runtime = start(root)
        await runtime.waitForActions()
        assert.equal(runtime.accountPrincipal, "", label)
        const serverStatus = await runtime.globalServerStatus()
        assert.equal(serverStatus.serverUrl, server, label)
        assert.equal(typeof serverStatus.serverRevision, "string", label)
        assert.notEqual(serverStatus.serverRevision, "", label)
        assert.deepEqual(await runtime.globalPage({}), {
          url: `${server}/external-host/page-login#next=%2Fworkspaces`,
        }, label)
        const status = await runtime.status({
          workspaceId: WORKSPACE_ID,
          path: WORKSPACE,
          displayTitle: "tidb-release",
        })
        assert.equal(status.state, "needs_auth", label)
        assert.match(status.reason, /authorization is required/u, label)
      }
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  }
})

test("unsafe active account records remain fail closed", async () => {
  const {root, store} = fixture()
  const cases = [
    ["malformed JSON", "{not-json", /JSON/u],
    ["oversized record", JSON.stringify({version: 1, accountPrincipal: "a".repeat(2049)}), /oversized/u],
    ["wrong version", JSON.stringify({version: 2, accountPrincipal: ""}), /record is invalid/u],
    ["missing principal", JSON.stringify({version: 1}), /account principal is invalid/u],
    ["invalid nonempty principal", JSON.stringify({version: 1, accountPrincipal: "bad principal"}),
      /account principal is invalid/u],
  ]
  try {
    for (const [label, contents, expected] of cases) {
      writeFileSync(join(root, "active-account.json"), contents, {mode: 0o600})
      await assert.rejects(store.getActiveAccount(), expected, label)
    }
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("Agent commands resolve the executing Session to its inherited exact target", async () => {
  const {root, store} = fixture()
  try {
    let now = Date.parse("2026-11-07T00:00:00Z")
    const workspace = {
      id: WORKSPACE_ID,
      path: WORKSPACE,
      title: "tidb-release",
      sessionIds: ["session-new", "session-old"],
    }
    const sessions = new Map([
      ["session-new", {header: {createdAt: now + 5000}}],
      ["session-old", {header: {createdAt: now - 5000}}],
    ])
    const calls = []
    const actions = {
      async agentCatalog(input) {
        calls.push(["catalog", input])
        return {actions: ["task.get", "task.update"]}
      },
      async agentSchema(input) {
        calls.push(["schema", input])
        return {name: input.name, inputSchema: {type: "object"}}
      },
      async agentAction(input) {
        calls.push(["action", input])
        return {data: {id: "task-synthetic"}, metadata: {}}
      },
    }
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {get: id => id === WORKSPACE_ID ? workspace : undefined, list: () => [workspace]},
      sessions: {get: id => sessions.get(id)},
      actions,
      accountPrincipal: "account-one",
      now: () => now,
    })
    await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "tidb-release",
      expectedRevision: null,
      target: target(),
    })
    const boundContext = await runtime.agentCommand("session-new", {verb: "context", name: "", input: ""})
    assert.deepEqual(JSON.parse(boundContext.output).agent, {id: target().agentId, displayName: target().agentName})
    assert.equal(JSON.parse(boundContext.output).loopWorkspaceId, target().loopWorkspaceId)
    assert.equal(JSON.parse(boundContext.output).projectId, target().projectId)
    assert.equal(calls.length, 0)
    await assert.rejects(runtime.agentCommand("session-old", {verb:"context"}), /created before/)
    const listed = await runtime.agentCommand("session-new", {verb: "actions", name: "task."})
    assert.equal(listed.output, "task.get\ntask.update")
    const called = await runtime.agentCommand("session-new", {
      verb: "call",
      name: "task.get",
      input: '{"taskId":"task-synthetic"}',
    })
    assert.match(called.output, /task-synthetic/)
    actions.agentAction = async () => ({error: {code: "stale_version", message: "Skill version changed; select it again.", retryable: false}})
    const failed = await runtime.agentCommand("session-new", {verb: "call", name: "skill.content", input: '{}'})
    assert.equal(failed.failed, true)
    assert.match(failed.output, /Skill version changed; select it again/)
    for (const [verb, method] of [["actions", "agentCatalog"], ["schema", "agentSchema"]]) {
      const error = {code: "forbidden", message: "Channel management is not authorized", retryable: false,
        hint: "Review the channel manage permission", details: {actionId: "channel.agent-add"}}
      actions[method] = async () => ({error})
      const denied = await runtime.agentCommand("session-new", {verb, name: "channel.agent-add"})
      assert.equal(denied.failed, true)
      assert.deepEqual(JSON.parse(denied.output), {error})
    }
    assert.equal(calls[0][1].workspaceId, WORKSPACE_ID)
    assert.equal(calls[1][1].sessionId, "session-new")
    assert.equal(calls[0][1].accountPrincipal, "account-one")
    assert.equal(calls[1][1].accountPrincipal, "account-one")
    actions.agentCatalog = async () => ({actions: ["task.list"]})
    assert.equal((await runtime.agentCommand("session-old", {verb:"actions", name:"task."})).output, "task.list")
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("ordinary actions preserve server permissions without requiring upload authorization or creating a channel", async () => {
  const {root, store} = fixture()
  const workspace = {id: WORKSPACE_ID, path: WORKSPACE, title: "Current", sessionIds: ["session-one"]}
  const calls = []
  const runtime = new LoopHostRuntime({store, accountPrincipal: "account-one",
    workspaces: {list: () => [workspace], get: () => workspace},
    sessions: {get: () => ({header: {createdAt: 1}})},
  })
  runtime.actions = {
    async projectSyncCatalog() { calls.push("upload"); throw new Error("sync.upload denied") },
    async prepareProjectSync() { assert.fail("discovery must not create a channel") },
    async agentCatalog(input) { calls.push(input); return {actions: ["kb.catalog", "task.list"]} },
    async agentSchema(input) { calls.push(input); return {id: input.name, readOnly: input.name === "task.list", inputSchema: {type: "object"}, outputSchema: {type:"object", properties:{items:{type:"array"}}}} },
    async agentAction(input) { calls.push(input); return {data: {items: []}} },
  }
  runtime.serviceBaseUrl = "https://loop.example.test"
  runtime.loopWorkspaceId = "workspace-loop"
  try {
    assert.match((await runtime.agentCommand("session-one", {verb: "actions", name: ""})).output, /kb.catalog/)
    assert.equal(JSON.parse((await runtime.agentCommand("session-one", {verb: "schema", name: "task.list"})).output).id, "task.list")
    const compact = JSON.parse((await runtime.agentCommand("session-one", {verb:"schema", name:"task.list"})).output)
    assert.equal(compact.outputSchema, undefined)
    assert.match(compact.outputSchemaHint, /includeOutput/)
    const full = JSON.parse((await runtime.agentCommand("session-one", {verb:"schema", name:"task.list", input:'{"includeOutput":true}'})).output)
    assert.equal(full.outputSchema.type, "object")
    calls.splice(-2)
    assert.equal(calls.length, 2)
    assert.equal(calls[0].accountPrincipal, "account-one")
    assert.equal(await store.getBinding("account-one", WORKSPACE_ID, WORKSPACE, runtime.serviceBaseUrl), null)
    assert.deepEqual(JSON.parse((await runtime.agentCommand("session-one", {verb: "call", name: "task.list", input: "{}"})).output).data, {items: []})
    assert.equal(calls.length, 3, "invocation does not probe schema again or touch upload")
    assert.equal((await runtime.agentCommand("session-one", {verb: "call", name: "task.create", input: '{"channelId":"explicit-channel","title":"Requested work"}'})).failed, false)
    assert.equal(calls.at(-1).name, "task.create")
    assert.equal(await store.getBinding("account-one", WORKSPACE_ID, WORKSPACE, runtime.serviceBaseUrl), null)
    const denied = {error: {code: "forbidden", message: "Task writing is disabled", retryable: false}}
    runtime.actions.agentAction = async () => denied
    const result = await runtime.agentCommand("session-one", {verb: "call", name: "task.create", input: "{}"})
    assert.equal(result.failed, true)
    assert.deepEqual(JSON.parse(result.output), denied)
    await assert.rejects(runtime.withSessionContext("session-one", undefined, () => {}), /sync.upload denied/)
    await store.putBinding("account-one", {workspaceId: WORKSPACE_ID, workspacePath: WORKSPACE,
      workspaceTitle: "Previous", expectedRevision: null, target: target({loopServiceBaseUrl: "https://previous.example.test"})})
    await assert.rejects(runtime.agentCommand("session-one", {verb: "actions", name: ""}), /original Loop connection/)
    await assert.rejects(runtime.agentCommand("unknown-session", {verb: "actions", name: ""}), /registered Workspace/)
  } finally { rmSync(root, {recursive: true, force: true}) }
})

test("first Loop use prepares only the missing local workspace and preserves history upload preference", async () => {
  const {root, store} = fixture()
  const calls = []
  const workspace = {id: WORKSPACE_ID, path: WORKSPACE, title: "Current", sessionIds: ["session-old"]}
  const runtime = new LoopHostRuntime({store, accountPrincipal: "account-one",
    workspaces: {list: () => [workspace, {id: "unrelated", path: WORKSPACE, sessionIds: []}], get: () => workspace},
    sessions: {get: () => ({header: {createdAt: 1}})},
  })
  runtime.serviceBaseUrl = "https://loop.example.test"
  runtime.loopWorkspaceId = "workspace-loop"
  runtime.actions = {
    async projectSyncCatalog(input) {
      calls.push(["catalog", input])
      return {state: "active", accountPrincipal: "account-one", accountName: "User", workspaceId: "workspace-loop",
        workspaceName: "Workspace", agent: {agentId: AGENT_ID, displayName: "Assistant"}, projects: []}
    },
    async prepareProjectSync(input) {
      calls.push(["prepare", input])
      return {binding: target({placementKind: "channel_session", projectId: "", projectName: ""})}
    },
    async agentCatalog() { return {actions: ["task.get"]} },
    async agentSchema() { return {} },
    async agentAction() { return {data: {}} },
  }
  try {
    const before = await runtime.sessionContext({workspaceId: WORKSPACE_ID, sessionId: "session-old"})
    assert.equal(before.reason, "This Workspace has no Loop binding yet")
    const result = await runtime.agentCommand("session-old", {verb: "context"})
    assert.equal(JSON.parse(result.output).defaultChannelId, CHANNEL_ID)
    assert.equal(calls.length, 2)
    assert.equal(calls[0][1].background, true)
    assert.equal(calls[1][1].workspace.workspaceId, WORKSPACE_ID)
    assert.equal(calls[1][1].localWorkspace, true)
    assert.equal(await store.getBinding("account-one", "unrelated", WORKSPACE, runtime.serviceBaseUrl), null)
    assert.equal((await store.getSyncPreferences()).uploadDisconnectedHistory, false)
    await runtime.agentCommand("session-old", {verb: "actions"})
    assert.equal(calls.length, 2, "repeat use must reuse the exact mapping")
  } finally { rmSync(root, {recursive: true, force: true}) }
})

test("on-demand context recovery does not overwrite saved server bindings or create a mapping after authorization failure", async () => {
  for (const scenario of ["saved-server", "denied", "missing-session"]) {
    const {root, store} = fixture()
    const workspace = {id: WORKSPACE_ID, path: WORKSPACE, title: "Current", sessionIds: ["session-old"]}
    let prepared = 0
    const runtime = new LoopHostRuntime({store, accountPrincipal: "account-one",
      workspaces: {list: () => scenario === "missing-session" ? [] : [workspace], get: () => workspace},
      sessions: {get: () => ({header: {createdAt: 1}})},
    })
    runtime.serviceBaseUrl = "https://loop.example.test"
    runtime.loopWorkspaceId = "workspace-loop"
    runtime.actions = {
      async projectSyncCatalog() { return {state: "needs_auth", reason: "Workspace upload permission missing"} },
      async prepareProjectSync() { prepared += 1; throw new Error("must not prepare") },
    }
    try {
      if (scenario === "saved-server") await store.putBinding("account-one", {
        workspaceId: WORKSPACE_ID, workspacePath: WORKSPACE, workspaceTitle: "Previous",
        expectedRevision: null, target: target({loopServiceBaseUrl: "https://previous.example.test"}),
      })
      await assert.rejects(runtime.withSessionContext("session-old", undefined, () => {}),
        scenario === "saved-server" ? /original Loop connection/u : scenario === "denied" ? /upload permission missing/u : /registered Workspace/u)
      assert.equal(prepared, 0)
      assert.equal(await store.getBinding("account-one", WORKSPACE_ID, WORKSPACE, runtime.serviceBaseUrl), null)
    } finally { rmSync(root, {recursive: true, force: true}) }
  }
})

test("legacy Session and binding resolve only from their unique matching revision", async () => {
  const serverA = "https://loop-a.example.test"
  const serverB = "https://loop-b.example.test"
  const {root, store} = fixture({defaultServiceBaseUrl: serverA})
  try {
    const bindingA = await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "workspace-a",
      expectedRevision: null,
      target: target({loopServiceBaseUrl: serverA}),
    })
    const bindingB = await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "workspace-b",
      expectedRevision: null,
      target: target({
        loopServiceBaseUrl: serverB,
        projectId: "proj_server_b",
        projectName: "Server B",
      }),
    })
    await store.captureSession("account-one", {
      workspaceId: WORKSPACE_ID,
      sessionId: "session-legacy",
      sessionCreatedAt: Date.parse(bindingA.boundAt),
      binding: bindingA,
    })
    await store.setSessionSync("account-one", WORKSPACE_ID, "session-legacy", true)
    await store.captureSession("account-one", {
      workspaceId: WORKSPACE_ID,
      sessionId: "session-server-b",
      sessionCreatedAt: Date.parse(bindingB.boundAt),
      binding: bindingB,
    })
    await store.setSessionSync("account-one", WORKSPACE_ID, "session-server-b", true)
    await rewriteAccountState(root, state => {
      const legacyKey = Object.keys(state.bindings).find(key =>
        state.bindings[key].revision === bindingA.revision)
      // Historical sessions explicitly enabled for upload keep their recorded destinations.
      for (const binding of Object.values(state.bindings)) binding.defaultChannelId = CHANNEL_ID
      for (const session of Object.values(state.sessions)) session.defaultChannelId = CHANNEL_ID
      delete state.bindings[legacyKey].loopServiceBaseUrl
      delete state.sessions["session-legacy"].loopServiceBaseUrl
    })
    await store.setActiveAccount("account-one", serverB)

    assert.equal(
      (await store.getBinding("account-one", WORKSPACE_ID, WORKSPACE, serverA)).loopServiceBaseUrl,
      serverA,
    )
    assert.equal(
      (await store.getSessionByID("account-one", "session-legacy")).loopServiceBaseUrl,
      serverA,
    )
    assert.deepEqual(await store.workspaceRemovalPlan("account-one", WORKSPACE_ID, serverA), {
      found: true,
      hasRemainingBindings: false,
      sessionIds: ["session-legacy"],
    })
    const replayed = await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "workspace-a",
      expectedRevision: null,
      target: target({loopServiceBaseUrl: serverA}),
    })
    assert.equal(replayed.revision, bindingA.revision)
    assert.equal(replayed.loopServiceBaseUrl, serverA)

    let current = serverA
    const actions = {
      globalPageServiceBaseUrl: () => current,
      currentSyncProfile: () => current === serverA ? "sync-server-a" : "sync-server-b",
      async setServiceBaseUrl(url) {
        current = url
      },
      async probeGlobalPage(url) {
        return {url: `${url}/external-host/page-login#next=%2Fworkspaces`}
      },
    }
    const workspace = {id: WORKSPACE_ID, path: WORKSPACE, sessionIds: ["session-legacy"]}
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {get: () => workspace},
      sessions: {get: id => id === "session-legacy" ? {header: {createdAt: Date.now()}} : undefined},
      actions,
      accountPrincipal: "account-one",
      defaultServiceBaseUrl: serverA,
    })
    runtime.setAccountPrincipal("account-one")
    assert.deepEqual(await runtime.sessionSyncTarget("session-legacy"), {
      profile: "sync-server-a",
      pendingContext: {
        accountPrincipal: "account-one",
        loopWorkspaceId: "workspace-loop",
        agentId: AGENT_ID,
        projectId: "proj_0123456789abcdef",
        defaultChannelId: CHANNEL_ID,
      },
    })
    assert.equal((await runtime.sessionContext({
      workspaceId: WORKSPACE_ID,
      sessionId: "session-legacy",
    })).state, "inherited")

    await runtime.configureGlobalServer({serverUrl: serverB})
    assert.equal(await runtime.sessionSyncTarget("session-legacy"), null)
    assert.equal((await runtime.sessionContext({
      workspaceId: WORKSPACE_ID,
      sessionId: "session-legacy",
    })).state, "blocked")

    await runtime.configureGlobalServer({serverUrl: serverA})
    assert.deepEqual(await runtime.sessionSyncTarget("session-legacy"), {
      profile: "sync-server-a",
      pendingContext: {
        accountPrincipal: "account-one",
        loopWorkspaceId: "workspace-loop",
        agentId: AGENT_ID,
        projectId: "proj_0123456789abcdef",
        defaultChannelId: CHANNEL_ID,
      },
    })
    assert.equal((await runtime.sessionContext({
      workspaceId: WORKSPACE_ID,
      sessionId: "session-legacy",
    })).state, "inherited")
    await store.removeBinding(
      "account-one", WORKSPACE_ID, WORKSPACE, bindingA.revision, serverA,
    )
    assert.equal(await store.getSession("account-one", WORKSPACE_ID, "session-legacy"), null)
    assert.equal(
      (await store.getSession("account-one", WORKSPACE_ID, "session-server-b")).loopServiceBaseUrl,
      serverB,
    )
    assert.equal(
      (await store.getBinding("account-one", WORKSPACE_ID, WORKSPACE, serverB)).loopServiceBaseUrl,
      serverB,
    )
    await runtime.configureGlobalServer({serverUrl: serverB})
    assert.deepEqual(
      await runtime.sessionSyncTarget("session-server-b"),
      {
        profile: "sync-server-b",
        pendingContext: {
          accountPrincipal: "account-one",
          loopWorkspaceId: "workspace-loop",
          agentId: AGENT_ID,
          projectId: "proj_server_b",
          defaultChannelId: CHANNEL_ID,
        },
      },
    )
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("ambiguous legacy Session ownership fails closed instead of using the current server", async () => {
  const serverA = "https://loop-a.example.test"
  const serverB = "https://loop-b.example.test"
  const {root, store} = fixture({defaultServiceBaseUrl: serverA})
  try {
    const bindingA = await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "workspace-a",
      expectedRevision: null,
      target: target({loopServiceBaseUrl: serverA}),
    })
    const bindingB = await store.putBinding("account-one", {
      workspaceId: WORKSPACE_ID,
      workspacePath: WORKSPACE,
      workspaceTitle: "workspace-b",
      expectedRevision: null,
      target: target({loopServiceBaseUrl: serverB}),
    })
    await store.captureSession("account-one", {
      workspaceId: WORKSPACE_ID,
      sessionId: "session-legacy",
      sessionCreatedAt: Date.parse(bindingA.boundAt),
      binding: bindingA,
    })
    await store.setSessionSync("account-one", WORKSPACE_ID, "session-legacy", true)
    await rewriteAccountState(root, state => {
      const bindingKeyB = Object.keys(state.bindings).find(key =>
        state.bindings[key].revision === bindingB.revision)
      state.bindings[bindingKeyB].revision = bindingA.revision
      delete state.sessions["session-legacy"].loopServiceBaseUrl
    })

    assert.equal(
      (await store.getSessionByID("account-one", "session-legacy")).loopServiceBaseUrl,
      undefined,
    )
    const invalidated = []
    const helperInputs = []
    let attempts = 0
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {get: () => ({id: WORKSPACE_ID, path: WORKSPACE, sessionIds: ["session-legacy"]})},
      sessions: {get: id => id === "session-legacy" ? {header: {createdAt: Date.now()}} : undefined},
      actions: {
        currentSyncProfile: () => "sync-server-a",
        async unbind(input) {
          helperInputs.push(input)
          attempts += 1
          if (attempts === 1) throw new Error("temporary helper failure")
        },
      },
      accountPrincipal: "account-one",
      defaultServiceBaseUrl: serverA,
    })
    runtime.addSessionInvalidationListener(sessionIds => invalidated.push(sessionIds))
    assert.equal(await runtime.sessionSyncTarget("session-legacy"), null)
    assert.deepEqual(await store.workspaceRemovalPlan("account-one", WORKSPACE_ID, serverA), {
      found: true,
      hasRemainingBindings: false,
      sessionIds: ["session-legacy"],
    })
    const request = {
      workspaceId: WORKSPACE_ID,
      path: WORKSPACE,
      displayTitle: "workspace-a",
      expectedRevision: bindingA.revision,
    }
    await assert.rejects(runtime.unbind(request), /temporary helper failure/)
    assert.deepEqual(invalidated, [["session-legacy"]])
    assert.deepEqual(helperInputs[0].sessionIds, ["session-legacy"])
    assert.equal(
      (await store.getSessionByID("account-one", "session-legacy")).loopServiceBaseUrl,
      undefined,
    )
    assert.equal(await runtime.sessionSyncTarget("session-legacy"), null)

    await runtime.unbind(request)
    assert.deepEqual(invalidated, [["session-legacy"], ["session-legacy"]])
    assert.deepEqual(helperInputs[1].sessionIds, ["session-legacy"])
    assert.equal(await store.getSessionByID("account-one", "session-legacy"), null)
    assert.equal(await runtime.sessionSyncTarget("session-legacy"), null)
    assert.equal(
      (await store.getBinding("account-one", WORKSPACE_ID, WORKSPACE, serverB)).loopServiceBaseUrl,
      serverB,
    )
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("global server changes persist atomically and isolate bindings and Sessions", async () => {
  const {root, store} = fixture()
  const serverOne = "https://loop-one.example.test"
  const serverTwo = "https://loop-two.example.test"
  try {
    let current = serverOne
    let bindingProject = "proj_server_one"
    const changes = []
    const actions = {
      globalPageServiceBaseUrl: () => current,
      currentSyncProfile: () => current === serverOne ? "sync-server-one" : "sync-server-two",
      async setServiceBaseUrl(url) {
        current = url
        changes.push(url)
      },
      async probeGlobalPage(url) {
        return {url: `${url}/external-host/page-login#next=%2Fworkspaces`}
      },
      async beginBind() {
        return {
          state: "active",
          binding: target({
            loopServiceBaseUrl: current,
            projectId: bindingProject,
            projectName: bindingProject,
          }),
        }
      },
      async status() {
        return {state: "active"}
      },
    }
    const now = Date.now()
    const workspace = {
      id: WORKSPACE_ID,
      path: WORKSPACE,
      sessionIds: ["session-server-one", "session-server-two"],
    }
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {get: () => workspace},
      sessions: {get: id => id === "session-server-one"
        ? {header: {createdAt: now + 1000}}
        : id === "session-server-two"
        ? {header: {createdAt: now + 2000}}
        : undefined},
      actions,
      accountPrincipal: "account-one",
      defaultServiceBaseUrl: serverOne,
    })
    const syncProfiles = []
    runtime.addServerProfileListener(profile => syncProfiles.push(profile))
    assert.equal(await runtime.currentSyncProfile(), "sync-server-one")
    runtime.setAccountPrincipal("account-one")
    const ref = {workspaceId: WORKSPACE_ID, path: WORKSPACE, displayTitle: "tidb-release"}
    const first = await runtime.beginBind({...ref, mode: "bind"})
    assert.equal(first.binding.loop.serviceBaseUrl, serverOne)

    await runtime.captureSession(WORKSPACE_ID, "session-server-one")
    await rewriteAccountState(root, state => { state.sessions["session-server-one"].defaultChannelId = CHANNEL_ID })
    await store.setSessionSync("account-one", WORKSPACE_ID, "session-server-one", true)
    const configured = await runtime.configureGlobalServer({serverUrl: serverTwo})
    assert.equal(configured.serverUrl, serverTwo)
    assert.match(configured.serverRevision, /^rev-\d+$/u)
    assert.deepEqual(configured.page, {
      url: `${serverTwo}/external-host/page-login#next=%2Fworkspaces`,
    })
    assert.deepEqual(await runtime.globalServerStatus(), {
      serverUrl: serverTwo,
      serverRevision: configured.serverRevision,
      connection: {state: "unavailable"},
    })
    assert.deepEqual(changes, [serverOne, serverTwo])

    const changed = await runtime.status(ref)
    assert.equal(changed.state, "needs_auth")
    assert.match(changed.reason, /different Loop server/u)
    assert.equal((await runtime.sessionContext({
      workspaceId: WORKSPACE_ID,
      sessionId: "session-server-one",
    })).reason, "This Session keeps its original Loop server and project context")
    assert.equal(await runtime.sessionSyncEnabled("session-server-one"), false)
    assert.equal(await runtime.currentSyncProfile(), "sync-server-two")
    assert.deepEqual(syncProfiles, ["sync-server-one", "sync-server-two"])
    assert.equal(
      (await store.getBinding("account-one", WORKSPACE_ID, WORKSPACE, serverOne)).projectId,
      "proj_server_one",
    )

    runtime.setAccountPrincipal("account-one")
    bindingProject = "proj_server_two"
    const second = await runtime.beginBind({...ref, mode: "switch"})
    assert.equal(second.binding.loop.serviceBaseUrl, serverTwo)
    assert.equal(
      (await store.getBinding("account-one", WORKSPACE_ID, WORKSPACE, serverOne)).projectId,
      "proj_server_one",
    )
    assert.equal(
      (await store.getBinding("account-one", WORKSPACE_ID, WORKSPACE, serverTwo)).projectId,
      "proj_server_two",
    )
    await runtime.captureSession(WORKSPACE_ID, "session-server-two")
    await rewriteAccountState(root, state => { state.sessions["session-server-two"].defaultChannelId = CHANNEL_ID })
    await store.setSessionSync("account-one", WORKSPACE_ID, "session-server-two", true)
    assert.deepEqual(
      await runtime.sessionSyncTarget("session-server-two"),
      {
        profile: "sync-server-two",
        pendingContext: {
          accountPrincipal: "account-one",
          loopWorkspaceId: "workspace-loop",
          agentId: AGENT_ID,
          projectId: "proj_server_two",
          defaultChannelId: CHANNEL_ID,
        },
      },
    )

    await runtime.configureGlobalServer({serverUrl: serverOne})
    assert.equal(await runtime.currentSyncProfile(), "sync-server-one")
    assert.deepEqual(
      await runtime.sessionSyncTarget("session-server-one"),
      {
        profile: "sync-server-one",
        pendingContext: {
          accountPrincipal: "account-one",
          loopWorkspaceId: "workspace-loop",
          agentId: AGENT_ID,
          projectId: "proj_server_one",
          defaultChannelId: CHANNEL_ID,
        },
      },
    )
    assert.equal(await runtime.sessionSyncEnabled("session-server-two"), false)
    assert.deepEqual(changes, [serverOne, serverTwo, serverOne])
    assert.deepEqual(syncProfiles, [
      "sync-server-one",
      "sync-server-two",
      "sync-server-one",
    ])

    const restarted = new BindingStore({
      root,
      installationId: "installation-0123456789abcdef",
      defaultServiceBaseUrl: serverOne,
    })
    assert.equal(await restarted.getGlobalServer(), serverOne)
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("failed server probe leaves the prior server and binding unchanged", async () => {
  const {root, store} = fixture()
  const serverOne = "https://loop-one.example.test"
  try {
    let current = serverOne
    const actions = {
      globalPageServiceBaseUrl: () => current,
      async setServiceBaseUrl(url) { current = url },
      async beginBind() {
        return {
          state: "active",
          binding: target({loopServiceBaseUrl: current}),
        }
      },
      async probeGlobalPage() {
        const error = new Error("probe failed")
        error.code = "loop-host/backend-unavailable"
        throw error
      },
    }
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {get: () => ({id: WORKSPACE_ID, path: WORKSPACE, sessionIds: []})},
      sessions: {get: () => undefined},
      actions,
      accountPrincipal: "account-one",
      defaultServiceBaseUrl: serverOne,
    })
    await runtime.beginBind({
      workspaceId: WORKSPACE_ID,
      path: WORKSPACE,
      displayTitle: "tidb-release",
      mode: "bind",
    })
    await assert.rejects(
      runtime.configureGlobalServer({serverUrl: "https://loop-two.example.test"}),
      error => error?.code === "loop-host/backend-unavailable",
    )
    assert.equal((await runtime.globalServerStatus()).serverUrl, serverOne)
    assert.equal(current, serverOne)
    assert.equal(
      (await store.getBinding("account-one", WORKSPACE_ID, WORKSPACE, serverOne)).projectId,
      PROJECT_ID,
    )
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("failed helper cutover rolls the persisted server back atomically", async () => {
  const {root, store} = fixture()
  const serverOne = "https://loop-one.example.test"
  try {
    let current = serverOne
    let workspace = "wsp_one"
    await store.setLoopWorkspaceForServer(serverOne, workspace)
    const actions = {
      globalPageServiceBaseUrl: () => current,
      currentLoopWorkspaceId: () => workspace,
      async setServiceBaseUrl(url) {
        if (url === "https://loop-two.example.test") throw new Error("helper cutover failed")
        current = url
      },
      async probeGlobalPage(url) {
        return {url: `${url}/external-host/page-login#next=%2Fworkspaces`}
      },
    }
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {get: () => undefined},
      sessions: {get: () => undefined},
      actions,
      defaultServiceBaseUrl: serverOne,
    })
    const before = await runtime.globalServerStatus()
    const beforeWorkspace = await runtime.globalServerWorkspaceStatus()
    await assert.rejects(
      runtime.configureGlobalServer({serverUrl: "https://loop-two.example.test"}),
      /helper cutover failed/,
    )
    assert.deepEqual(await runtime.globalServerStatus(), before)
    assert.deepEqual(await runtime.globalServerWorkspaceStatus(), beforeWorkspace)
    assert.equal(current, serverOne)
    assert.equal(workspace, "wsp_one")
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

test("server cutover serializes concurrent binding and Agent actions", async () => {
  const {root, store} = fixture()
  const serverOne = "https://loop-one.example.test"
  const serverTwo = "https://loop-two.example.test"
  try {
    let current = serverOne
    let bindingCalls = 0
    let projectCalls = 0
    const actionServers = []
    let releaseProbe
    let startedProbe
    const probeStarted = new Promise(resolve => { startedProbe = resolve })
    const actions = {
      globalPageServiceBaseUrl: () => current,
      async setServiceBaseUrl(url) { current = url },
      probeGlobalPage(url) {
        startedProbe()
        return new Promise(resolve => {
          releaseProbe = () => resolve({
            url: `${url}/external-host/page-login#next=%2Fworkspaces`,
          })
        })
      },
      async beginBind() {
        bindingCalls += 1
        actionServers.push(current)
        return {state: "active", binding: target({loopServiceBaseUrl: current})}
      },
      async createProject() {
        projectCalls += 1
        actionServers.push(current)
        return {
          workspaceId: "workspace-loop",
          workspaceName: "QA",
          projectId: PROJECT_ID,
          projectName: "QA Project",
          defaultChannelId: CHANNEL_ID,
          role: "owner",
        }
      },
    }
    const runtime = new LoopHostRuntime({
      store,
      workspaces: {get: () => ({id: WORKSPACE_ID, path: WORKSPACE, sessionIds: []})},
      sessions: {get: () => undefined},
      actions,
      accountPrincipal: "account-one",
      defaultServiceBaseUrl: serverOne,
    })
    const ref = {workspaceId: WORKSPACE_ID, path: WORKSPACE, displayTitle: "tidb-release"}
    const switching = runtime.configureGlobalServer({serverUrl: serverTwo})
    await probeStarted
    const binding = runtime.beginBind({...ref, mode: "bind"}).then(
      value => ({ok: true, value}),
      error => ({ok: false, error}),
    )
    const project = runtime.createProject({
      ...ref,
      challengeId: "challenge-one",
      name: "QA Project",
      prefix: "QA",
    }).then(
      value => ({ok: true, value}),
      error => ({ok: false, error}),
    )
    await new Promise(resolve => setTimeout(resolve, 20))
    assert.equal(bindingCalls, 0)
    assert.equal(projectCalls, 0)
    releaseProbe()
    await switching
    assert.equal((await binding).ok, false)
    assert.equal((await project).ok, false)
    assert.equal(current, serverTwo)
    assert.equal(bindingCalls, 1)
    assert.equal(projectCalls, 0)
    assert.deepEqual(actionServers, [serverTwo])
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})

async function accountFilename(account) {
  const {createHash} = await import("node:crypto")
  return createHash("sha256").update(account).digest("hex")
}

async function rewriteAccountState(root, mutate) {
  const accountPath = join(root, `account-${await accountFilename("account-one")}.json`)
  const state = JSON.parse(readFileSync(accountPath, "utf8"))
  mutate(state)
  writeFileSync(accountPath, `${JSON.stringify(state)}\n`)
  chmodSync(accountPath, 0o600)
}

test('OAuth completion publishes the selected workspace and account before page or catalog loading', async () => {
  const {root, store} = fixture({defaultServiceBaseUrl: 'https://loop.example.test'})
  try {
    await store.init()
    const identities = []
    const actions = {
      currentLoopWorkspaceId: () => '',
      setAccountPrincipal: value => identities.push(value),
      setServiceBaseUrl: async () => {},
      connectAccount: async () => ({state: 'connected', accountPrincipal: 'account-oauth', workspaceId: 'workspace-oauth'}),
      globalPage: async () => { throw new Error('page loading must not delay login') },
    }
    const runtime = new LoopHostRuntime({store, actions, defaultServiceBaseUrl: 'https://loop.example.test'})
    await runtime.waitForActions()
    runtime.scheduleProjectSync = () => {}
    const result = await runtime.connectAccount({expectedServerRevision: runtime.serverRevision})
    assert.equal(result.state, 'connected')
    assert.equal(runtime.loopWorkspaceId, 'workspace-oauth')
    assert.equal(await store.getActiveAccount('https://loop.example.test'), 'account-oauth')
    assert.equal(identities.at(-1), 'account-oauth')
  } finally { rmSync(root, {recursive: true, force: true}) }
})


test("upload history preference is local, defaults off and survives restart", async () => {
  const {root, store} = fixture()
  try {
    assert.deepEqual(await store.getSyncPreferences(), {uploadDisconnectedHistory: false})
    await store.setSyncPreferences({uploadDisconnectedHistory: true})
    const reopened = new BindingStore({root})
    assert.deepEqual(await reopened.getSyncPreferences(), {uploadDisconnectedHistory: true})
    await reopened.setSyncPreferences({uploadDisconnectedHistory: false})
    assert.deepEqual(await store.getSyncPreferences(), {uploadDisconnectedHistory: false})
    await assert.rejects(store.setSyncPreferences({uploadDisconnectedHistory: "true"}), /invalid/)
  } finally { rmSync(root, {recursive: true, force: true}) }
})


test("damaged upload preferences default off without disabling unrelated Host actions", async () => {
  const {root, store} = fixture()
  try {
    await store.init()
    writeFileSync(join(root, "sync-preferences.json"), "{")
    const runtime = new LoopHostRuntime({store, actions: {currentSyncProfile: () => "local-test"}})
    await runtime.waitForActions()
    assert.equal(await runtime.currentSyncProfile(), "local-test")
    assert.equal(runtime.syncCapturePolicy().uploadDisconnectedHistory, false)
    await assert.rejects(runtime.getSyncPreferences(), /JSON/)
    await runtime.setSyncPreferences({uploadDisconnectedHistory: true})
    assert.equal((await runtime.getSyncPreferences()).uploadDisconnectedHistory, true)
  } finally { rmSync(root, {recursive: true, force: true}) }
})

test("empty exact action discovery diagnoses permissions without inventing login expiry or writing", async () => {
  const {root, store} = fixture()
  const workspace = {id: WORKSPACE_ID, path: WORKSPACE, title: "Current", sessionIds: ["session-one"]}
  const runtime = new LoopHostRuntime({store, accountPrincipal: "account-one", workspaces: {list: () => [workspace], get: () => workspace}, sessions: {get: () => ({header: {createdAt: 1}})}})
  runtime.serviceBaseUrl = "https://loop.example.test"
  runtime.loopWorkspaceId = "workspace-loop"
  const calls = []
  let code = "action_not_granted"
  runtime.actions = {
    async agentCatalog() { return {actions: []} },
    async agentSchema(input) { calls.push(input); return {error: {code, message: "Exact server diagnosis", hint: "Server recovery hint"}} },
    async agentAction() { assert.fail("discovery must never write") },
  }
  try {
    const denied = await runtime.agentCommand("session-one", {verb: "actions", name: "channel.agent-add"})
    assert.equal(denied.failed, true)
    const result = JSON.parse(denied.output)
    assert.equal(result.error.code, "action_not_granted")
    assert.equal(result.error.hint, "Server recovery hint")
    assert.equal(result.recovery, undefined)
    code = "unknown_action"
    const missing = JSON.parse((await runtime.agentCommand("session-one", {verb: "actions", name: "channel.agent-add"})).output)
    assert.equal(missing.error.code, "unknown_action")
    assert.equal(missing.recovery, undefined)
    const prefix = JSON.parse((await runtime.agentCommand("session-one", {verb: "actions", name: "channel."})).output)
    assert.deepEqual(prefix.actions, [])
    assert.match(prefix.hint, /does not prove/u)
    assert.equal(calls.length, 2)

    const inputSchema = {type: "object", required: ["channelId", "memberId"]}
    runtime.actions.agentSchema = async () => ({
      error: {code: "unknown_action"},
      delegation: {action: "channel.human-member-add", inputSchema},
    })
    for (const verb of ["schema", "actions"]) {
      const descriptor = await runtime.agentCommand("session-one", {verb, name: "channel.human-member-add"}, undefined, true)
      assert.equal(descriptor.failed, false)
      const published = JSON.parse(descriptor.output)
      assert.equal(published.id, "channel.human-member-add")
      assert.equal(published.requiresHumanAuthorization, true)
      assert.deepEqual(published.inputSchema, inputSchema)
      assert.equal(published.error, undefined)
    }

    const implicit = {verb: "call", name: "example.action", input: "{}", implicitEmptyInput: true}
    for (const descriptor of [{readOnly:false, inputSchema:{type:"object"}}, {readOnly:true, inputSchema}]) {
      runtime.actions.agentSchema = async () => descriptor
      assert.equal((await runtime.agentCommand("session-one", implicit)).failed, true)
    }
    runtime.actions.agentSchema = async () => ({readOnly:true, inputSchema:{type:"object"}})
    runtime.actions.agentAction = async input => {
      assert.deepEqual(input.arguments, {})
      return {data:{items:[]}}
    }
    assert.equal((await runtime.agentCommand("session-one", implicit)).failed, false)

    runtime.loopWorkspaceId = "ws_one"
    for (const [name, data, path] of [
      ["kb.doc-read", {kbId: "kb_a", documentId: "doc_b"}, "/kb/kb_a/documents/doc_b"],
      ["task.get", {detail: {task: {channelRef: "chn_a", taskNumber: 2}}}, "/inbox/tasks/chn_a/2"],
      ["dashboard.update", {dashboard: {id: "dsh_a"}}, "/dashboards/dsh_a"],
      ["message.thread-create", {threadChannelId: "chn_b"}, "/inbox/thread/chn_b"],
      ["drive.head", {node: {driveId: "drv_a", id: "obj_b"}}, "/drives/drv_a/files/obj_b"],
      ["kb.doc-read", {kbId: "kb_a/../outside", documentId: "doc_b"}, null],
      ["kb.doc-delete", {kbId: "kb_a", documentId: "doc_b"}, null],
    ]) {
      runtime.actions.agentAction = async () => ({data: {data}})
      const receipt = await runtime.agentCommand("session-one", {verb: "call", name, input: "{}"})
      assert.equal(JSON.parse(receipt.output).webUrl, path ? "https://loop.example.test/w/ws_one" + path : undefined)
    }
  } finally { rmSync(root, {recursive: true, force: true}) }
})
