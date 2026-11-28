# Architecture: Unified Machine + Attached `deepseek-harness` Runtime

## Overview

`@pingkai/loop-dsh` v2 eliminates all standalone external-agent protocols, yamux reverse tunnels, and native credential FFI modules. Instead, a DSH host participates in Loop as a standard workspace `Machine` running `loop daemon`, with `@pingkai/loop-dsh` acting as a thin local runtime bridge:

1. **OAuth 2.1 + PKCE Bootstrap (`/api/v1/auth/oauth/*`)**:
   - Public client registration (`/register`), S256 PKCE browser consent (`/authorize`), form-urlencoded code exchange (`/token`), workspace discovery (`/bootstrap/context`), and idempotent `Machine` + `Agent` provisioning (`/bootstrap`).
2. **Single-Instance Local Daemon (`~/.loop/run/daemon.json`)**:
   - Discovers and reuses an existing Loop Desktop or CLI `loop daemon` via `~/.loop/run/daemon.json`.
   - Automatically downloads and verifies (`SHA-256`) the standalone headless CLI archive (`loop` / `loop.exe`) into `~/.loop/bin/` when missing and `autoDownloadBinary` is enabled.
   - Strips inherited `LOOP_EXEC_*`, `LOOP_AGENT_*`, `LOOP_MCP_*`, and `LOOP_HARNESS_*` environment variables when invoking `loop` host commands.
3. **Daemon-Internal Runtime Bridge (`/api/internal/runtimes/deepseek-harness/*`)**:
   - Authenticates exclusively with `X-Loop-Control-Token` over loopback without a browser `Origin` header.
   - Multiplexes JSON-RPC 2.0 session streams (`initialize`, `session/open`, `session/prompt`, `session/interrupt`, `session/cancel`, `session/input-status`, `shutdown`) and contiguous-sequence session notifications (`session.status`, `session.event`, `session.input-surfaced`) over `/attach`.
4. **Bidirectional Session Sync & Echo Prevention**:
   - Loop-dispatched turns carry `source.kind = "loop-runtime"` so the local session listener never re-uploads them to `/local-turns`.
   - Local human turns inside DSH forward to `POST /api/internal/runtimes/deepseek-harness/local-turns`, which stamps `OriginAgentFenceID` upstream so Loop records the conversation and wakes `@`-mentioned collaborators without re-waking the originating DSH agent.
