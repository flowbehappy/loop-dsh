# AGENTS.md

- DeepSeek Harness (DSH) host source is never modified; all integration lives in the `@pingkai/loop-dsh` plugin.
- Unified Loop architecture: installing `@pingkai/loop-dsh` authenticates via OAuth 2.1 + PKCE, installs or reuses the local headless/desktop `loop daemon`, joins the host as a standard workspace `Machine`, attaches DSH as the local `deepseek-harness` `Runtime` (`/api/internal/runtimes/deepseek-harness/*`), and registers a standard workspace `Agent` (including native `isSuperAgent`).
- Never reintroduce parallel external-agent tables, yamux action tunnels, or native FFI (`koffi`) credential sidecars; `loop daemon` owns server transport, credentials, `loop exec`, and MCP gateways.
- Always strip inherited `LOOP_EXEC_*`, `LOOP_AGENT_*`, `LOOP_MCP_*`, and `LOOP_HARNESS_*` variables before spawning `loop daemon`, `loop connect`, or `loop upgrade`.
- Verify changes with `npm run check` and `npm test` (including headless `loop daemon` integration tests when `LOOP_HEADLESS_BIN` or `/tmp/loop-headless` is present).
