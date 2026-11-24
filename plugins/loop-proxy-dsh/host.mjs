// Loaded inside the trusted DSH tools runtime, before the command reaches a shell.
import {toolErrorText} from "./tool-errors.mjs"
import {readHarnessGuide} from "./managed-skill.mjs"

export const name = "loop-proxy-dsh"
export const inject = ["tools"]

const SESSION = /^session-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const COMMAND = /^loop-proxy (?:(human|human-apps) )?(context|guide|actions|schema|call|authorize)(?: ([A-Za-z0-9_.:-]{1,200}))?(?: (\{[\s\S]*\}|'\{[\s\S]*\}'))?$/
const MAX_INPUT = 1 << 20
const CALL_TIMEOUT_MS = 125_000

export function parseCommand(command, onInvalid = () => {}) {
  const reject = (message, hint) => { onInvalid({message, hint}); return null }
  if (typeof command !== "string") return reject("command must be a string.", "Pass one literal loop-proxy command.")
  if (Buffer.byteLength(command) > MAX_INPUT + 512) return reject("command exceeds the 1 MiB input limit.", "Reduce the request size.")
  const match = COMMAND.exec(command)
  if (!match || match[0] !== command) return reject("Invalid loop-proxy command syntax.", "Use context, guide <topic>, actions [prefix], schema <actionId>, or call <actionId> <JSON object>. Send separate commands as separate tool calls; shell chaining and pipes are not supported.")
  const [, mode, verb, name = "", encodedInput = ""] = match
  if (mode && (verb === "context" || verb === "guide")) return reject("Human mode supports actions, schema, and call only.", `Use loop-proxy ${mode} actions.`)
  const principal = mode ? {principal: "human", connection: mode === "human-apps" ? "apps" : "business"} : {}
  // A matched outer quote pair is transport syntax, never shell evaluation.
  const input = encodedInput.startsWith("'") ? encodedInput.slice(1, -1) : encodedInput
  if (verb === "context") return name || input ? reject("context takes no arguments.", "Use loop-proxy context.") : {verb, name, input}
  if (verb === "authorize" && !mode) return reject("Task authorization requires explicit Human mode.", "Use the Agent connection for normal work.")
  if (verb !== "actions" && !name) return reject(`${verb} requires a name.`, `Use loop-proxy ${verb} <${verb === "guide" ? "topic" : "actionId"}>${verb === "call" ? " <JSON object>" : ""}.`)
  if (verb === "call" && !mode && !input) return {verb, name, input: "{}", implicitEmptyInput: true}
  if (verb !== "schema" && (["call", "authorize"].includes(verb)) !== Boolean(input)) return reject(verb === "call" ? "call requires one JSON argument object." : `${verb} does not accept JSON arguments.`, verb === "call" ? `Read loop-proxy schema ${name}, then pass its parameters as one JSON object.` : `Use loop-proxy ${verb} ${name}.`)
  if (input) {
    if (Buffer.byteLength(input) > MAX_INPUT) return reject("JSON arguments exceed 1 MiB.", "Reduce the request size.")
    try {
      const parsed = JSON.parse(input)
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return reject("Arguments must be a JSON object.", "Use an object with the action's named parameters.")
      if (verb === "schema" && (Object.keys(parsed).some(key => key !== "includeOutput") || (parsed.includeOutput !== undefined && typeof parsed.includeOutput !== "boolean"))) return reject("schema accepts only includeOutput: boolean.", 'Use loop-proxy schema <actionId> {"includeOutput":true} only when the output definition is needed.')
    } catch (error) {
      // Do not echo request content into diagnostics; offsets are sufficient.
      const position = /position (\d+)/u.exec(String(error.message))?.[1]
      return reject(`Invalid JSON arguments${position ? ` at character ${position}` : ""}.`, "Use valid JSON: double-quoted fields and strings, escaped quotes/newlines, and no trailing commas. Do not shell-escape field quotes. No request was sent.")
    }
  }
  return {verb, name, input, ...principal}
}

