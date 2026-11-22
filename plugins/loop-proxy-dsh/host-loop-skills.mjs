import {createHash} from "node:crypto"

const MAX_REFERENCE_TEXT = 16 << 10
const MAX_INJECTIONS = 32
const MAX_SEEN_INVOCATIONS = 256
const MAX_EVENT_HISTORY = 64
const MAX_SKILL_BODY_BYTES = 256 << 10
const MAX_SKILL_BODY_CHUNKS = 8
const MAX_SKILL_PATH_RUNES = 1024
const MAX_SKILL_PATH_SEGMENTS = 64
const LOOP_SKILL_REF = /<loop-skill-ref>([A-Za-z0-9_-]{1,21845})<\/loop-skill-ref>/gu

function failure(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function normalizeSkillPath(path) {
  const value = typeof path === "string" ? path.trim() : ""
  if (value === "" || Array.from(value).length > MAX_SKILL_PATH_RUNES ||
      value.includes("\0") || value.includes("\\")) {
    return null
  }
  const parts = value.split("/")
  if (parts.length > MAX_SKILL_PATH_SEGMENTS) return null
  const cleaned = parts.map(part => part.trim())
  if (cleaned.some(part => part === "" || part === "." || part === "..")) return null
  return cleaned.join("/")
}

function exactContentHandle(versionIdValue, commitSHAValue) {
  const versionId = typeof versionIdValue === "string" ? versionIdValue.trim() : ""
  const commitSha = typeof commitSHAValue === "string" ? commitSHAValue.trim() : ""
  if (commitSha !== "") {
    if (versionId !== "" && versionId !== `git:${commitSha}`) return null
    return {commitSha}
  }
  if (versionId.startsWith("git:")) {
    const legacyCommit = versionId.slice("git:".length)
    return legacyCommit === "" ? null : {commitSha: legacyCommit}
  }
  return versionId === "" ? null : {versionId}
}

function decodeReferenceResult(encoded) {
  try {
    const value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
    if (value === null || typeof value !== "object" || Array.isArray(value) || value.version !== 1 ||
        typeof value.sessionId !== "string" || value.sessionId === "" ||
        typeof value.skillId !== "string" || value.skillId === "" ||
        typeof value.path !== "string" || typeof value.name !== "string" || value.name === "" ||
        typeof value.displayName !== "string" || value.displayName === "" ||
        typeof value.sourceRevision !== "string" || value.sourceRevision === "" ||
        typeof value.libraryName !== "string" || value.libraryName === "" ||
        (typeof value.versionId !== "string" && typeof value.commitSha !== "string")) {
      return {error: failure("loop-skill/invalid-reference", "Loop Skill reference is invalid")}
    }
    const handle = exactContentHandle(value.versionId, value.commitSha)
    if (handle === null) {
      return {
        error: failure(
          "loop-skill/invalid-version-handle",
          "Loop Skill reference has an invalid exact content handle",
        ),
      }
    }
    const path = normalizeSkillPath(value.path)
    if (path === null) {
      return {
        error: failure("loop-skill/unsupported-path", "Loop Skill reference path is unsupported"),
      }
    }
    return {reference: {...value, path, ...handle}}
  } catch {
    return {error: failure("loop-skill/invalid-reference", "Loop Skill reference is invalid")}
  }
}

function decodeReference(encoded) {
  return decodeReferenceResult(encoded).reference ?? null
}

function userMessageText(message) {
  return message.content
    .filter(block => block?.type === "text" && typeof block.text === "string")
    .map(block => block.text)
    .join("\n")
}

// The wire token is only transport. Persist a readable human prompt and keep
// exact selection IDs in the accompanying context message, never in UI text.
function knowledgeSelection(message, sessionId) {
  const text = userMessageText(message)
  if (!text.includes("<loop-knowledge-ref>")) return undefined
  const refs = new Set()
  let invalid = Buffer.byteLength(text, "utf8") > MAX_REFERENCE_TEXT
  const content = message.content.map(block => {
    if (block?.type !== "text" || typeof block.text !== "string") return block
    const cleaned = block.text.replace(/<loop-knowledge-ref>([^<]*)<\/loop-knowledge-ref>/gu, (_, encoded) => {
      try {
        if (invalid || !/^[A-Za-z0-9_-]{1,8192}$/u.test(encoded)) throw new Error()
        const ref = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"))
        if (ref?.version !== 1 || ref.sessionId !== sessionId || typeof ref.kbId !== "string" ||
            !ref.kbId || ref.kbId.length > 255 || typeof ref.name !== "string" || !ref.name.trim() || ref.name.length > 1024) throw new Error()
        refs.add(ref.kbId)
        if (refs.size > MAX_INJECTIONS) throw new Error()
        return `Loop · ${ref.name.replace(/[\p{Cc}\p{Cf}]/gu, " ")}`
      } catch {
        invalid = true
        return "Loop · 知识库（引用无效）"
      }
    })
    if (cleaned.includes("<loop-knowledge-ref>")) invalid = true
    return {...block, text: cleaned}
  })
  return {content, kbIds: invalid ? [] : [...refs]}
}

function claimedLoopSkillReferences(messages, sessionId) {
  const refs = []
  const identities = new Set()
  for (const message of messages ?? []) {
    if (message?.source?.kind !== "user") continue
    const text = userMessageText(message)
    if (text === "" || Buffer.byteLength(text, "utf8") > MAX_REFERENCE_TEXT) continue
    const messageIdentity = typeof message.id === "string" && message.id !== ""
      ? message.id
      : typeof message.source?.rpcId === "string" && message.source.rpcId !== ""
        ? message.source.rpcId
        : createHash("sha256").update(text).digest("hex")
    for (const match of text.matchAll(LOOP_SKILL_REF)) {
      const decoded = decodeReferenceResult(match[1])
      if (decoded.error) throw decoded.error
      const ref = decoded.reference
      if (ref.sessionId !== sessionId) continue
      const identity = [
        messageIdentity,
        ref.skillId,
        ref.path,
        ref.versionId ?? ref.commitSha,
        ref.sourceRevision,
      ].join("\0")
      if (identities.has(identity)) continue
      identities.add(identity)
      refs.push({...ref, messageIdentity})
      if (refs.length >= MAX_INJECTIONS) return refs
    }
  }
  return refs
}

function neutralizeInstructionBoundaries(content) {
  return content
    .replaceAll("</skill_instructions>", "&lt;/skill_instructions&gt;")
    .replaceAll("</skill_content>", "&lt;/skill_content&gt;")
}

function invocationDigest(ref) {
  return createHash("sha256").update(JSON.stringify({
    messageIdentity: ref.messageIdentity,
    sessionId: ref.sessionId,
    skillId: ref.skillId,
    path: ref.path,
    versionId: ref.versionId ?? "",
    commitSha: ref.commitSha ?? "",
    sourceRevision: ref.sourceRevision,
  })).digest("hex")
}

function readData(envelope) {
  const data = envelope?.data
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw failure("loop-host/backend-invalid", "Loop Skill content returned an invalid result")
  }
  return data
}

