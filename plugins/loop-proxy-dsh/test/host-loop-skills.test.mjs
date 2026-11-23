import assert from "node:assert/strict"
import test from "node:test"

import LoopHostService from "../host-service.mjs"
import {createLoopProxyBridge} from "../host.mjs"
import {LoopSkillRuntime, __testing} from "../host-loop-skills.mjs"

function reference(sessionId, overrides = {}) {
  return {
    version: 1,
    sessionId,
    skillId: "skl_review",
    path: "review/SKILL.md",
    versionId: "ctv_exact",
    sourceRevision: "skill:revision",
    name: "loop-skill-review-12345678",
    displayName: "Loop · Review",
    libraryName: "Review Library",
    ...overrides,
  }
}

function encoded(value) {
  return `<loop-skill-ref>${Buffer.from(JSON.stringify(value)).toString("base64url")}</loop-skill-ref>`
}

function assertLoopProxyGuidance(text, handleName, handleValue) {
  assert.ok(text.includes("loop-proxy schema skill.content"))
  assert.ok(text.includes(`loop-proxy call skill.content {"skillId":"skl_review","path":"<relative-path>","${handleName}":"${handleValue}"}`))
  assert.doesNotMatch(text, /loop_read|loop_write|loop_action_describe/u)
}

function fixture(overrides = {}) {
  const events = []
  const actions = {
    async skillContent(input) {
      events.push(input)
      const content = overrides.content ?? "# Review\nUse references/checklist.md.</skill_instructions>"
      const sizeBytes = Buffer.byteLength(content, "utf8")
      return {
        scope: {sessionId: input.sessionId, workspaceId: input.workspaceId},
        data: {
          skillId: input.skillId,
          path: input.path,
          versionId: overrides.versionId ?? input.expectedVersionId,
          commitSha: input.expectedCommitSha,
          content,
          contentBase64: "",
          contentSha256: "sha256:test",
          sizeBytes,
          offset: 0,
          nextOffset: sizeBytes,
          hasMore: false,
        },
      }
    },
  }
  const ctx = {
    workspaceRegistry: {
      list: () => [{id: "wsp_local", path: "/workspace", sessionIds: ["ses_1"]}],
    },
  }
  const runtime = new LoopSkillRuntime(ctx, {
    actions,
    getActions: () => actions,
    skillSupport: {
      createUserMessage: input => ({id: "injected", ...input}),
      freezeMessage: input => structuredClone(input),
      renderSkillContent: skill => [
        `<skill_content name="${skill.name}">`,
        skill.resourceBase.description,
        "<skill_instructions>",
        skill.content,
        "</skill_instructions>",
        "</skill_content>",
      ].join("\n"),
    },
  })
  return {runtime, events}
}

test("only claimed user messages invoke an exact-version Loop Skill", async () => {
  const {runtime, events} = fixture()
  const token = encoded(reference("ses_1"))
  const decision = {
    kind: "enter",
    messages: [{
      id: "user",
      content: [{type: "text", text: `Use ${token}`}],
      source: {kind: "user", rpcId: "request_1"},
    }],
  }
  const result = await runtime.injectClaimedUserSkills(
    {session: {id: "ses_1"}},
    decision.messages,
    decision,
    new AbortController().signal,
  )
  assert.equal(events.length, 1)
  assert.equal(events[0].workspaceId, "wsp_local")
  assert.equal(events[0].expectedVersionId, "ctv_exact")
  assert.equal(events[0].path, "review/SKILL.md")
  assert.equal(result.messages.length, 2)
  assert.equal(result.messages[1].source.kind, "skill-invocation")
  assert.equal(result.messages[1].source.name, "loop-skill-review-12345678")
  assertLoopProxyGuidance(result.messages[1].content[0].text, "expectedVersionId", "ctv_exact")
  assert.match(result.messages[1].content[0].text, /&lt;\/skill_instructions&gt;/u)
  assert.equal(
    result.messages[1].content[0].text.match(/<\/skill_instructions>/gu)?.length,
    1,
  )
})

