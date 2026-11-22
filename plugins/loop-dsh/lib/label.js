import { createHash } from "node:crypto"

export function bridgeSessionLabel(base, externalSessionID) {
  const label = String(base ?? "DeepSeek Harness").trim().slice(0, 230)
  const suffix = createHash("sha256")
    .update(String(externalSessionID ?? ""))
    .digest("hex")
    .slice(0, 16)
  return `${label || "DeepSeek Harness"} ${suffix}`
}