export function createLoopProxyBridge(ctx, options = {}) {
  if (!ctx || typeof ctx.on !== "function") throw new Error("DSH tools context is unavailable")
  const unavailableOutput = options.unavailableOutput ?? "Sign in to Loop to use this connection"
  let disposed = false
  const disposers = []

  const execute = async (exec, next) => {
    const args = exec?.arguments
    if (typeof args?.command !== "string" || !args.command.trimStart().startsWith("loop-proxy")) return next()

    // Every command in this namespace is consumed here. Invalid syntax and
    // unknown sessions never fall through to a shell.
    const result = {failed: true, output: "Invalid Loop Proxy command or session"}
    let commandError
    const parsed = parseCommand(args.command, error => { commandError = error })
    const sessionID = exec?.agent?.session?.id
    const sessionValid = typeof sessionID === "string" && SESSION.test(sessionID)
    // Some model adapters fill every optional Bash field. Accept neutral
    // defaults without ever evaluating a shell or changing Host authority.
    const executionIsPlain =
      (!args.workdir || args.workdir === exec?.agent?.session?.header?.cwd) &&
      !args.run_in_background &&
      (!args.sandbox_permissions || ["workspace-write", "read-only"].includes(args.sandbox_permissions)) &&
      exec.signal &&
      typeof exec.signal.addEventListener === "function"

    if (disposed || !["bash", "pwsh"].includes(exec.name) || !parsed || !sessionValid || !executionIsPlain) {
      const code = disposed ? "host_stopped" : !sessionValid ? "invalid_session" :
        !executionIsPlain || !["bash", "pwsh"].includes(exec.name) ? "invalid_execution" : "invalid_command"
      const message = code === "invalid_command"
        ? commandError.message
        : code === "invalid_execution"
        ? "Use foreground Bash with the current session directory (or omit workdir). Omit sandbox_permissions; escalation is unsupported. This is a local argument rejection, not a Loop connection failure. Do not repeat unchanged arguments."
        : code === "invalid_session" ? "A live DSH session is required." : "The Loop Host has stopped."
      return shellResult(sessionID, {failed: true, output: JSON.stringify({error: {
        code, message, ...(code === "invalid_command" ? {hint: commandError.hint} : {}), retryable: false, dispatched: false,
      }})}, exec)
    }
    if (parsed.verb === "guide") {
      try {
        exec.signal.throwIfAborted()
        const output = await readHarnessGuide(parsed.name, options.skillPath)
        exec.signal.throwIfAborted()
        if (["directory", "tasks", "agents", "messages"].includes(parsed.name)) {
          ctx.get?.("loopHostService")?.collaboration?.enableTools(sessionID, parsed.name)
        }
        return shellResult(sessionID, {failed: false, output}, exec)
      } catch (error) {
        return shellResult(sessionID, {failed: true, output: errorMessage(error)}, exec)
      }
    }
    const loopHost = typeof ctx.get === "function" ? ctx.get("loopHostService") : undefined
    if (parsed.verb === "actions") {
      // Discovery can expose Host tools without loading procedural instructions.
      loopHost?.collaboration?.enableTools(sessionID, "actions")
    }
    if (parsed.principal === "human") {
      try {
        const result = await loopHost?.humanCommand?.(sessionID, parsed, exec.signal, args.description)
        return shellResult(sessionID, result ?? {failed: true, output: JSON.stringify({error: {
          code: "loop-host/backend-unavailable", message: "The native Loop Human connection is unavailable.", dispatched: false,
        }})}, exec)
      } catch (error) {
        return shellResult(sessionID, {failed: true, aborted: exec.signal.aborted, output: errorMessage(error)}, exec)
      }
    }
    if (loopHost?.canUseAgentActions?.() === true) {
      try {
        const automatic = await loopHost.agentCommand(sessionID, parsed, exec.signal, args.description)
        return shellResult(sessionID, automatic, exec)
      } catch (error) {
        return shellResult(sessionID, {
          failed: true,
          aborted: exec.signal.aborted,
          output: errorMessage(error),
        }, exec)
      }
    }
    if (parsed.verb === "context") {
      return shellResult(sessionID, {failed: true, output: "Loop Host binding is unavailable; open the session Loop project status"}, exec)
    }
    return shellResult(sessionID, {failed: true, output: unavailableOutput}, exec)
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    for (const off of disposers) off?.()
  }
  disposers.push(ctx.on("tools/execute", execute))
  disposers.push(ctx.on("dispose", dispose))
  return {dispose, execute}
}


function shellResult(session, result, exec) {
  const failed = Boolean(result.failed)
  return {
    // A completed command remains a shell result even when it exits nonzero.
    // The official middleware normalizes isError failures as tool errors, which
    // require a separate content/error presentation rather than this value.
    isError: false,
    value: {
      kind: "foreground",
      cwd: session ? exec?.agent?.session?.header?.cwd ?? "" : "",
      exitCode: failed ? 1 : 0,
      signal: null,
      aborted: Boolean(result.aborted || exec?.signal?.aborted),
      timedOut: false,
      timeoutMs: CALL_TIMEOUT_MS,
      stdout: {text: result.output, truncated: false},
      stderr: {text: "", truncated: false},
    },
  }
}

const errorMessage = toolErrorText

// The bare package row declares the client module. The native managed entry
// installs the tool middleware after its credential-backed Host service exists.
export function apply(ctx) {
  if (!ctx.get?.("loopManagedConfig")) throw new Error("Loop requires its native managed configuration")
}
