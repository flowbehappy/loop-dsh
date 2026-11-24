import assert from "node:assert/strict"
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import test from "node:test"
import {fileURLToPath} from "node:url"
import {Context} from "@deepseek-ai/cordis"
import {SkillRegistry} from "@deepseek-ai/dsh-skill"
import {SystemPrompt, renderPrompt} from "@deepseek-ai/dsh-system-prompt"

import {registerHarnessIdentity, registerHarnessSkill} from "../managed-skill.mjs"

test("official prompt assembly includes the assistant role before Skill loading and removes it on disposal", async () => {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  try {
    const before = renderPrompt(await ctx.systemPrompt.assemble())
    const dispose = registerHarnessIdentity(ctx)
    const assembly = await ctx.systemPrompt.assemble()
    const prompt = renderPrompt(assembly)
    assert.ok(prompt.includes(before.trim()))
    assert.match(prompt, /personal assistant \(Super Agent\)/u)
    assert.match(prompt, /connected assistant.s permissions/u)
    assert.match(prompt, /never inspect local credentials/u)
    assert.deepEqual(assembly.contexts, [])
    assert.deepEqual(assembly.tools, [])
    dispose()
    assert.equal(renderPrompt(await ctx.systemPrompt.assemble()), before)
  } finally {
    await ctx.fiber.dispose()
  }
})

test("native registry discovers one short entry in a fresh workspace and loads the body on demand", async () => {
  const f = fixture()
  const ctx = new Context()
  const fiber = ctx.plugin(SkillRegistry)
  await fiber
  try {
    const source = fileURLToPath(new URL("../../../skills/loop-proxy-harness/SKILL.md", import.meta.url))
    const dispose = registerHarnessSkill(ctx, source)
    const options = {cwd: f.workspace}
    const snapshot = await ctx.skills.snapshot(options)
    assert.equal(snapshot.complete, true)
    assert.equal(snapshot.skills.length, 1)
    const summary = snapshot.skills[0]
    assert.equal(summary.name, "loop-proxy-harness")
    assert.ok(summary.description.length < 240)
    assert.equal(summary.content, undefined)
    assert.equal(summary.invocation.modelInvocable, true)
    assert.equal(existsSync(join(f.workspace, ".agents")), false)
    const loaded = await ctx.skills.get(summary.name, options)
    assert.ok(loaded.content.length > summary.description.length)
    assert.ok(!loaded.content.includes("# Loop memory and files"))
    assert.equal((await ctx.skills.snapshot({cwd: join(f.root, "another-workspace")})).skills.length, 1)
    dispose()
    assert.deepEqual((await ctx.skills.snapshot(options)).skills, [])
  } finally {
    await fiber.dispose()
    await ctx.fiber.dispose()
    rmSync(f.root, {recursive: true, force: true})
  }
})

test("official DSH skill consumer publishes only the Loop summary before loading its guides", async () => {
  const {apply} = await import("@deepseek-ai/dsh-tool-skill")
  const f = fixture()
  const ctx = new Context()
  await ctx.plugin(SkillRegistry)
  try {
    const source = fileURLToPath(new URL("../../../skills/loop-proxy-harness/SKILL.md", import.meta.url))
    registerHarnessSkill(ctx, source)
    const body = readFileSync(source, "utf8").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, "").trim()
    const listeners = []
    let tool
    apply({
      skills: ctx.skills,
      workingDirectory: {ensure: async () => f.workspace},
      tools: {register(definition) { tool = definition }, get() { return tool }},
      on(name, listener) { if (name === "agent/pre-step") listeners.push(listener) },
    })
    const agent = {session: {id: "plain-chat", seq: 0, surface: {nodes: []}}}
    const input = {agent, messages: [], signal: new AbortController().signal}
    let next = async () => ({kind: "enter", messages: []})
    for (const listener of listeners.toReversed()) {
      const following = next
      next = () => listener(input, following)
    }
    const decision = await next()
    const catalog = decision.messages.find(message => message.source.kind === "skill-catalog")
    assert.deepEqual(catalog.source.entries.map(item => item.name), ["loop-proxy-harness"])
    assert.equal(JSON.stringify(catalog).includes(JSON.stringify(body).slice(1, -1)), false)
    assert.equal(JSON.stringify(catalog).includes("loop-proxy guide"), false)
    const loaded = await tool.execute({name: "loop-proxy-harness"}, input)
    assert.ok(loaded.content.includes(body))
    assert.ok(loaded.content.includes("loop-proxy guide agents"))
    assert.ok(loaded.content.includes("loop-proxy guide authorization"))
    assert.ok(!loaded.content.includes("human-apps authorize"))
    assert.equal(loaded.content.includes("# Loop agents and delegation"), false)
  } finally {
    await ctx.fiber.dispose()
    rmSync(f.root, {recursive: true, force: true})
  }
})


function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "loop-managed-skill-test-")))
  const workspace = join(root, "workspace")
  mkdirSync(workspace)
  return {root, workspace}
}
