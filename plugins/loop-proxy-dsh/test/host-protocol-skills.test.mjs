import assert from "node:assert/strict"
import test from "node:test"

import {
  validateSkillCatalog,
  validateSkillContent,
} from "../host-protocol.mjs"
import remote from "../remote.mjs"

test("Skill catalog protocol accepts only bounded read requests", () => {
  assert.deepEqual(validateSkillCatalog({
    workspaceId: "wsp_local",
    sessionId: "session_1",
    query: "",
    cursor: "cursor_1",
    limit: 50,
  }), {
    workspaceId: "wsp_local",
    sessionId: "session_1",
    query: "",
    cursor: "cursor_1",
    limit: 50,
  })
  assert.throws(() => validateSkillCatalog({
    workspaceId: "wsp_local",
    sessionId: "session_1",
    limit: 51,
  }), /limit/u)
  assert.throws(() => validateSkillCatalog({
    workspaceId: "wsp_local",
    sessionId: "session_1",
    execute: true,
  }), /unknown field/u)
})

test("Skill content protocol requires exact-version continuations", () => {
  assert.deepEqual(validateSkillContent({
    workspaceId: "wsp_local",
    sessionId: "session_1",
    skillId: "skl_1",
    path: "review/SKILL.md",
    expectedVersionId: "ctv_1",
    offset: 10,
    maxBytes: 32768,
  }), {
    workspaceId: "wsp_local",
    sessionId: "session_1",
    skillId: "skl_1",
    path: "review/SKILL.md",
    expectedVersionId: "ctv_1",
    offset: 10,
    maxBytes: 32768,
  })
  assert.throws(() => validateSkillContent({
    workspaceId: "wsp_local",
    sessionId: "session_1",
    skillId: "skl_1",
    path: "review/SKILL.md",
    offset: 10,
  }), /requires an exact version/u)
  assert.throws(() => validateSkillContent({
    workspaceId: "wsp_local",
    sessionId: "session_1",
    skillId: "skl_1",
    path: "review/SKILL.md",
    expectedVersionId: "ctv_1",
    expectedCommitSha: "abc",
  }), /mutually exclusive/u)
})

test("Host Remote publishes dedicated catalog, content, and event methods", () => {
  for (const method of [
    "loopHost/skillCatalog",
    "loopHost/skillContent",
    "loopHost/skillCatalogEvents",
  ]) {
    assert.ok(remote.methods[method], `${method} must be declared`)
  }
  assert.equal(remote.methods["loopHost/skillCatalogEvents"].mode, "stream")
})
