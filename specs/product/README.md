# Product Flow: Loop for DeepSeek Harness

## User Journey

1. **Install `@pingkai/loop-dsh`**: Install `loop-dsh.tgz` in DeepSeek Harness without native compilation scripts.
2. **Set Loop Server & Sign In**: Provide `loopServerUrl` (e.g., `https://loop.pingcap.cn`), authorize workspace access in the browser via OAuth PKCE, and let the plugin automatically set up `loop daemon`, join the `Machine`, and bind your `deepseek-harness` `Agent` (including Super Agent mode).
3. **Collaborate Across Loop & DSH**:
   - Mention or DM the Agent in Loop channels, threads, DMs, or Tasks — turns stream live in the bound DSH session with full `loop exec` and MCP capabilities.
   - Chat directly in DSH — synced sessions (`syncMode = "synced"`) mirror into the bound Loop scope; private scratch sessions can switch to `syncMode = "local_only"` at any time.
4. **Upgrade Seamlessly**: Run `loop upgrade` (or `loop-dsh upgrade`) to self-update `~/.loop/bin/loop` across Linux, macOS, and Windows.
