import {createHash} from "node:crypto"
import {isIP} from "node:net"

export const WORKSITE_ORIGIN_NAMESPACE = "loop-worksite-origin-v1"

export function worksiteOrigin(installationId, parentDomain, scheme = "https") {
  const installation = String(installationId ?? "").trim()
  const parent = String(parentDomain ?? "").trim()
  if (installation === "" || parent === "") {
    throw new Error("worksite installation and parent domain are required")
  }
  if (scheme !== "http" && scheme !== "https") {
    throw new Error("worksite scheme must be http or https")
  }
  let parsed
  try {
    parsed = new URL(`${scheme}://${parent}`)
  } catch {
    throw new Error("worksite parent domain must be an absolute authority")
  }
  if (parsed.username || parsed.password || parsed.pathname !== "/" ||
      parsed.search || parsed.hash || !parsed.hostname.includes(".") ||
      parsed.hostname.startsWith(".") || parsed.hostname.includes("*") ||
      isIP(parsed.hostname) !== 0) {
    throw new Error("worksite parent domain must be a concrete DNS parent authority")
  }
  const label = createHash("sha256")
    .update(`${WORKSITE_ORIGIN_NAMESPACE}\0${installation}`)
    .digest("hex")
    .slice(0, 32)
  return new URL(`${scheme}://${label}.${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}/`)
}
