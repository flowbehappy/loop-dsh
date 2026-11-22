import { createHash } from "node:crypto"

const EVENT_CONTENT_LIMIT = 32 * 1024
const RESOURCE_ID = /^[a-z]{2,12}_[A-Za-z0-9]{4,128}$/
const SAFE_TOOL_NAME = /^[A-Za-z0-9_.:-]{1,128}$/
const SAFE_IDENTITY_PART = /^[A-Za-z0-9._:-]{1,180}$/
const RESOURCE_KEYS = new Map([
  ["taskId", "task"],
  ["channelId", "channel"],
  ["threadId", "thread"],
  ["projectId", "project"],
  ["driveId", "drive"],
  ["dataSpaceId", "dataspace"],
  ["workflowId", "workflow"],
  ["memoryId", "memory"],
  ["skillId", "skill"],
  ["kbId", "kb"],
  ["knowledgeBaseId", "kb"],
  ["appId", "app"],
  ["scheduleId", "schedule"],
  ["scheduledMessageId", "schedule"],
])

export function mapSessionTelemetryRecord(record) {
  if (record?.channel !== "ledger" || !record.sourceEvent) {
    return { event: null, flush: record?.channel === "ops" }
  }
  const envelope = record.sourceEvent.envelope
  const eventType = String(
    record.attributes?.["event.type"] ?? envelope?.type ?? ""
  )
  if (eventType === "turn/end") return { event: null, flush: true }
  const sessionID = String(
    record.sourceEvent.sessionId ?? record.attributes?.["session.id"] ?? ""
  ).trim()
  const sequence = Number(
    record.attributes?.["event.seq"] ?? envelope?.seq ?? NaN
  )
  if (!sessionID || !Number.isSafeInteger(sequence) || sequence <= 0) {
    return { event: null, flush: false }
  }
  const formatVersion = safeIdentityPart(
    String(record.attributes?.["session.format_version"] ?? "unknown")
  )
  const body = isRecord(record.body) ? record.body : {}
  const turnID =
    Number.isSafeInteger(body.turn) && body.turn >= 0
      ? `turn:${sessionID}:${body.turn}`
      : ""
  const completedAt = isoTime(record.time)
  const base = {
    sourceEventId: `dsh:${safeIdentityPart(sessionID)}:${formatVersion}:${sequence}`,
    sourceThreadId: sessionID,
    provenance: "host_observed",
    ...(completedAt ? { completedAt } : {}),
  }

  if (eventType === "user/message") {
    if (body.source?.kind !== "user") return { event: null, flush: false }
    const content = visibleContent(body.content)
    if (!content) return { event: null, flush: false }
    return {
      event: {
        ...base,
        ...(turnID ? { sourceTurnId: turnID } : {}),
        sourceItemId: boundedIdentity(body.id, "dsh-user"),
        kind: "human_message",
        state: "completed",
        content,
      },
      flush: false,
    }
  }

  if (eventType === "assistant/message") {
    const message = isRecord(body.message) ? body.message : {}
    const content = visibleContent(message.content)
    if (!content) return { event: null, flush: false }
    return {
      event: {
        ...base,
        ...(turnID ? { sourceTurnId: turnID } : {}),
        sourceItemId: boundedIdentity(message.id, "dsh-agent"),
        kind: "agent_message",
        state: "completed",
        content,
      },
      flush: false,
    }
  }

  if (eventType === "tool/call") {
    const callID = boundedIdentity(body.callId, "dsh-tool")
    const toolName = safeToolName(body.name)
    return {
      event: {
        ...base,
        ...(turnID ? { sourceTurnId: turnID } : {}),
        sourceItemId: callID,
        kind: "tool_started",
        state: "started",
        content: toolName ? `Tool ${toolName} started` : "Tool started",
        ...(completedAt ? { startedAt: completedAt } : {}),
        resourceRefs: safeResourceRefs(parseArguments(body.arguments)),
      },
      flush: false,
    }
  }

  if (eventType === "tool/result") {
    const message = isRecord(body.message) ? body.message : {}
    const failed =
      message.isError === true ||
      (body.error !== undefined && body.error !== null)
    return {
      event: {
        ...base,
        ...(turnID ? { sourceTurnId: turnID } : {}),
        sourceItemId: boundedIdentity(message.toolCallId, "dsh-tool"),
        kind: "tool_completed",
        state: failed ? "failed" : "completed",
        content: failed ? "Tool failed" : "Tool completed",
        resourceRefs: safeResourceRefs(body.meta),
      },
      flush: false,
    }
  }

  return { event: null, flush: false }
}