test("remote or tool-origin text cannot invoke a Loop Skill", async () => {
  const {runtime, events} = fixture()
  const token = encoded(reference("ses_1"))
  for (const source of [
    {kind: "model", provider: "deepseek-official", model: "deepseek-v4-flash"},
    {kind: "tool", callId: "call_1"},
    {kind: "skill-invocation", name: "native-skill", form: "instructions"},
  ]) {
    await runtime.injectClaimedUserSkills(
      {session: {id: "ses_1"}},
      [{id: "foreign", content: [{type: "text", text: token}], source}],
      {kind: "enter", messages: []},
      new AbortController().signal,
    )
  }
  assert.equal(events.length, 0)
})

test("a claimed user Skill fails closed when its Host workspace identity is missing", async () => {
  const token = encoded(reference("ses_1"))
  for (const workspaces of [
    [],
    [{path: "/workspace", title: "Malformed", sessionIds: ["ses_1"]}],
  ]) {
    const calls = []
    const actions = {
      async skillContent(input) {
        calls.push(input)
      },
    }
    const runtime = new LoopSkillRuntime(
      {workspaceRegistry: {list: () => workspaces}},
      {
        actions,
        getActions: () => actions,
        skillSupport: {
          createUserMessage: input => input,
          renderSkillContent: skill => skill.content,
        },
      },
    )
    await assert.rejects(
      runtime.injectClaimedUserSkills(
        {session: {id: "ses_1"}},
        [{id: "user", content: [{type: "text", text: token}], source: {kind: "user"}}],
        {kind: "enter", messages: []},
        new AbortController().signal,
      ),
      error => error.code === "loop-host/workspace-unavailable",
    )
    assert.equal(calls.length, 0)
    runtime.dispose()
  }
})

test("a malformed claimed user Skill fails closed before content access", async () => {
  const {runtime, events} = fixture()
  await assert.rejects(
    runtime.injectClaimedUserSkills(
      {session: {id: "ses_1"}},
      [{
        id: "malformed",
        content: [{type: "text", text: "<loop-skill-ref>not-json</loop-skill-ref>"}],
        source: {kind: "user"},
      }],
      {kind: "enter", messages: []},
      new AbortController().signal,
    ),
    error => error.code === "loop-skill/invalid-reference",
  )
  assert.equal(events.length, 0)
})

test("an exact-version mismatch fails closed before injection", async () => {
  const {runtime} = fixture({versionId: "ctv_other"})
  const token = encoded(reference("ses_1", {versionId: "ctv_new"}))
  await assert.rejects(
    runtime.injectClaimedUserSkills(
      {session: {id: "ses_1"}},
      [{id: "user", content: [{type: "text", text: token}], source: {kind: "user"}}],
      {kind: "enter", messages: []},
      new AbortController().signal,
    ),
    error => error.code === "loop-skill/binding-stale",
  )
})