function contentChunk(data) {
  if (typeof data.content === "string" && data.content !== "") {
    return Buffer.from(data.content, "utf8")
  }
  if (typeof data.contentBase64 === "string" && data.contentBase64 !== "") {
    return Buffer.from(data.contentBase64, "base64")
  }
  return Buffer.alloc(0)
}

function workspaceIdForSession(ctx, sessionId) {
  const workspace = ctx.workspaceRegistry.list().find(candidate =>
    candidate.sessionIds.some(id => String(id) === sessionId))
  return typeof workspace?.id === "string" && workspace.id !== "" ? workspace.id : undefined
}

/**
 * Host-owned Loop Skill catalog transport. The Loop authorizes catalog and content reads; this class only starts one invalidation watch, fans out
 * ordered changes, and serves the pre-step reader.
 */
export class LoopSkillRuntime {
  constructor(ctx, options) {
    if (!ctx || typeof options?.getActions !== "function") {
      throw new TypeError("Loop Skill runtime requires Host context and actions")
    }
    this.ctx = ctx
    this.getActions = options.getActions
    this.actions = undefined
    this.unsubscribe = undefined
    this.watchPromises = new Map()
    this.listeners = new Map()
    this.history = []
    this.historyTruncated = false
    this.seenEventIds = new Set()
    this.localSequence = 0
    this.durableCursor = 0
    this.subscription = {
      state: "connecting",
      lastEventSeq: 0,
      snapshotRequired: false,
    }
    this.disposed = false
    this.seenInvocations = new Set()
    this.skillSupport = options.skillSupport
    this.skillSupportPromise = undefined
    this.setActions(options.actions)
  }

