/**
 * One background admission/capture job per Session, never one Promise per
 * telemetry event. The canonical local log is the retry source.
 */
export class SessionSyncGate {
  constructor(target, logger = {warn() {}}, options = {}) {
    this.target = target
    this.logger = logger
    this.retryMin = options.retryMin ?? 1000
    this.retryMax = options.retryMax ?? 60000
    this.onStatus = options.onStatus ?? (() => {})
    this.jobs = new Map()
    this.timer = null
    this.active = null
    this.closed = false
  }

  queue(sessionID, capture) {
    if (this.closed) return
    const existing = this.jobs.get(sessionID)
    if (existing) {
      existing.capture = capture
      existing.dirty = true
    } else {
      this.jobs.set(sessionID, {capture, due: 0, delay: this.retryMin, dirty: true})
    }
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.wake()
  }

  wake() {
    if (this.closed || this.active || this.timer || this.jobs.size === 0) return
    let due = Infinity
    for (const job of this.jobs.values()) due = Math.min(due, job.due)
    // Always yield to local UI/Session listeners before reading or copying logs.
    this.timer = setTimeout(() => {
      this.timer = null
      this.active = this.run().finally(() => {
        this.active = null
        this.wake()
      })
    }, Math.max(0, due - Date.now()))
    this.timer.unref?.()
  }

  async run() {
    let entry
    const now = Date.now()
    for (const candidate of this.jobs) {
      if (candidate[1].due <= now) { entry = candidate; break }
    }
    if (!entry || this.closed) return
    const [sessionID, job] = entry
    job.dirty = false
    try {
      const target = await this.target(sessionID)
      if (!target) throw new Error("Upload is not ready")
      if (this.closed) return
      if (target.state === "off") {
        if (!job.dirty) this.jobs.delete(sessionID)
        this.onStatus(sessionID, "idle")
        return
      }
      this.onStatus(sessionID, "uploading")
      const more = await job.capture(target)
      if (this.closed) return
      if (more === true || job.dirty) {
        // Move to the tail so a long history cannot starve other Sessions.
        this.jobs.delete(sessionID)
        this.jobs.set(sessionID, {...job, due: 0, delay: this.retryMin})
      } else {
        this.jobs.delete(sessionID)
        this.onStatus(sessionID, "queued")
      }
    } catch (error) {
      if (this.closed) return
      this.onStatus(sessionID, "failed")
      if (job.delay === this.retryMin) {
        this.logger.warn("loop-dsh-sync: background upload paused; local use is unaffected")
      }
      job.due = Date.now() + job.delay
      job.delay = Math.min(job.delay * 2, this.retryMax)
    }
  }

  retry() {
    if (this.closed) return
    for (const job of this.jobs.values()) job.due = 0
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.wake()
  }

  async shutdown() {
    this.closed = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.jobs.clear()
    await this.active
  }
}
