# `@pingkai/loop-dsh`

Thin DeepSeek Harness (DSH) host plugin for Loop v2:

- **OAuth 2.1 + PKCE Bootstrap** (`/api/v1/auth/oauth/{register,authorize,token,bootstrap/context,bootstrap}`)
- **Headless / Desktop `loop daemon` Manager** (`~/.loop/run/daemon.json` single-instance discovery, configurable `loopServerUrl` & `loopBinaryPath`, automatic SHA-256-verified `~/.loop/bin/loop` download, `loop connect`, `loop upgrade`)
- **Attached `deepseek-harness` Runtime Bridge** (`ws://127.0.0.1:<port>/api/internal/runtimes/deepseek-harness/attach` with `X-Loop-Control-Token`)
- **Bidirectional Session Sync** (`POST /api/internal/runtimes/deepseek-harness/{bindings,local-turns}` with `synced` / `local_only` session controls and echo suppression)