  setActions(actions) {
    if (this.disposed || actions === this.actions) return
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.actions = actions
    this.watchPromises.clear()
    this.history = []
    this.historyTruncated = false
    this.seenEventIds.clear()
    this.subscription = {
      state: "connecting",
      lastEventSeq: 0,
      snapshotRequired: false,
    }
    if (typeof actions?.addSkillCatalogEventListener !== "function") return
    this.unsubscribe = actions.addSkillCatalogEventListener(message => {
      this.acceptActionEvent(message)
    })
  }

  acceptActionEvent(message) {
    if (this.disposed || message?.event === null || typeof message?.event !== "object" ||
        Array.isArray(message.event) || typeof message?.scope?.workspaceId !== "string" ||
        message.scope.workspaceId === "") return
    const eventId = String(message.event.eventId ?? "")
    const eventKey = `${message.scope.hostWorkspaceId || message.scope.workspaceId}\0${message.scope.identityFingerprint ?? ""}\0${eventId}`
    if (eventId !== "" && this.seenEventIds.has(eventKey)) return
    if (eventId !== "") {
      this.seenEventIds.add(eventKey)
      if (this.seenEventIds.size > MAX_EVENT_HISTORY * 4) {
        const oldest = this.seenEventIds.values().next().value
        if (oldest !== undefined) this.seenEventIds.delete(oldest)
      }
    }
    const durableEventSeq = Number(message.event.eventSeq)
    const event = {
      ...message.event,
      localSequence: ++this.localSequence,
      durableEventSeq: Number.isSafeInteger(durableEventSeq) && durableEventSeq > 0
        ? durableEventSeq
        : 0,
      workspaceId: message.scope.workspaceId,
      hostWorkspaceId: String(message.scope.hostWorkspaceId ?? ""),
      installationId: String(message.scope.installationId ?? ""),
      accountId: String(message.scope.accountPrincipal ?? ""),
      serverBaseUrl: String(message.scope.serviceBaseUrl ?? ""),
      bindingRevision: String(message.scope.bindingRevision ?? ""),
      projectId: String(message.scope.projectId ?? ""),
      agentId: String(message.scope.agentId ?? ""),
      identityFingerprint: String(message.scope.identityFingerprint ?? ""),
    }
    if (event.kind === "subscription.changed" && event.status !== null &&
        typeof event.status === "object" && !Array.isArray(event.status)) {
      this.subscription = {
        state: String(event.status.state ?? "live"),
        lastEventSeq: Math.max(0, Number(event.status.latestEventSeq ?? event.durableEventSeq ?? 0)),
        snapshotRequired: event.status.snapshotRequired === true,
      }
    }
    if (event.durableEventSeq > this.durableCursor) this.durableCursor = event.durableEventSeq
    this.history.push(event)
    if (this.history.length > MAX_EVENT_HISTORY) {
      this.history.shift()
      this.historyTruncated = true
    }
    for (const listeners of [...this.listeners.values()]) {
      for (const listener of [...listeners]) {
        try {
          listener(event)
        } catch {}
      }
    }
  }

  async startWatch(workspaceId) {
    const actions = this.getActions?.() ?? this.actions
    this.setActions(actions)
    if (this.disposed || typeof actions?.skillCatalogWatch !== "function") return
    const key = String(workspaceId ?? "")
    if (key === "") throw failure("loop-host/invalid-request", "Loop Skill Host workspace is required")
    if (this.watchPromises.has(key)) return await this.watchPromises.get(key)
    if (this.watchPromises.size >= 16) {
      throw failure("loop-host/queue-full", "Too many Loop Skill Host workspaces are active")
    }
    const promise = Promise.resolve()
      .then(() => actions.skillCatalogWatch({workspaceId: key}))
      .catch(error => {
        this.watchPromises.delete(key)
        throw error
      })
    this.watchPromises.set(key, promise)
    return await promise
  }

  async stopWatch(workspaceId) {
    const actions = this.getActions?.() ?? this.actions
    const key = String(workspaceId ?? "")
    this.watchPromises.delete(key)
    if (this.disposed || key === "" || typeof actions?.skillCatalogWatch !== "function") return
    try {
      await actions.skillCatalogWatch({workspaceId: key, stop: true})
    } catch {}
  }

