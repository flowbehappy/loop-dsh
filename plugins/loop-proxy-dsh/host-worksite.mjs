// Registers the current live DSH Web Host with the trusted Loop worksite relay.
// The process token only crosses the plugin-to-helper private channel.
import {randomBytes} from "node:crypto"

export const name = "loop-proxy-dsh-worksite"
export const inject = ["webApp", "webServer", "connection", "loopHostActions"]

const RETRY_MIN_MS = 1_000
const RETRY_MAX_MS = 30_000

function worksiteURL(value) {
  let parsed
  try {
    parsed = new URL(String(value ?? "").trim())
  } catch {
    throw new Error("DSH_LOOP_PROXY_WORKSITE_URL must be an absolute URL")
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password ||
      parsed.search || parsed.hash || parsed.pathname !== "/") {
    throw new Error("DSH_LOOP_PROXY_WORKSITE_URL must be an absolute HTTP(S) origin")
  }
  return parsed.href
}

export function apply(ctx, config = {}) {
  const url = worksiteURL(config.worksiteUrl ?? process.env.DSH_LOOP_PROXY_WORKSITE_URL)
  const publicOrigin = new URL(url).origin
  const hostGeneration = randomBytes(16).toString("hex")
  const actions = ctx.loopHostActions
  const input = Object.freeze({
    worksiteUrl: url,
    webServerOrigin: ctx.webServer.getOrigin(),
    authenticatedUrl: ctx.connection.authenticatedUrl(url),
    publicOrigin,
    hostGeneration,
    hostKind: String(config.hostKind ?? "web") === "desktop" ? "desktop" : "web",
  })
  const abort = new AbortController()
  let timer
  let stopped = false
  let attempt = 0
  let lastError = ""

  const schedule = () => {
    if (stopped) return
    const delay = Math.min(RETRY_MAX_MS, RETRY_MIN_MS * (2 ** Math.min(attempt, 5)))
    attempt++
    timer = setTimeout(run, delay)
    timer.unref?.()
  }
  const run = async () => {
    if (stopped) return
    try {
      await actions.worksiteStart(input, abort.signal)
      return
    } catch (error) {
      if (stopped || abort.signal.aborted) return
      const detail = String(error?.message ?? error).replace(/\s+/gu, " ").slice(0, 256)
      if (detail !== lastError) {
        lastError = detail
        console.warn(`loop-proxy worksite start failed: ${detail}`)
      }
      schedule()
    }
  }

  ctx.on("dispose", () => {
    stopped = true
    clearTimeout(timer)
    abort.abort()
    void actions.worksiteStop({}, AbortSignal.timeout(2_000)).catch(() => {})
  })
  void run()
}
