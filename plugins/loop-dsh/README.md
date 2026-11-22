# Loop conversation capture

This module is bundled into the native Loop plugin. It reads official DSH Session telemetry and delegates durable capture to `loopNativeSyncWriterFactory`; it cannot spawn or fall back to an external helper.

Only visible Human/Agent text, safe attachment placeholders, tool lifecycle status and allowed Loop resource identifiers are mapped. Hidden reasoning, raw tool arguments/results, local paths, file bytes and credentials are excluded.

Capture requires the exact Session upload state and current Workspace mapping. The default captures only events observed while signed in; history replay requires explicit opt-in. Late admission and cold history reads are fenced when the account, connection or Session changes. The native writer pins each queued event to its original profile and persists before upload.

Install the full plugin using the [native package instructions](../loop-proxy-dsh/README.native.md). This module is not a standalone CLI package. Run `npm test` and `npm run check` from the repository root. Sync tests cover mapping and admission; native writer, account-switch and real telemetry journeys are under `plugins/loop-proxy-dsh/test`.