  async knowledgeCatalog(request, signal) {
    const actions = this.getActions?.() ?? this.actions
    if (typeof actions?.knowledgeCatalog !== "function") throw failure("loop-host/capability-unsupported", "Update the Loop plugin to use knowledge bases")
    return await actions.knowledgeCatalog(request, signal)
  }

  async catalog(request, signal) {
    const actions = this.getActions?.() ?? this.actions
    if (typeof actions?.skillCatalog !== "function") {
      throw failure("loop-host/capability-unsupported", "This Loop Host cannot load Loop Skills")
    }
    return await actions.skillCatalog(request, signal)
  }

  async content(request, signal) {
    const actions = this.getActions?.() ?? this.actions
    if (typeof actions?.skillContent !== "function") {
      throw failure("loop-host/capability-unsupported", "This Loop Host cannot load Loop Skill content")
    }
    return await actions.skillContent(request, signal)
  }

  async *stream(request, signal) {
    if (this.disposed) return
    await this.startWatch(request?.workspaceId).catch(() => undefined)
    if (typeof request?.workspaceId !== "string" || typeof request?.sessionId !== "string") {
      throw failure("loop-host/invalid-request", "Loop Skill event scope is incomplete")
    }
    const queue = []
    let wake
    const notify = () => {
      const resolve = wake
      wake = undefined
      resolve?.()
    }
    const workspaceListeners = this.listeners.get(request.workspaceId) ?? new Set()
    this.listeners.set(request.workspaceId, workspaceListeners)
    const belongsToHostWorkspace = event =>
      (event.hostWorkspaceId || event.workspaceId) === request.workspaceId
    const listener = event => {
      if (!belongsToHostWorkspace(event)) return
      queue.push({type: "change", event: {...event, sessionId: request.sessionId}})
      notify()
    }
    const abort = () => notify()
    signal?.addEventListener("abort", abort, {once: true})
    workspaceListeners.add(listener)
    for (const event of this.history) {
      if (belongsToHostWorkspace(event)) {
        queue.push({type: "change", event: {...event, sessionId: request.sessionId}})
      }
    }
    queue.push({
      type: "ready",
      sequence: this.durableCursor,
      subscription: {
        state: this.subscription.state,
        lastEventSeq: Math.max(this.durableCursor, this.subscription.lastEventSeq),
        snapshotRequired: this.subscription.snapshotRequired || this.historyTruncated,
      },
    })
    try {
      while (!signal?.aborted && !this.disposed) {
        if (queue.length === 0) {
          await new Promise(resolve => { wake = resolve })
          continue
        }
        yield queue.shift()
      }
    } finally {
      signal?.removeEventListener("abort", abort)
      workspaceListeners.delete(listener)
      if (workspaceListeners.size === 0) {
        this.listeners.delete(request.workspaceId)
        if (!this.disposed) void this.stopWatch(request.workspaceId)
      }
    }
  }

