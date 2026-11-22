import {checkWindowsPath} from "./private-path.mjs"
import {createHash, randomUUID} from "node:crypto"
import {linkSync, lstatSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync} from "node:fs"
import {dirname, isAbsolute, join, relative} from "node:path"
import {fileURLToPath} from "node:url"

export const name = "loop-managed-config"
export const inject = ["profileContext"]


function privateDirectory(path) {
  if (process.platform === "win32") { checkWindowsPath(path, true); return realpathSync(path) }
  mkdirSync(path, {recursive: true, mode: 0o700})
  const info = lstatSync(path)
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) || info.uid !== process.getuid()) {
    throw new Error("Loop plugin data directory is not private")
  }
  return realpathSync(path)
}

export function resolveManagedConfig(profile, packageRoot = dirname(fileURLToPath(import.meta.url))) {
  if (!profile || !["web", "desktop"].includes(profile.name) || !isAbsolute(profile.home)) {
    throw new Error("Loop requires an official DSH Web or Desktop profile")
  }
  const root = privateDirectory(join(realpathSync(profile.home), "loop-plugin"))
  const identityPath = join(root, "installation-id")
  const temporary = identityPath + "." + randomUUID()
  writeFileSync(temporary, randomUUID() + "\n", {flag: "wx", mode: 0o600})
  try { linkSync(temporary, identityPath) }
  catch (error) { if (error.code !== "EEXIST") throw error }
  finally { unlinkSync(temporary) }
  const info = lstatSync(identityPath)
  if (!info.isFile() || info.isSymbolicLink() || (process.platform !== "win32" && ((info.mode & 0o077) || info.uid !== process.getuid()))) {
    throw new Error("Loop installation identity is not private")
  }
  if (process.platform === "win32") checkWindowsPath(identityPath)
  const installationId = readFileSync(identityPath, "utf8").trim()
  if (!/^[a-f0-9-]{36}$/.test(installationId)) throw new Error("Invalid Loop installation identity")
  const syncHome = privateDirectory(join(root, "sync"))
  return Object.freeze({
    root, installationId, kind: profile.name,
    stateHome: privateDirectory(join(root, "host")),
    actionsHome: privateDirectory(join(root, "actions")),
    syncHome,
    syncProfile: "loop-" + createHash("sha256").update(installationId).digest("hex").slice(0, 24),
    packageRoot: realpathSync(packageRoot),
    workerRoot: privateDirectory(join(root, "workers")),
    // Inbound workers are disabled. Outgoing sync resolves each actual
    // session workspace through the existing Host service.
    workspaceRoot: privateDirectory(join(root, "sync-default")),
  })
}

export function assertManagedWorkspace(config, workspace) {
  for (const protectedPath of [config.root, config.packageRoot]) {
    const path = realpathSync(workspace)
    const rel = relative(path, protectedPath).replaceAll("\\", "/")
    if (rel === "" || (!rel.startsWith("../") && rel !== ".." && !isAbsolute(rel))) {
      throw new Error("The Loop plugin installation and login data must be outside the workspace")
    }
  }
}

export function apply(ctx) {
  ctx.provide("loopManagedConfig", resolveManagedConfig(ctx.profileContext))
}
