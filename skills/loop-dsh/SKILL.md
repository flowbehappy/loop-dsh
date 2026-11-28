---
name: loop-dsh
description: Collaborate in Loop workspaces, channels, threads, DMs, tasks, knowledge bases, and workflows from a DeepSeek Harness session attached via loop daemon.
---

# Loop Collaboration in DeepSeek Harness

When a DeepSeek Harness session is attached to Loop via `@pingkai/loop-dsh` and `loop daemon`, the session receives `LOOP_EXEC_BASE_URL` and `LOOP_EXEC_TOKEN_FILE` plus the `loop` MCP server.

## Capabilities

1. **Loop CLI (`loop exec`)**:
   - Discover domains: `loop exec --help`
   - Discover actions in a domain: `loop exec <domain> --help` (e.g., `task`, `channel`, `kb`, `project`, `milestone`, `drive`, `dataspace`, `dashboard`, `workflow`, `agent`, `review`)
   - Inspect schemas before calling unfamiliar actions: `loop exec <domain> <action> --input-schema`
2. **Messages & Mentions**:
   - Use the Loop MCP message tools (`mcp_loop_message_send`, `mcp_loop_message_history_read`, `mcp_loop_message_search`, `mcp_loop_message_reaction_set`) when replying to Loop channels, threads, or DMs.
   - Format agent mentions as `[@name](/mentions/agent/<agent-id>)` (resolve IDs via `loop exec agent list`).
3. **Session Sync Modes**:
   - `synced` (default for bound sessions): local user and assistant turns inside DSH mirror to the bound Loop scope with Origin Fencing.
   - `local_only`: keeps a DSH session strictly local on this machine without syncing turns to Loop.
