import {build} from 'esbuild'
import {fileURLToPath} from 'node:url'
await build({
  entryPoints: ['plugin.ts','adapter.ts'].map(name=>fileURLToPath(new URL(name, import.meta.url))),
  outdir: fileURLToPath(new URL('./dist/', import.meta.url)),
  outExtension: {'.js':'.mjs'},
  bundle: true,
  external: ["koffi", "ws"],
  platform: 'node',
  format: 'esm',
  target: 'node22.19',
  sourcemap: true,
})