test("multi-chunk Skill instructions keep one exact version and are injected once", async () => {
  const calls = []
  const actions = {
    async skillContent(input) {
      calls.push(input)
      if (input.offset === undefined) {
        return {
          scope: {sessionId: input.sessionId, workspaceId: input.workspaceId},
          data: {
            skillId: input.skillId,
            path: input.path,
            versionId: "ctv_exact",
            content: "first ",
            contentBase64: Buffer.from("first ").toString("base64"),
            contentSha256: "sha256:first",
            sizeBytes: 12,
            offset: 0,
            nextOffset: 6,
            hasMore: true,
          },
        }
      }
      return {
        scope: {sessionId: input.sessionId, workspaceId: input.workspaceId},
        data: {
          skillId: input.skillId,
          path: input.path,
          versionId: "ctv_exact",
          content: "",
          contentBase64: Buffer.from("second").toString("base64"),
          contentSha256: "sha256:second",
          sizeBytes: 12,
          offset: 6,
          nextOffset: 12,
          hasMore: false,
        },
      }
    },
  }
  const ctx = {workspaceRegistry: {list: () => [{id: "wsp_local", sessionIds: ["ses_1"]}]}}
  const runtime = new LoopSkillRuntime(ctx, {
    actions,
    getActions: () => actions,
    skillSupport: {
      createUserMessage: input => input,
      renderSkillContent: skill => skill.content,
    },
  })
  const token = encoded(reference("ses_1"))
  const result = await runtime.injectClaimedUserSkills(
    {session: {id: "ses_1"}},
    [{content: [{type: "text", text: token}], source: {kind: "user"}}],
    {kind: "enter", messages: []},
    new AbortController().signal,
  )
  assert.equal(calls.length, 2)
  assert.equal(calls[1].offset, 6)
  assert.equal(calls[1].expectedVersionId, "ctv_exact")
  assert.equal(result.messages[0].content[0].text, "first second")
  const repeated = await runtime.injectClaimedUserSkills(
    {session: {id: "ses_1"}},
    [{content: [{type: "text", text: token}], source: {kind: "user"}}],
    {kind: "enter", messages: []},
    new AbortController().signal,
  )
  assert.equal(calls.length, 2)
  assert.equal(repeated.messages.length, 0)
})

test("multi-chunk UTF-8 instructions decode after raw-byte assembly", async () => {
  const original = `${"a".repeat(32767)}中end`
  const bytes = Buffer.from(original, "utf8")
  const chunks = [bytes.subarray(0, 32768), bytes.subarray(32768)]
  let index = 0
  const calls = []
  const actions = {
    async skillContent(input) {
      calls.push(input)
      const offset = input.offset ?? 0
      const chunk = chunks[index++]
      return {
        data: {
          skillId: "skl_review",
          path: "review/SKILL.md",
          versionId: "ctv_exact",
          sizeBytes: bytes.length,
          offset,
          content: "",
          contentBase64: chunk.toString("base64"),
          nextOffset: offset + chunk.length,
          hasMore: index < chunks.length,
        },
      }
    },
  }
  const ctx = {workspaceRegistry: {list: () => [{id: "wsp_local", sessionIds: ["ses_1"]}]}}
  const runtime = new LoopSkillRuntime(ctx, {
    actions,
    getActions: () => actions,
    skillSupport: {
      createUserMessage: input => input,
      renderSkillContent: skill => skill.content,
    },
  })
  const token = encoded(reference("ses_1"))
  const result = await runtime.injectClaimedUserSkills(
    {session: {id: "ses_1"}},
    [{id: "utf8", content: [{type: "text", text: token}], source: {kind: "user"}}],
    {kind: "enter", messages: []},
    new AbortController().signal,
  )
  assert.deepEqual(calls.map(call => call.offset ?? 0), [0, 32768])
  assert.equal(result.messages[0].content[0].text, original)
  assert.equal((result.messages[0].content[0].text.match(/�/gu) ?? []).length, 0)
})

test("legacy pre-step accepts the exact git version when the wire response omits commitSha", async () => {
  const calls = []
  const actions = {
    async skillContent(input) {
      calls.push(input)
      return {
        data: {
          skillId: input.skillId,
          path: input.path,
          versionId: "git:abc123",
          content: "# Legacy",
          contentBase64: "",
          contentSha256: "sha256:legacy",
          sizeBytes: 8,
          offset: 0,
          nextOffset: 8,
          hasMore: false,
        },
      }
    },
  }
  const runtime = new LoopSkillRuntime(
    {workspaceRegistry: {list: () => [{id: "wsp_local", sessionIds: ["ses_1"]}]}},
    {
      actions,
      getActions: () => actions,
      skillSupport: {
        createUserMessage: input => input,
        renderSkillContent: skill => `${skill.resourceBase.description}\n${skill.content}`,
      },
    },
  )
  const result = await runtime.injectClaimedUserSkills(
    {session: {id: "ses_1"}},
    [{
      id: "legacy",
      source: {kind: "user"},
      content: [{type: "text", text: encoded(reference("ses_1", {
        versionId: "git:abc123",
        commitSha: "abc123",
      }))}],
    }],
    {kind: "enter", messages: []},
    new AbortController().signal,
  )
  assert.equal(calls.length, 1)
  assert.equal(calls[0].expectedCommitSha, "abc123")
  assert.equal(calls[0].expectedVersionId, undefined)
  assert.equal(result.messages[0].source.kind, "skill-invocation")
  assertLoopProxyGuidance(result.messages[0].content[0].text, "expectedCommitSha", "abc123")
  runtime.dispose()
})

