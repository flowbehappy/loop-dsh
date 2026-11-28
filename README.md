# Loop for DeepSeek Harness (`@pingkai/loop-dsh`)

`@pingkai/loop-dsh` integrates DeepSeek Harness (DSH) natively into Loop's unified **Machine + `loop daemon` + Attached `deepseek-harness` Runtime + Standard `Agent`** architecture.

## End-to-End Flow

1. **Install Plugin**: Install `loop-dsh.tgz` into DSH (`dsh plugin --profile desktop add ./loop-dsh.tgz` or via DSH Settings -> Plugins). Zero native C/C++ addons (`koffi` is no longer required).
2. **Configure & Sign In via OAuth 2.1 + PKCE**: Configure your Loop Server URL (`loopServerUrl`) and run OAuth login (`loop-dsh login --server-url https://loop.example.com` or `ctx.loopDsh.loginAndBootstrap(...)`).
3. **Provision / Reuse Headless `loop daemon`**:
   - Reuses an already-running local Loop Desktop or `loop daemon` instance via `~/.loop/run/daemon.json` when present;
   - Otherwise resolves `~/.loop/bin/loop` (or `loopBinaryPath` override), automatically downloading and SHA-256-verifying the platform headless CLI archive from Loop Server when `autoDownloadBinary` is enabled, and starts `loop daemon`.
4. **Join Workspace Machine & Provision Standard Agent**:
   - Exchanges `/api/v1/auth/oauth/bootstrap` to provision or reuse your workspace `Machine` (`connectToken`) and standard `deepseek-harness` `Agent` (including native `isSuperAgent` support), then runs `loop connect`.
5. **Attach `deepseek-harness` Runtime & Bidirectional Session Sync**:
   - Attaches to `ws://127.0.0.1:<port>/api/internal/runtimes/deepseek-harness/attach` using `X-Loop-Control-Token` so Loop dispatches agent turns directly into live DSH sessions with `LOOP_EXEC_*` and Loop MCP injected;
   - Syncs local DSH user/assistant turns to `/api/internal/runtimes/deepseek-harness/local-turns` with Origin Fencing (preventing self-echo wakes while still waking `@`-mentioned teammates) and per-session `synced` / `local_only` mode controls.

## CLI Usage

```bash
# Configure Loop server URL and optional binary override
npx loop-dsh configure --server-url https://loop.example.com

# Authenticate via OAuth PKCE, bootstrap Machine + Agent, and start/connect loop daemon
npx loop-dsh login --server-url https://loop.example.com

# Inspect current plugin, daemon, and runtime attachment status
npx loop-dsh status

# Toggle local-only privacy mode for a specific DSH session
npx loop-dsh sync-mode --session session-1234 --mode local_only

# Self-upgrade headless loop daemon binary
npx loop-dsh upgrade
```

## Development & Verification

```bash
npm run bootstrap
npm run check
npm test
```

When `/tmp/loop-headless` (or `LOOP_HEADLESS_BIN`) is present on the host, `npm test` also executes a full end-to-end integration test covering SHA-256 headless archive auto-download, real `loop daemon` startup, WebSocket `/api/internal/runtimes/deepseek-harness/attach`, and session binding / local-turn sync.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
