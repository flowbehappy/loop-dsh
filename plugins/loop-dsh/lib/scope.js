import path from "node:path"

export function sessionInWorkspace(session, workspaceRoot) {
  const cwd = String(session?.header?.cwd ?? "").trim()
  const root = String(workspaceRoot ?? "").trim()
  if (!cwd || !root) return false
  return path.resolve(cwd) === path.resolve(root)
}