test("legacy version-only drafts normalize to the same commit handle", async () => {
  const calls = []
  const actions = {
    async skillContent(input) {
      calls.push(input)
      return {
        data: {
          skillId: input.skillId,
          path: input.path,
          versionId: "git:abc123",
          content: "abc",
          contentBase64: Buffer.from("abc").toString("base64"),
          sizeBytes: 3,
          offset: 0,
          nextOffset: 3,
          hasMore: false,
        },
      }
    },
  }
  const runtime = new LoopSkillRuntime(
    {workspaceRegistry: {list: () => [{id: "wsp_local", sessionIds: ["ses_1"]}]}},
    {
      actions,
      getActions: () => actions,
      skillSupport: {
        createUserMessage: input => input,
        renderSkillContent: skill => skill.content,
      },
    },
  )
  await runtime.injectClaimedUserSkills(
    {session: {id: "ses_1"}},
    [{
      id: "legacy-version-only",
      source: {kind: "user"},
      content: [{type: "text", text: encoded(reference("ses_1", {versionId: "git:abc123"}))}],
    }],
    {kind: "enter", messages: []},
    new AbortController().signal,
  )
  assert.equal(calls[0].expectedCommitSha, "abc123")
  assert.equal(calls[0].expectedVersionId, undefined)
  runtime.dispose()
})

test("legacy pre-step rejects mismatched handles and unsupported paths with stable codes", async () => {
  const runtime = new LoopSkillRuntime(
    {workspaceRegistry: {list: () => [{id: "wsp_local", sessionIds: ["ses_1"]}]}},
    {
      actions: {skillContent: async () => ({data: {}})},
      getActions: () => ({skillContent: async () => ({data: {}})}),
      skillSupport: {
        createUserMessage: input => input,
        renderSkillContent: skill => skill.content,
      },
    },
  )
  await assert.rejects(
    runtime.injectClaimedUserSkills(
      {session: {id: "ses_1"}},
      [{
        id: "mismatch",
        source: {kind: "user"},
        content: [{type: "text", text: encoded(reference("ses_1", {
          versionId: "ctv_native",
          commitSha: "abc123",
        }))}],
      }],
      {kind: "enter", messages: []},
      new AbortController().signal,
    ),
    error => error.code === "loop-skill/invalid-version-handle",
  )
  await assert.rejects(
    runtime.injectClaimedUserSkills(
      {session: {id: "ses_1"}},
      [{
        id: "path",
        source: {kind: "user"},
        content: [{type: "text", text: encoded(reference("ses_1", {path: "../SKILL.md"}))}],
      }],
      {kind: "enter", messages: []},
      new AbortController().signal,
    ),
    error => error.code === "loop-skill/unsupported-path",
  )
  runtime.dispose()
})

test("legacy git projection must match the requested commit exactly", async () => {
  const actions = {
    async skillContent(input) {
      return {
        data: {
          skillId: input.skillId,
          path: input.path,
          versionId: "git:different",
          commitSha: "",
          content: "abc",
          contentBase64: Buffer.from("abc").toString("base64"),
          sizeBytes: 3,
          offset: 0,
          nextOffset: 3,
          hasMore: false,
        },
      }
    },
  }
  const runtime = new LoopSkillRuntime(
    {workspaceRegistry: {list: () => [{id: "wsp_local", sessionIds: ["ses_1"]}]}},
    {
      actions,
      getActions: () => actions,
      skillSupport: {
        createUserMessage: input => input,
        renderSkillContent: skill => skill.content,
      },
    },
  )
  await assert.rejects(
    runtime.injectClaimedUserSkills(
      {session: {id: "ses_1"}},
      [{
        id: "stale",
        source: {kind: "user"},
        content: [{type: "text", text: encoded(reference("ses_1", {
          versionId: "git:abc123",
          commitSha: "abc123",
        }))}],
      }],
      {kind: "enter", messages: []},
      new AbortController().signal,
    ),
    error => error.code === "loop-skill/binding-stale",
  )
  runtime.dispose()
})

