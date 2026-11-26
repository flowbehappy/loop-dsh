import {readFile} from "node:fs/promises"
import {readFileSync} from "node:fs"
import {dirname, join} from "node:path"
import {fileURLToPath} from "node:url"

const HARNESS_SKILL = "loop-proxy-harness"
const SKILL = "SKILL.md"
const packageRoot = dirname(fileURLToPath(import.meta.url))
const packagedSkillPath = join(packageRoot, "skills", HARNESS_SKILL, SKILL)
const GUIDE_TOPICS = ["directory", "authorization", "agents", "tasks", "messages", "knowledge", "resources", "workflows", "recovery"]

// A small, static role survives Skill discovery without injecting account data
// or collaboration history. The Host remains the authority for actual access.
export function registerHarnessIdentity(ctx) {
  return ctx.systemPrompt.section({
    name: "loop-personal-assistant",
    order: 100,
    text: [
      "You are the user's personal assistant (Super Agent). Complete and verify the requested work using the connected assistant's permissions.",
      "Loop workspace Agents and Humans are independent of local DSH subagents; each directory covers its own system.",
      "Discover Loop capabilities with the virtual Bash command `loop-proxy actions`; it also exposes Host collaboration tools. The loop-proxy-harness skill provides usage details.",
      "References identify resources or collaborators; discovery and references do not authorize actions. Choose operations from the user's request and the public tool contracts.",
      "Access Loop through the plugin; never inspect local credentials or use them to call other endpoints.",
    ].join(" "),
  })
}

// The native registry publishes only name/description. Instructions stay in the
// packaged Skill and are loaded by DSH's existing skill tool, in every workspace.
export function registerHarnessSkill(ctx, sourcePath = packagedSkillPath) {
  const source = readFileSync(sourcePath, "utf8")
  const match = /^---\r?\nname: loop-proxy-harness\r?\ndescription: ([^\r\n]+)\r?\n---\r?\n([\s\S]+)$/u.exec(source)
  if (match === null) throw new Error("Invalid packaged Loop Harness Skill")
  return ctx.skills.register({
    name: HARNESS_SKILL,
    description: match[1].startsWith('"') ? JSON.parse(match[1]) : match[1],
    content: match[2].trim(),
    source: "bundled",
    resourceBase: {kind: "opaque", description: "Load topic instructions with the virtual loop-proxy guide command."},
  })
}

// Local packaged instructions only: no account lookup, catalog fetch, or
// caller-controlled filesystem path. Project-installed Skills use this too.
export async function readHarnessGuide(topic, sourcePath = packagedSkillPath) {
  if (!GUIDE_TOPICS.includes(topic)) {
    throw new Error(`Unknown Loop guide. Choose: ${GUIDE_TOPICS.join(", ")}`)
  }
  return await readFile(join(dirname(sourcePath), "references", `${topic}.md`), "utf8")
}
