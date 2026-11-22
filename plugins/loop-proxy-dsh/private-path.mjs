import {execFileSync} from "node:child_process"
import {join} from "node:path"
import {fileURLToPath} from "node:url"

export function checkWindowsPath(path, create = false) {
  const shell = join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
  execFileSync(shell, ["-NoProfile", "-NonInteractive", "-File", fileURLToPath(new URL("./private-path.ps1", import.meta.url)), "-Path", path, ...(create ? ["-CreateDirectory"] : [])], {windowsHide:true, stdio:"pipe"})
}