test("reference parser is bounded to the exact Session and linked identity", () => {
  const token = encoded(reference("ses_1"))
  const refs = __testing.claimedLoopSkillReferences(
    [{content: [{type: "text", text: token}], source: {kind: "user"}}],
    "ses_1",
  )
  assert.equal(refs.length, 1)
  assert.deepEqual(
    __testing.claimedLoopSkillReferences(
      [{content: [{type: "text", text: token}], source: {kind: "user"}}],
      "ses_other",
    ),
    [],
  )
})

test("Host event keeps durable identity and uses a separate local order marker", () => {
  const runtime = new LoopSkillRuntime(
    {workspaceRegistry: {list: () => []}},
    {actions: undefined, getActions: () => undefined},
  )
  runtime.acceptActionEvent({
    scope: {
      installationId: "ins_1",
      accountPrincipal: "usr_1",
      serviceBaseUrl: "https://loop.test",
      workspaceId: "wsp_loop",
      hostWorkspaceId: "wsp_local",
      bindingRevision: "binding:1",
      projectId: "prj_1",
      agentId: "agt_1",
      identityFingerprint: "scope:1",
    },
    event: {
      eventId: "skcevt_1",
      eventSeq: 41,
      kind: "catalog.changed",
      occurredAt: "2026-11-09T00:00:00Z",
    },
  })
  assert.equal(runtime.history.length, 1)
  assert.equal(runtime.history[0].eventId, "skcevt_1")
  assert.equal(runtime.history[0].durableEventSeq, 41)
  assert.equal(runtime.history[0].localSequence, 1)
  assert.equal(runtime.history[0].identityFingerprint, "scope:1")
  runtime.dispose()
})

test("Host stream isolates by Host workspace while retaining the Loop workspace identity", async () => {
  const runtime = new LoopSkillRuntime(
    {workspaceRegistry: {list: () => []}},
    {actions: undefined, getActions: () => undefined},
  )
  const scope = hostWorkspaceId => ({
    installationId: "ins_1",
    accountPrincipal: "usr_1",
    serviceBaseUrl: "https://loop.test",
    workspaceId: "wsp_loop",
    hostWorkspaceId,
    bindingRevision: "binding:1",
    projectId: "prj_1",
    agentId: "agt_1",
    identityFingerprint: "scope:1",
  })
  runtime.acceptActionEvent({
    scope: scope("wsp_other"),
    event: {eventId: "shared-directory-event", eventSeq: 2, kind: "catalog.changed"},
  })
  runtime.acceptActionEvent({
    scope: scope("wsp_local"),
    event: {eventId: "shared-directory-event", eventSeq: 2, kind: "directory.changed"},
  })
  const controller = new AbortController()
  const frames = runtime.stream(
    {workspaceId: "wsp_local", sessionId: "ses_1"},
    controller.signal,
  )
  const first = await frames.next()
  assert.equal(first.value.type, "change")
  assert.equal(first.value.event.eventId, "shared-directory-event")
  assert.equal(first.value.event.workspaceId, "wsp_loop")
  assert.equal(first.value.event.hostWorkspaceId, "wsp_local")
  controller.abort()
  runtime.dispose()
})

