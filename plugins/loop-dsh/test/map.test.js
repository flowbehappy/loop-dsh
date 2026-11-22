import assert from "node:assert/strict"
import test from "node:test"

import {
  loopWorkRequestID,
  mapSessionTelemetryRecord,
  parseLoopWorkRequestID,
  safeResourceRefs,
} from "../lib/map.js"
import { sessionInWorkspace } from "../lib/scope.js"
import { bridgeSessionLabel } from "../lib/label.js"

function record(type, body, seq = 1) {
  return {
    channel: "ledger",
    sourceEvent: {
      sessionId: "session-1",
      envelope: { type, seq },
    },
    attributes: {
      "event.type": type,
      "event.seq": seq,
      "session.id": "session-1",
      "session.format_version": 4,
    },
    time: 1700000000000,
    body,
  }
}

test("maps direct Human and Agent visible text without reasoning", () => {
  const human = mapSessionTelemetryRecord(
    record("user/message", {
      id: "message-human",
      source: { kind: "user", rpcId: "rpc-1" },
      content: [{ type: "text", text: "Visible request" }],
    })
  )
  assert.deepEqual(human, {
    event: {
      sourceEventId: "dsh:session-1:4:1",
      sourceThreadId: "session-1",
      sourceItemId: "message-human",
      kind: "human_message",
      state: "completed",
      content: "Visible request",
      provenance: "host_observed",
      completedAt: "2023-11-14T22:13:20.000Z",
    },
    flush: false,
  })
  const cliHuman = mapSessionTelemetryRecord(
    record("user/message", {
      id: "message-cli",
      source: { kind: "user" },
      content: [{ type: "text", text: "Headless request" }],
    })
  )
  assert.equal(cliHuman.event.kind, "human_message")
  assert.equal(cliHuman.event.content, "Headless request")

  const agent = mapSessionTelemetryRecord(
    record("assistant/message", {
      turn: 1,
      message: {
        id: "message-agent",
        content: [
          { type: "reasoning", text: "private reasoning" },
          { type: "text", text: "Visible answer" },
        ],
      },
    })
  )
  assert.equal(agent.event.content, "Visible answer")
  assert.doesNotMatch(agent.event.content, /private reasoning/)
})

test("captures safe metadata for tool lifecycle without arguments or results", () => {
  const started = mapSessionTelemetryRecord(
    record("tool/call", {
      turn: 1,
      callId: "call-1",
      name: "mcp__loop__loop_write",
      arguments: JSON.stringify({
        taskId: "tsk_abcd1234",
        token: "must-not-leak",
        path: "/private/path",
      }),
    })
  )
  assert.equal(started.event.kind, "tool_started")
  assert.deepEqual(started.event.resourceRefs, [
    { kind: "task", id: "tsk_abcd1234" },
  ])
  assert.doesNotMatch(JSON.stringify(started), /must-not-leak|private\/path/)

  const failed = mapSessionTelemetryRecord(
    record("tool/result", {
      turn: 1,
      message: { toolCallId: "call-1", isError: true },
      error: { reason: "private provider reason" },
      meta: { channelId: "chn_abcd1234" },
    })
  )
  assert.equal(failed.event.state, "failed")
  assert.deepEqual(failed.event.resourceRefs, [
    { kind: "channel", id: "chn_abcd1234" },
  ])
  assert.doesNotMatch(JSON.stringify(failed), /private provider reason/)
})

test("drops injected user context and treats turn completion as a flush hint", () => {
  assert.deepEqual(
    mapSessionTelemetryRecord(
      record("user/message", {
        id: "context",
        source: { kind: "agent-instructions" },
        content: [{ type: "text", text: "ignore" }],
      })
    ),
    { event: null, flush: false }
  )
  assert.deepEqual(
    mapSessionTelemetryRecord(
      record("turn/end", { turn: 1, reason: { kind: "completed" } })
    ),
    { event: null, flush: true }
  )
  assert.deepEqual(
    mapSessionTelemetryRecord(
      record("user/message", {
        id: "zero-sequence",
        source: { kind: "user" },
        content: [{ type: "text", text: "must not poison the bridge" }],
      }, 0)
    ),
    { event: null, flush: false }
  )
  const missingTime = record("assistant/message", {
    turn: 1,
    message: {
      id: "missing-time",
      content: [{ type: "text", text: "stable replay" }],
    },
  })
  delete missingTime.time
  assert.equal(
    Object.hasOwn(mapSessionTelemetryRecord(missingTime).event, "completedAt"),
    false
  )
  missingTime.time = 1e20
  assert.equal(
    Object.hasOwn(mapSessionTelemetryRecord(missingTime).event, "completedAt"),
    false
  )
})

test("resource extraction is bounded and deduplicated", () => {
  assert.deepEqual(
    safeResourceRefs({
      nested: [
        { taskId: "tsk_abcd1234" },
        { taskId: "tsk_abcd1234", channelId: "chn_abcd1234" },
      ],
      invalid: "not-a-resource",
    }),
    [
      { kind: "channel", id: "chn_abcd1234" },
      { kind: "task", id: "tsk_abcd1234" },
    ]
  )
})

test("capture is limited to the explicit DSH workspace root", () => {
  assert.equal(
    sessionInWorkspace(
      { header: { cwd: "/tmp/dsh-workspace" } },
      "/tmp/dsh-workspace"
    ),
    true
  )
  assert.equal(
    sessionInWorkspace(
      { header: { cwd: "/tmp/unrelated" } },
      "/tmp/dsh-workspace"
    ),
    false
  )
  assert.equal(sessionInWorkspace({}, "/tmp/dsh-workspace"), false)
})

test("private conversation labels are stable and unique per DSH session", () => {
  const first = bridgeSessionLabel("DeepSeek Harness", "session-a")
  assert.equal(first, bridgeSessionLabel("DeepSeek Harness", "session-a"))
  assert.notEqual(first, bridgeSessionLabel("DeepSeek Harness", "session-b"))
  assert.match(first, /^DeepSeek Harness [0-9a-f]{16}$/)
})

test("Loop work request ids are stable, bounded, and parse without credentials", () => {
  const requestID = loopWorkRequestID("extin_abc", "claim-123")
  assert.match(requestID, /^loop-work:[A-Za-z0-9_-]+$/)
  assert.deepEqual(parseLoopWorkRequestID(requestID), {
    itemID: "extin_abc",
    claimID: "claim-123",
    requestID,
  })
  assert.equal(parseLoopWorkRequestID("ordinary-request-id"), null)
  assert.equal(parseLoopWorkRequestID("loop-work:not-json"), null)
})