  async injectClaimedUserSkills(agent, messages, decision, signal) {
    const sessionId = agent?.session?.id
    if (typeof sessionId !== "string" || sessionId === "" || decision?.kind !== "enter") {
      return decision
    }
    const refs = claimedLoopSkillReferences(messages, sessionId)
    if (refs.length === 0) return decision
    const workspaceId = workspaceIdForSession(this.ctx, sessionId)
    if (workspaceId === undefined) {
      throw failure(
        "loop-host/workspace-unavailable",
        "The Session does not belong to a registered Loop Host workspace",
      )
    }
    signal?.throwIfAborted()
    const {createUserMessage, renderSkillContent} = await this.loadSkillSupport()
    const injections = []
    for (const ref of refs) {
      const digest = invocationDigest(ref)
      if (this.seenInvocations.has(digest)) continue
      const handle = exactContentHandle(ref.versionId, ref.commitSha)
      if (handle === null) {
        throw failure(
          "loop-skill/invalid-version-handle",
          "The selected Loop Skill has no valid exact content handle",
        )
      }
      let offset = 0
      let rawBytes = 0
      const parts = []
      for (let chunkIndex = 0; chunkIndex < MAX_SKILL_BODY_CHUNKS; chunkIndex += 1) {
        const result = await this.content({
          workspaceId,
          sessionId,
          skillId: ref.skillId,
          path: ref.path,
          ...(handle.commitSha
            ? {expectedCommitSha: handle.commitSha}
            : {expectedVersionId: handle.versionId}),
          ...(offset === 0 ? {} : {offset}),
          maxBytes: 32 << 10,
        }, signal)
        signal?.throwIfAborted()
        const data = readData(result)
        if (Number(data.offset) !== offset) {
          throw failure("loop-host/backend-invalid", "Loop Skill content returned an unexpected offset")
        }
        const exactHandleMatches = handle.commitSha
          ? (data.commitSha === handle.commitSha ||
              data.versionId === `git:${handle.commitSha}`) &&
            (data.commitSha === undefined || data.commitSha === "" || data.commitSha === handle.commitSha) &&
            (data.versionId === "" || data.versionId === `git:${handle.commitSha}`)
          : data.versionId === handle.versionId
        if (!exactHandleMatches) {
          throw failure(
            "loop-skill/binding-stale",
            "The selected Loop Skill version changed. Select the Skill again.",
          )
        }
        const chunk = contentChunk(data)
        const nextOffset = Number(data.nextOffset)
        if (!Number.isSafeInteger(nextOffset) || nextOffset !== offset + chunk.length) {
          throw failure("loop-host/backend-invalid", "Loop Skill content returned an inconsistent next offset")
        }
        rawBytes += chunk.length
        if (rawBytes > MAX_SKILL_BODY_BYTES) {
          throw failure(
            "loop-skill/content-too-large",
            "The selected Loop Skill instructions exceed the 256 KiB pre-step limit",
          )
        }
        parts.push(chunk)
        if (data.hasMore !== true) break
        if (nextOffset <= offset) {
          throw failure("loop-host/backend-invalid", "Loop Skill content returned a stale continuation")
        }
        offset = nextOffset
        if (chunkIndex === MAX_SKILL_BODY_CHUNKS - 1) {
          throw failure(
            "loop-skill/content-too-large",
            "The selected Loop Skill instructions exceed the 256 KiB pre-step limit",
          )
        }
      }
      if (rawBytes === 0) {
        throw failure("loop-skill/content-empty", "The selected Loop Skill instructions are empty")
      }
      const body = Buffer.concat(parts, rawBytes).toString("utf8")
      const exactHandleName = handle.commitSha ? "expectedCommitSha" : "expectedVersionId"
      const exactHandleValue = handle.commitSha || handle.versionId
      const supportingFileCall = JSON.stringify({
        skillId: ref.skillId,
        path: "<relative-path>",
        [exactHandleName]: exactHandleValue,
      })
      const rendered = renderSkillContent({
        name: ref.name,
        provider: "Loop",
        resourceBase: {
          kind: "opaque",
          description: [
            `Loop Skill library: ${ref.libraryName || ref.librarySlug || ref.skillId}.`,
            `Exact content version: ${exactHandleValue}.`,
            "Loop Agent actions are available through the existing bash tool, not as native tool calls.",
            "Send one standalone virtual command: `loop-proxy actions`, `loop-proxy schema <action>`, or `loop-proxy call <action> <schema-valid-json>`.",
            "The Host parses this command before any shell runs. Write the JSON object directly after the action, optionally inside one pair of single quotes. Do not apply shell escaping.",
            "The whole bash command must be that one command with default workdir, no background mode, and no sandbox override; do not add chaining, wrappers, redirection, pipelines, command substitution, or extra arguments.",
            "`loop-proxy` is not on PATH: do not search for it with `which`, inspect environment, or probe files.",
            "Names such as `task.list` and `skill.content` are action IDs and use the same `loop-proxy call` transport.",
            "Before a typed call, run `loop-proxy schema <action>` and preserve the returned action schema and exact IDs.",
            `For a referenced supporting file, read its exact relative path from these instructions, run \`loop-proxy schema skill.content\`, then replace <relative-path> in this exact virtual call: \`loop-proxy call skill.content ${supportingFileCall}\`.`,
            "Continue with the returned nextOffset when hasMore is true. Do not substitute a current or unversioned file.",
            "The Host binds workspace, session, profile, identity, and credentials; never print, request, inspect, or substitute them.",
          ].join(" "),
        },
        content: neutralizeInstructionBoundaries(body),
      })
      injections.push({
        digest,
        message: createUserMessage({
          content: [{type: "text", text: rendered}],
          source: {
            kind: "skill-invocation",
            name: ref.name,
            form: "instructions",
          },
        }),
      })
    }
    if (injections.length === 0) return decision
    for (const injection of injections) {
      this.seenInvocations.add(injection.digest)
      if (this.seenInvocations.size > MAX_SEEN_INVOCATIONS) {
        const oldest = this.seenInvocations.values().next().value
        if (oldest !== undefined) this.seenInvocations.delete(oldest)
      }
    }
    return {
      ...decision,
      messages: [...decision.messages, ...injections.map(injection => injection.message)],
    }
  }

