import path from "node:path"

export function resolveConfig(config) {
  const profile = String(config.profile ?? "").trim()
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(profile)) {
    throw new Error("loop-dsh-sync: profile is invalid")
  }
  const hostSyncHome = String(config.hostSyncHome ?? "").trim()
  const workspaceRoot = String(config.workspaceRoot ?? "").trim()
  if (!workspaceRoot) {
    throw new Error("loop-dsh-sync: workspaceRoot is required")
  }
  return {
    workspaceRoot: path.resolve(workspaceRoot),
    profile,
    hostSyncHome: hostSyncHome ? path.resolve(hostSyncHome) : "",
    clientSessionLabel: String(
      config.clientSessionLabel ?? "DeepSeek Harness"
    )
      .trim()
      .slice(0, 255),
    queueLimit: Number(config.queueLimit ?? 10000),
    shutdownTimeoutMs: Number(config.shutdownTimeoutMs ?? 60000),
  }
}
