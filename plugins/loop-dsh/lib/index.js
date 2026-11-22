import z from "@deepseek-ai/schemastery"
import { SessionTelemetryCoordinator } from "@deepseek-ai/dsh-session-telemetry"

import { mapSessionTelemetryRecord } from "./map.js"
import { resolveConfig } from "./config.js"
import { SessionSyncGate } from "./gate.js"

export const name = "loop-dsh-sync"
export const inject = ["sessions", "workspaceRegistry", "sessionQuery", "loopNativeSyncWriterFactory"]

export const Config = z.object({
  workspaceRoot: z.string().required(),
  profile: z.string().default("dsh-loop"),
  hostSyncHome: z.string(),
  clientSessionLabel: z.string().default("DeepSeek Harness"),
  queueLimit: z.number().step(1).min(1).max(100000).default(10000),
  shutdownTimeoutMs: z.number().step(1).min(5000).max(120000).default(60000),
})

export function apply(ctx, config) {
  const nativeFactory = ctx.get?.("loopNativeSyncWriterFactory")
  if (typeof nativeFactory !== "function") throw new Error("Loop native sync writer is required")
  const resolved = resolveConfig(config)
  const writer = nativeFactory(resolved)
  let captureGeneration = 0
  const syncGate = new SessionSyncGate(
    async sessionID => {
      const generation = captureGeneration
      const service = typeof ctx.get === "function"
        ? ctx.get("loopHostService")
        : undefined
      const pending = liveEvents.get(sessionID)
      const observed = pending?.length ?? 0
      const target = service?.sessionSyncAdmission
        ? await service.sessionSyncAdmission(sessionID)
        : await service?.sessionSyncTarget?.(sessionID)
      if (generation !== captureGeneration) return null
      if (target?.state === "off" && pending && liveEvents.get(sessionID) === pending) {
        liveQueued -= pending.splice(0, observed).length
        if (!pending.length) liveEvents.delete(sessionID)
      }
      return target ? {...target, generation} : null
    },
    ctx.logger,
    {onStatus(sessionID, status) {
      ctx.get?.("loopHostService")?.setSessionUploadStatus?.(sessionID, status)
    }}
  )
  let coordinator
  let captureTarget
  const captured = new Map()
  // Default mode remembers only events observed while signed in. No login
  // history, persisted time ranges or replay cursor is needed for this mode.
  const liveEvents = new Map()
  let liveQueued = 0
  const policy = () => ctx.get?.("loopHostService")?.syncCapturePolicy?.() ??
    {loggedIn: false, uploadDisconnectedHistory: false}

  const sink = {
    emit(record) {
      const mapped = mapSessionTelemetryRecord(record)
      if (mapped.event) {
        const sessionID = record.sourceEvent.sessionId
        if (!captureTarget) throw new Error("Upload admission is missing")
        writer.enqueue(sessionID, mapped.event, captureTarget.profile, captureTarget.pendingContext)
      }
      if (mapped.flush) writer.flushHint()
    },
    flush() {
      writer.flushHint()
    },
    async shutdown() {
      await syncGate.shutdown()
      return writer.shutdown()
    },
  }
  coordinator = new SessionTelemetryCoordinator(ctx, sink, {
    capture: "on-demand",
    includeHistory: true,
  })
  const schedule = sessionID => {
    syncGate.queue(sessionID, async target => {
      if (target.generation !== captureGeneration) return true
      const capacity = Math.max(0, resolved.queueLimit - writer.totalQueued - 1)
      if (capacity === 0) throw new Error("Upload queue is full")
      if (!policy().uploadDisconnectedHistory) {
        const pending = liveEvents.get(sessionID)
        if (!pending) return false
        captureTarget = target
        try {
          let processed = 0
          while (pending.length && processed < Math.min(64, capacity)) {
            const {session, event} = pending[0]
            coordinator.captureEvent(session, event)
            pending.shift()
            liveQueued--
            processed++
          }
        } finally { captureTarget = undefined }
        if (!pending.length) liveEvents.delete(sessionID)
        writer.flushHint()
        return pending.length > 0
      }
      let observation
      const live = ctx.sessions.get(sessionID)
      try {
        // Read-only cold observations do not acquire the Session writer lock.
        if (!live) observation = await ctx.sessionQuery.observeSession(sessionID, {projectionMode: "none"})
        // Admission and cold reads may finish after logout or a target switch.
        // Never enqueue their events or advance the new connection's cursor.
        if (target.generation !== captureGeneration) return true
        const session = live ?? {id: sessionID, header: observation.header, inheritedEventCount: observation.inheritedEventCount}
        const end = live?.seq ?? observation.cursor + 1
        const from = captured.get(sessionID) ?? 0
        const through = Math.min(end, from + Math.min(64, capacity))
        const events = live ? live.snapshotEvents(from, through) : observation.events.slice(from, through)
        captureTarget = target
        try {
          for (const event of events) {
            coordinator.captureEvent(session, event)
            captured.set(sessionID, event.seq + 1)
          }
        } finally {
          captureTarget = undefined
        }
        writer.flushHint()
        return through < end
      } finally { observation?.[Symbol.dispose]?.() }
    })
  }
  const adopt = session => {
    if (!policy().uploadDisconnectedHistory) return
    if (ctx.workspaceRegistry.list().some(workspace => workspace.sessionIds.includes(session.id))) schedule(session.id)
  }
  const scheduleAll = () => {
    if (!policy().uploadDisconnectedHistory) return
    const ids = new Set(ctx.workspaceRegistry.list().flatMap(workspace => workspace.sessionIds))
    for (const id of ids) schedule(id)
  }
  ctx.on("session/created", adopt)
  ctx.on("session/event", (session, event) => {
    const current = policy()
    if (current.uploadDisconnectedHistory) { adopt(session); return }
    if (!current.loggedIn || !ctx.workspaceRegistry.list().some(workspace => workspace.sessionIds.includes(session.id))) return
    // Keep the existing queue bound. Only eligible events can enter admission;
    // later login/retries never read the omitted local log prefix.
    if (liveQueued >= resolved.queueLimit) {
      ctx.get?.("loopHostService")?.setSessionUploadStatus?.(session.id, "failed")
      return
    }
    const pending = liveEvents.get(session.id) ?? []
    pending.push({session, event})
    liveEvents.set(session.id, pending)
    liveQueued++
    schedule(session.id)
  })
  ctx.on("session/flush", () => writer.flushHint())
  ctx.on("session/disposed", session => { adopt(session); writer.flushHint() })
  scheduleAll()
  let activeProfile = ""
  const bindHostSyncTarget = service => {
    if (service?.addServerProfileListener === undefined ||
        service?.currentSyncProfile === undefined) return () => {}
    const removeProfile = service.addServerProfileListener(profile => {
      if (typeof profile === "string" && profile !== "") {
        captureGeneration++
        writer.setActiveProfile(profile)
        captured.clear()
        if (activeProfile !== profile || policy().uploadDisconnectedHistory) {
          liveEvents.clear()
          liveQueued = 0
        }
        activeProfile = profile
        scheduleAll()
        for (const sessionID of liveEvents.keys()) schedule(sessionID)
        syncGate.retry()
      }
    })
    const removeSessions = service.addSessionInvalidationListener === undefined
      ? () => {}
      : service.addSessionInvalidationListener(sessionIds => {
          captureGeneration++
          for (const sessionID of sessionIds) {
            captured.delete(sessionID)
            liveQueued -= liveEvents.get(sessionID)?.length ?? 0
            liveEvents.delete(sessionID)
          }
          return writer.fenceSessions(sessionIds)
        })
    const generation = captureGeneration
    void service.currentSyncProfile().then(profile => {
      if (generation !== captureGeneration) return
      if (typeof profile === "string" && profile !== "") {
        activeProfile = profile
        writer.setActiveProfile(profile)
        scheduleAll()
      }
    }).catch(() => {})
    return () => {
      if (typeof removeProfile === "function") removeProfile()
      if (typeof removeSessions === "function") removeSessions()
    }
  }
  let unbindHostSyncTarget = () => {}
  const connectHostSyncTarget = injected => {
    const service = injected?.loopHostService ?? injected
    if (service === undefined) return
    unbindHostSyncTarget()
    unbindHostSyncTarget = bindHostSyncTarget(service)
  }
  const availableHostService = typeof ctx.get === "function"
    ? ctx.get("loopHostService")
    : undefined
  if (availableHostService !== undefined) {
    connectHostSyncTarget(availableHostService)
  } else if (typeof ctx.inject === "function") {
    ctx.inject(["loopHostService"], connectHostSyncTarget)
  }
  ctx.effect(() => () => unbindHostSyncTarget(), "loop-dsh-sync: server target")
}