export function safeResourceRefs(value) {
  const refs = new Map()
  collectResourceRefs(value, refs, 0)
  return [...refs.values()]
    .sort((left, right) =>
      left.kind === right.kind
        ? left.id.localeCompare(right.id)
        : left.kind.localeCompare(right.kind)
    )
    .slice(0, 32)
}

function collectResourceRefs(value, refs, depth) {
  if (depth > 6) return
  if (Array.isArray(value)) {
    for (const item of value) collectResourceRefs(item, refs, depth + 1)
    return
  }
  if (!isRecord(value)) return
  for (const [key, raw] of Object.entries(value)) {
    const kind = RESOURCE_KEYS.get(key)
    if (kind && typeof raw === "string" && RESOURCE_ID.test(raw)) {
      refs.set(`${kind}\0${raw}`, { kind, id: raw })
      continue
    }
    collectResourceRefs(raw, refs, depth + 1)
  }
}

export function visibleContent(content) {
  if (!Array.isArray(content)) return ""
  const parts = []
  for (const block of content) {
    if (!isRecord(block)) continue
    if (block.type === "text" && typeof block.text === "string") {
      if (block.text.trim()) parts.push(block.text)
      continue
    }
    if (block.type === "image") {
      parts.push("[Image attachment]")
      continue
    }
    if (block.type === "file") parts.push("[File attachment]")
  }
  return boundContent(parts.join("\n"))
}

export function loopWorkRequestID(itemID, claimID) {
  const payload = Buffer.from(
    JSON.stringify({ i: String(itemID ?? ""), c: String(claimID ?? "") }),
    "utf8"
  ).toString("base64url")
  return `loop-work:${payload}`
}

export function parseLoopWorkRequestID(value) {
  const requestID = String(value ?? "")
  if (!requestID.startsWith("loop-work:")) return null
  const encoded = requestID.slice("loop-work:".length)
  if (!encoded || encoded.length > 512) return null
  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    )
    const itemID = typeof parsed?.i === "string" ? parsed.i.trim() : ""
    const claimID = typeof parsed?.c === "string" ? parsed.c.trim() : ""
    if (!itemID || !claimID) return null
    return { itemID, claimID, requestID }
  } catch {
    return null
  }
}

function boundContent(value) {
  const raw = Buffer.from(String(value), "utf8")
  if (raw.length <= EVENT_CONTENT_LIMIT) return String(value)
  return raw.subarray(0, EVENT_CONTENT_LIMIT).toString("utf8")
}

function boundedIdentity(value, fallbackPrefix) {
  const text = String(value ?? "").trim()
  if (SAFE_IDENTITY_PART.test(text)) return text
  return `${fallbackPrefix}:${createHash("sha256").update(text).digest("hex").slice(0, 24)}`
}

function safeIdentityPart(value) {
  return SAFE_IDENTITY_PART.test(value)
    ? value
    : createHash("sha256").update(value).digest("hex").slice(0, 24)
}

function safeToolName(value) {
  const text = String(value ?? "").trim()
  return SAFE_TOOL_NAME.test(text) ? text : ""
}

function parseArguments(value) {
  if (typeof value !== "string" || !value.trim()) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function isoTime(value) {
  const time = Number(value)
  if (!Number.isFinite(time)) return ""
  const date = new Date(time)
  return Number.isNaN(date.getTime()) ? "" : date.toISOString()
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}