  async injectClaimedUserKnowledge(agent, messages, decision, signal) {
    const sessionId = agent?.session?.id
    if (typeof sessionId !== "string" || decision?.kind !== "enter") return decision
    const claimed = new Set((messages ?? []).filter(message => message?.source?.kind === "user").map(message => message.id))
    const admitted = decision.messages.filter(message => message?.source?.kind === "user" && claimed.has(message.id))
    if (admitted.length === 0) return decision
    const replacements = new Map()
    const injections = []
    for (const message of admitted) {
      const selection = knowledgeSelection(message, sessionId)
      if (!selection) continue
      signal?.throwIfAborted()
      const {kbIds} = selection
      const instruction = kbIds.length
        ? `The user referenced these Loop knowledge bases: ${JSON.stringify({kbIds})}. Loop checks access on each action. For “what is in this library”, list BOTH online documents (kb.doc-list by kbId) and sources (kb.list by kbIds), then browse the returned sources. Report any unchecked category as unknown. See loop-proxy guide knowledge.`
        : "The knowledge base reference in this message is invalid. Ask for the intended library if the request is ambiguous."
      const {createUserMessage, freezeMessage} = await this.loadSkillSupport()
      replacements.set(message, freezeMessage({...message, content: selection.content}))
      injections.push(createUserMessage({
        content: [{type: "text", text: instruction}],
        source: {kind: "skill-invocation", name: "Loop knowledge", form: "instructions",
          loopKnowledge: {version: 1, sessionId, userMessageId: message.id, kbIds, blocked: kbIds.length === 0}},
      }))
    }
    signal?.throwIfAborted()
    if (injections.length === 0) return decision
    return {...decision, messages: [...decision.messages.map(message => replacements.get(message) ?? message), ...injections]}
  }

  installPreStep() {
    this.ctx.on("agent/pre-step", async ({agent, messages, signal}, next) => {
      let decision = await next()
      if (decision?.kind !== "enter") return decision
      decision = await this.injectClaimedUserKnowledge(agent, messages, decision, signal)
      try {
        return await this.injectClaimedUserSkills(agent, messages, decision, signal)
      } catch (error) {
        signal?.throwIfAborted()
        const {createUserMessage} = await this.loadSkillSupport()
        // Keep the user turn runnable, but never inject partial or substitute
        // Skill instructions when any exact-version read failed.
        return {...decision, messages: [...decision.messages, createUserMessage({
          content: [{type: "text", text: [
            "The selected Loop Skill could not be loaded. No selected Skill instructions were admitted for this submission.",
            `Reason: ${error instanceof Error ? error.message : String(error)}`,
            "Explain this failure and recovery in the user's language. Do not execute the failed Skill, reuse earlier Skill content, guess its files, or substitute another version.",
            "For changed versions or bindings, ask the user to reopen / and select the Skill again. For authorization failures, explain the specific missing access and reconnect only if needed. A temporary service failure can be retried in this chat.",
          ].join("\n")}],
          source: {kind: "skill-invocation", name: "Loop", form: "instructions"},
        })]}
      }
    })
  }

  async loadSkillSupport() {
    if (this.skillSupport !== undefined) return this.skillSupport
    this.skillSupportPromise ??= Promise.all([
      import("@deepseek-ai/dsh-llm"),
      import("@deepseek-ai/dsh-skill"),
    ]).then(([llm, skill]) => {
      this.skillSupport = {
        createUserMessage: llm.createUserMessage,
        freezeMessage: llm.freezeMessage,
        renderSkillContent: skill.renderSkillContent,
      }
      return this.skillSupport
    })
    return await this.skillSupportPromise
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribe?.()
    this.unsubscribe = undefined
    this.listeners.clear()
    this.history = []
    this.historyTruncated = false
    this.seenEventIds.clear()
  }
}

export const __testing = {
  claimedLoopSkillReferences,
  decodeReference,
  neutralizeInstructionBoundaries,
}