test("Host stream requires a snapshot rebuild after bounded history overflow", async () => {
  const runtime = new LoopSkillRuntime(
    {workspaceRegistry: {list: () => []}},
    {actions: undefined, getActions: () => undefined},
  )
  for (let index = 0; index < 65; index += 1) {
    runtime.acceptActionEvent({
      scope: {
        installationId: "ins_1",
        accountPrincipal: "usr_1",
        serviceBaseUrl: "https://loop.test",
        workspaceId: "wsp_loop",
        hostWorkspaceId: "wsp_local",
        identityFingerprint: "scope:1",
      },
      event: {eventId: `event-${index}`, eventSeq: index + 1, kind: "catalog.changed"},
    })
  }
  const controller = new AbortController()
  let ready
  for await (const frame of runtime.stream(
    {workspaceId: "wsp_local", sessionId: "ses_1"},
    controller.signal,
  )) {
    if (frame.type === "ready") {
      ready = frame
      break
    }
  }
  assert.equal(ready?.subscription.snapshotRequired, true)
  controller.abort()
  runtime.dispose()
})


test("pre-step explains exact-version failure in chat and permits a fresh selection", async () => {
  const {runtime} = fixture({versionId: "ctv_new"})
  let preStep
  runtime.ctx.on = (event, handler) => { preStep = handler }
  runtime.installPreStep()
  const message = {id: "old-selection", source: {kind: "user"}, content: [{type: "text", text: encoded(reference("ses_1"))}]}
  const decision = {kind: "enter", messages: [message]}
  const result = await preStep({agent: {session: {id: "ses_1"}}, messages: [message], signal: new AbortController().signal}, async () => decision)
  assert.equal(result.kind, "enter")
  assert.equal(result.messages[0], message)
  const text = result.messages[1].content[0].text
  assert.match(text, /selected Loop Skill version changed/)
  assert.match(text, /reopen \/ and select/)
  assert.doesNotMatch(text, /# Review/)
  const fresh = {...message, id: "new-selection", content: [{type: "text", text: encoded(reference("ses_1", {versionId: "ctv_new"}))}]}
  const recovered = await preStep({agent: {session: {id: "ses_1"}}, messages: [fresh], signal: new AbortController().signal}, async () => ({kind: "enter", messages: [fresh]}))
  assert.match(recovered.messages[1].content[0].text, /# Review/)
  const cancelled = new AbortController()
  cancelled.abort()
  await assert.rejects(preStep({agent: {session: {id: "ses_1"}}, messages: [message], signal: cancelled.signal}, async () => decision), {name: "AbortError"})
  runtime.dispose()
})

test("catalog reads work independently of the optional changes stream", async () => {
  const {runtime} = fixture()
  const result = {data: {items: []}}
  runtime.getActions = () => ({
    skillCatalogWatch: () => { throw new Error("watch unavailable") },
    skillCatalog: async () => result,
    knowledgeCatalog: async () => result,
  })
  const request = {workspaceId: "wsp_local", sessionId: "ses_1"}
  assert.equal(await runtime.catalog(request), result)
  assert.equal(await runtime.knowledgeCatalog(request), result)
  runtime.dispose()
})

test("Loop Wiki 你看看里边有什么东西。 forwards browsing and preserves Loop's access decisions", async () => {
  const sessionId = "session-11111111-2222-3333-4444-555555555555"
  const original = "你看看里边有什么东西。"
  const token = Buffer.from(JSON.stringify({version: 1, sessionId, kbId: "kb_wiki", name: "Loop Wiki"})).toString("base64url")
  const message = {id: "user-wiki", source: {kind: "user"}, content: [{type: "text", text: `<loop-knowledge-ref>${token}</loop-knowledge-ref> ${original}`}]}
  const {runtime: skills} = fixture()
  const agent = {session: {id: sessionId}}
  const decision = await skills.injectClaimedUserKnowledge(agent, [message], {kind: "enter", messages: [message]})
  assert.equal(decision.messages[0].content[0].text, `Loop · Loop Wiki ${original}`)

  const guidance = decision.messages[1].content[0].text
  assert.match(guidance, /kb\.doc-list/)
  assert.match(guidance, /kb\.list/)
  const forwarded = []
  let accessRevoked = false
  const service = {
    skills,
    agentCommand: LoopHostService.prototype.agentCommand,
    checkAssignee: LoopHostService.prototype.checkAssignee,
    checkChannelRead: LoopHostService.prototype.checkChannelRead,
    channelReads: new WeakMap(),
    canUseAgentActions: () => true,
    humanTasks: {current: () => message, canOffer: () => false},
    runtime: {async agentCommand(id, command) {
      assert.equal(id, sessionId)
      const args = JSON.parse(command.input)
      forwarded.push([command.name, args])
      return accessRevoked
        ? {failed: true, output: "resource_not_granted"}
        : {failed: false, output: "Loop result"}
    }},
  }
  const bridge = createLoopProxyBridge({on: () => () => {}, get: () => service})
  const cases = [
    ["kb.doc-list", {kbId: "kb_wiki", limit: 50}],
    ["kb.list", {kbIds: ["kb_wiki"]}],
    ["kb.file-list", {sourceRef: "src_hosted"}],
    ["kb.repo-tree", {sourceRef: "src_git"}],
    ["kb.doc-read", {documentId: "doc_a"}],
    ["kb.evidence", {evidenceRef: "server-reference"}],
    ["kb.doc-list", {kbId: "kb_another_authorized"}],
    ["skill.catalog", {}],
    ["project.list", {}],
  ]
  for (const [name, args] of cases) {
    const result = await bridge.execute({agent, name: "bash", signal: new AbortController().signal,
      arguments: {command: `loop-proxy call ${name} ${JSON.stringify(args)}`}}, () => assert.fail("unexpected shell call"))
    assert.equal(result.value.stdout.text, "Loop result")
    assert.equal(result.value.exitCode, 0)
  }
  accessRevoked = true
  const denied = await bridge.execute({agent, name: "bash", signal: new AbortController().signal,
    arguments: {command: 'loop-proxy call kb.doc-list {"kbId":"kb_wiki","limit":50}'}}, () => assert.fail("unexpected shell call"))
  assert.equal(denied.value.stdout.text, "resource_not_granted")
  assert.equal(denied.value.exitCode, 1)
  assert.deepEqual(forwarded, [...cases, cases[0]])
  bridge.dispose()
  skills.dispose()
})

function knowledgeMessage(id = "user-kb", kbId = "kb_1", overrides = {}) {
  const token = `<loop-knowledge-ref>${Buffer.from(JSON.stringify({version:1, sessionId:"ses_1", kbId, name:"Runbooks", ...overrides})).toString("base64url")}</loop-knowledge-ref>`
  return {id, role:"user", source:{kind:"user", rpcId:`rpc-${id}`, timezone:"Asia/Shanghai"}, content:[{type:"text",text:`${token} Find the order.`}]}
}
test("knowledge admission separates display and context, preserving message identity and other blocks", async () => {
  const {runtime} = fixture()
  const message = knowledgeMessage()
  message.content.push({type:"image",url:"data:image/png;base64,AA=="}, {type:"text",text:"End."})
  const original = structuredClone(message)
  const decision = {kind:"enter",startsRequestSeries:true,messages:[message]}
  const result = await runtime.injectClaimedUserKnowledge({session:{id:"ses_1"}},[message],decision)
  assert.equal(result.startsRequestSeries,true)
  assert.equal(result.messages[0].id,message.id)
  assert.deepEqual(result.messages[0].source,message.source)
  assert.equal(result.messages[0].content[0].text,"Loop · Runbooks Find the order.")
  assert.deepEqual(result.messages[0].content.slice(1),message.content.slice(1))
  assert.deepEqual(message,original)
  assert.deepEqual(result.messages[1].source.loopKnowledge,{version:1,sessionId:"ses_1",userMessageId:message.id,kbIds:["kb_1"],blocked:false})
  assert.equal(result.messages.filter(m => m.source.kind === "user").length,1)
  assert.doesNotMatch(JSON.stringify(result.messages), /loop-knowledge-ref/)
  // Only messages actually admitted by downstream hooks may be transformed.
  assert.deepEqual(await runtime.injectClaimedUserKnowledge({session:{id:"ses_1"}},[message],{kind:"enter",messages:[]}),{kind:"enter",messages:[]})
})

test("queued knowledge references keep their message identities, including after a cancelled admission", async () => {
  const {runtime} = fixture()
  const agent = {session: {id: "ses_1"}}
  const first = knowledgeMessage("first", "kb_first")
  const second = knowledgeMessage("second", "kb_second")
  second.content.push(...knowledgeMessage("extra", "kb_third").content)
  const messages = [first, second]
  const decision = {kind: "enter", messages}
  await assert.rejects(runtime.injectClaimedUserKnowledge(agent, messages, decision, AbortSignal.abort()), {name: "AbortError"})
  const result = await runtime.injectClaimedUserKnowledge(agent, messages, decision)
  assert.deepEqual(result.messages.slice(2).map(({source: {loopKnowledge}}) => [loopKnowledge.userMessageId, loopKnowledge.kbIds]), [
    ["first", ["kb_first"]], ["second", ["kb_second", "kb_third"]],
  ])
  assert.equal(await runtime.injectClaimedUserKnowledge(agent, result.messages, result), result)
  const ordinary = {id: "next", source: {kind: "user"}, content: [{type: "text", text: "Hello"}]}
  const next = {kind: "enter", messages: [ordinary]}
  assert.equal(await runtime.injectClaimedUserKnowledge(agent, [ordinary], next), next)
})

test("invalid, cross-session and excessive references fail closed with readable errors", async () => {
  for (const overrides of [{sessionId:"other"},{kbId:""},{version:2},{name:""}]) {
    const {runtime} = fixture()
    const message = knowledgeMessage("invalid","kb_1",overrides)
    const agent = {session:{id:"ses_1"}}
    const result = await runtime.injectClaimedUserKnowledge(agent,[message],{kind:"enter",messages:[message]})
    assert.equal(result.messages[0].content[0].text,"Loop · 知识库（引用无效） Find the order.")
    assert.equal(result.messages[1].source.loopKnowledge.blocked,true)
    assert.deepEqual(result.messages[1].source.loopKnowledge.kbIds, [])
  }
  const {runtime} = fixture()
  const message = knowledgeMessage()
  message.content = Array.from({length:33},(_,i)=>knowledgeMessage("x",`kb_${i}`).content[0])
  const result = await runtime.injectClaimedUserKnowledge({session:{id:"ses_1"}},[message],{kind:"enter",messages:[message]})
  assert.equal(result.messages.at(-1).source.loopKnowledge.blocked,true)
})

test('an incomplete channel name admits only a scoped retry for its directory match',()=>{
  const message = {}, channelReads = new WeakMap(), service = {channelReads}
  const check = (action,args)=>LoopHostService.prototype.checkChannelRead.call(service,message,{verb:'call',name:action,input:JSON.stringify(args)})
  const candidate = {channelId:'chn_north',slug:'#north-team',displayName:'North Team (Monday)'}
  channelReads.set(message,{pending:true})
  assert.throws(()=>check('message.history',{target:candidate.slug}),/pending/)
  channelReads.set(message,{candidate,reason:'Incomplete name'})
  assert.equal(check('message.search',{target:candidate.slug,query:'meeting'}),candidate)
  assert.equal(check('message.history',{channelName:candidate.displayName}),candidate)
  for (const [action,args] of [['message.search',{}],['message.search',{target:'#elsewhere'}],
       ['message.get',{target:candidate.slug,messageId:'other'}],['message.history',{target:candidate.slug,channelName:'wrong'}]]) {
    assert.throws(()=>check(action,args),/before reading another channel/)
  }
  channelReads.set(message,{reason:'The user declined.'})
  assert.throws(()=>check('message.search',{target:candidate.slug}),/declined/)
})
