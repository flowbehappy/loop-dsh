# Host-native TypeScript backend

This implements the single-process migration using DSH's official credential
provider. The managed entry and standalone managed package builder now select
`NativeHostActions`. The native adapter is the only Host action implementation
in this repository.

Implemented and tested:

- Official credential records, generation fencing, cross-process refresh
  coordination and persisted unknown refresh outcomes. The provider does not
  promise fsync; this is not a power-loss guarantee.
- OAuth discovery, DCR, PKCE, bounded callback listeners and cancellation.
- Account/session identity checks, one-time page launch and private page cookies.
- Exact-grant disconnect intent, normal-call fencing, confirmation, receipt
  reconciliation after lost create/execute responses, and local invalidation.
- Model catalogs, bounded concurrent model leases, in-process streaming bridge,
  header sanitation, cancellation and cleanup.
- Go-compatible lossless JSON encoding, v1 outbox files and native kernel locks;
  durable capture, idempotent batch upload, stop/resume boundaries, admitted
  outbox restart discovery and a native telemetry writer. The managed sync entry injects the native writer factory.
- Existing Host facade integration for login, pages, models, actions, knowledge,
  skills and local-workspace synchronization. Project access is checked using
  the Agent's public API; the retired Human `/agent-grants` endpoint is not used.
- Catalog WebSocket identity checks, bounded frames, snapshot notifications,
  ACK cursors, reconnect and disposal.
- Collaboration binding, directory, accepted intents, task actions, durable
  idempotency ledger, uncertain-outcome reconciliation, archived late results,
  exact-task continuations, inbox acceptance and paginated snapshot recovery.
  Original Go v1 state is backed up before upgrading to v2. Live collaboration
  streams use private authentication and persist events before ACK.
- Native Worksite HTTP/WebSocket streaming over yamux, private DSH cookies,
  callback routing, Host registration and lifecycle cleanup. The transport
  interoperates with the Go peer; full remote Host acceptance remains open.
- Native ESM bundles for the backend plugin and Host action adapter.

Current validation boundaries:

- Unified Host login is supported. Old Go/keychain credentials and separately
  configured Human/Agent policies are not silently imported or broadened.
  See `../README.native.md` for the explicit upgrade and rollback boundary.
- Home proof import, offline Worksite reconnect and remote OAuth callback
  transport are covered. A real Loop Worksite edge now also proxies the official DSH Host in the
  headless test, exchanges a launch ticket, completes remote OAuth after an
  Agent-grant revoke, and verifies remote-access revocation on full logout.
- Management authorization, message subscriptions, exact subscription read
  windows, archived action receipts and bounded-ledger retention are covered.
  At the inbox cap, only the oldest terminal discussion, Task message or Task
  input failure is evicted; pending, reconcile and unknown work is retained
  with the delivery cursor and duplicate-identity checks unchanged.
- Server-confirmed account disconnect fences writers, clears its own bindings
  and removes its exact outbox files, and retains the receipt if local cleanup
  fails. A generation-only logout cannot consume the disconnect tombstone; the
  full logout must present the same operation and completed receipt.
  Login, model revocation and full logout share one connection-operation owner.
  Full logout is claimed before the first adapter await and preempts model
  revocation. Model revocation atomically saves an inert disconnect-recovery
  credential in the signed-out provider record. Normal token reads cannot use
  it; full disconnect alone turns it directly into a frozen operation. This
  survives provider commit acknowledgement loss and runtime restart. A new
  authorized login replaces the recovery record; old generations cannot return.
- Sync upload failures are transient UI state. A successful retry or a fenced
  old generation clears that cache and status reads the durable outbox again;
  a successful manual retry clears it immediately and reports the real queue.
- Explicitly enabling sync may archive an orphan left by a prior completed
  logout. Only intact v1 `stopped` state with an empty queue and a non-current
  connection is isolated under the private `legacy` directory. Active, pending
  or unknown state is never migrated, and the archive is not resumed or
  uploaded by the new account.
- The native managed package boots in official DSH, completes real Loop OAuth,
  queries its model catalog, runs a streamed model response through Loop and
  saves the assistant output in a real DSH session, then disconnects.
- The upstream in that E2E is deterministic. This verifies the integration
  protocol, not the quality of a remote model. Each release must record
  Windows/Linux and Desktop GUI acceptance separately.

## Checks

```sh
npm --prefix plugins/loop-proxy-dsh run check:backend
npm --prefix plugins/loop-proxy-dsh run build:backend
npm --prefix plugins/loop-proxy-dsh run test:backend
npm --prefix plugins/loop-proxy-dsh test
```

Real Loop tests require an explicitly supplied isolated Test Hub. They never
infer daily credentials or database configuration. The tests register synthetic
users, complete real OAuth and exercise the production Host facade with the
native adapter. Set `LOOP_TS_E2E_BUNDLE=1` to exercise the built adapter:

```sh
LOOP_TS_E2E_BASE_URL=http://127.0.0.1:PORT LOOP_TS_E2E_BUNDLE=1 \
  node --test plugins/loop-proxy-dsh/test/native-real-loop.test.mjs
```

The Test Hub must mount the real Host registration route for that check. The
stock `loop-e2e-server` currently omits this route; the current local acceptance
uses a build overlay to add the real handler without changing Loop source.

The full DSH test requires an explicitly installed isolated official runtime:

```sh
LOOP_TS_E2E_DSH_BIN=/absolute/isolated/node_modules/@deepseek-ai/dsh/lib/bin.js \
LOOP_TS_E2E_BASE_URL=http://127.0.0.1:PORT \
  node --test plugins/loop-proxy-dsh/test/native-dsh-runtime.test.mjs
```

Set `LOOP_TS_E2E_WORKSITE_PARENT=worksite.loop.localhost:PORT` to include
Worksite. The isolated Test Hub must mount the real Worksite service and edge
with a same-site localhost management origin. The fixture uses real DNS for
`.localhost` and does not patch DSH networking.

Its deterministic local model requires a Test Hub-only HTTP transport restricted
exactly to loopback. Production's guarded egress client is unchanged. Without
that fixture the server correctly rejects the loopback model. The test creates
its own DSH home, registers synthetic Loop users, strips inherited model keys,
and disposes its DSH process. `LOOP_TS_E2E_KEEP=1` retains its private temporary
artifacts for diagnostics; do not publish the retained credential files.

Set `LOOP_TS_E2E_INSTALL_PACKAGE=1` for the official-runtime E2E to build a fresh
npm tarball and install it with `dsh plugin --profile web add`, without manually
linking plugin dependencies. The test reports the installation mode and exact
Worksite branch completion using non-sensitive diagnostic markers.
