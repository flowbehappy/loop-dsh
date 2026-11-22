import {spawnSync} from "node:child_process"
import {chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join, resolve} from "node:path"
import {createRequire} from "node:module"

const root = resolve(import.meta.dirname, "..")
const out = join(root, "client.js")
const work = mkdtempSync(join(tmpdir(), "loop-proxy-dsh-client-"))
try {
  const output = join(work, "client.cjs")
  const require = createRequire(import.meta.url)
  const cli = process.env.ESBUILD_BIN || require.resolve("esbuild/bin/esbuild")
  // npm can replace the Unix launcher with the native esbuild executable.
  const useNodeLauncher = process.platform === "win32" && !process.env.ESBUILD_BIN
  const esbuild = useNodeLauncher ? process.execPath : cli
  const launcher = useNodeLauncher ? [cli] : []
  const args = []
  args.push(
    join(root, "client", "index.ts"),
    "--bundle",
    "--format=cjs",
    "--platform=browser",
    "--target=es2022",
    "--jsx=automatic",
    "--loader:.css=local-css",
    "--external:react",
    "--external:react/jsx-runtime",
    "--external:react-dom",
    "--external:react-dom/client",
    "--external:@deepseek-ai/cordis",
    "--external:@deepseek-ai/dsh-client-store",
    "--external:@deepseek-ai/dsh-client-ui-slots",
    "--external:@deepseek-ai/dsh-client-ui-primitives",
    "--external:@deepseek-ai/dsh-client-ui-dockkit",
    `--outfile=${output}`,
  )
  const result = spawnSync(esbuild, [...launcher, ...args], {cwd: root, encoding: "utf8", windowsHide: true})
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "esbuild failed")
  const body = readFileSync(output, "utf8")
  const css = readFileSync(join(work, "client.css"), "utf8")
  const bundle = `window.__ModuleLoader__.load({
  id: "@pingkai/loop-dsh",
  factory: (require) => {
    const styleID = "loop-proxy-dsh-client";
    if (document.querySelector("style[data-loop-proxy-dsh]") === null) {
      const style = document.createElement("style");
      style.id = styleID;
      style.dataset.loopProxyDsh = "";
      style.textContent = ${JSON.stringify(css)};
      document.head.append(style);
    }
    const module = {exports: {}};
    const exports = module.exports;
${indent(body, 4)}
    return module.exports;
  },
});
`
  writeFileSync(out, bundle, {mode: 0o644})
  chmodSync(out, 0o644)
} finally {
  rmSync(work, {recursive: true, force: true})
}

function indent(value, spaces) {
  const prefix = " ".repeat(spaces)
  return value.split("\n").map(line => line === "" ? line : prefix + line).join("\n")
}
