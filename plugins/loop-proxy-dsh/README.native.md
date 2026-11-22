# Loop plugin for official DSH

This package runs the Loop Host adapter inside the official DSH process. It
contains JavaScript, client assets and skills, with no Go helper executable.
DSH owns the credential provider and plugin lifecycle. This uses the same trust
boundary as other installed DSH plugins; it does not claim isolation from code
running with the same user's filesystem permissions.

## Build and install

Build from a checkout whose plugin development dependencies are installed:

```sh
node plugins/loop-proxy-dsh/build-native.mjs /absolute/new/package
```

On macOS/Linux, `build-managed.sh /absolute/new/package` also produces
`/absolute/new/package.tgz`. It no longer needs Go, signing identities or hashes
of a particular DSH installation. The JavaScript builder also runs on Windows;
package its output using `npm pack` in the output directory.

Install the package with the official DSH plugin manager:

```sh
dsh plugin --profile web add /absolute/new/package.tgz
```

For Desktop, use the official Desktop installation's plugin-management command
and its `desktop` profile. Use the official DSH version supported by this
package's peer dependencies. No changes to DSH source are required.

Open Loop in DSH and sign in. Workspace binding, Agent permissions, conversation
upload consent and collaboration intent remain separate controls. Model calls
use short-lived Loop sessions; long-lived OAuth credentials are not returned
to the UI or model tools.

A new Session can check its collaboration status before the Host device is
registered. The status check does not register a device. Preparing approved
collaborators or managing topic subscriptions can then bind the Session to its
saved channel. An authorization error on an existing binding is not permission
to create a new one. If a directory or status read fails, the same user turn
can recheck the same collaborators on the same connection and channel. It
cannot switch recipients or repeat a binding or intent write with an unknown
outcome. Restoring the same channel may also finish a subscription requested
in the current user turn. It does not restore an old subscription, move the
request to another account or channel, or carry over earlier Task authority.

The initial dispatch window does not shorten the management of a Task that
already has a receipt. Starting another selection keeps that receipt and any
record ending its management; it does not renew the original dispatch window.
When one instruction follows up several Tasks, each follow-up uses only the
recipient recorded for that Task.

## Upgrade and rollback

Keep the previous plugin artifact and the existing DSH home. The installation
identity is retained. Existing private Home proofs are imported into DSH's
credential provider without deleting the old proof. Collaboration v1 state is
backed up before v2 migration; outbox state uses the existing v1 layout and
kernel-lock protocol.

The native package does not copy credentials from the old Go/keychain
connector or pretend that an old grant is a new native connection. Sign in to
establish the native connection and review Workspace bindings. Old connector
grants remain available for rollback until explicitly revoked in Loop. Do not
remove the old home or its state as part of installing this package.

Workspace sync compares the saved server, account, Loop workspace, Agent and
channel with the current connection. The plugin automatically reconciles old Go channel records,
replaced connection owners, and missing native records during workspace sync
or when an action detects a stale route.
The plugin checks the current grant and asks Loop to resolve the installation
and local workspace to the original channel. Loop's ensure operation may create
a mapping if one disappeared. A different channel, Agent or pending disconnect
blocks recovery. A retry verifies ownership again before completing the repair.

Verified recovery permits previously captured sessions with the verified route
to use that channel for new actions. Upload consent stays on its original
revision, and earlier collaboration intents are invalidated. Start a new session
to use automatic upload. Sessions without a verifiable prior route retain their
existing restrictions. Preparing collaboration and reading a saved action context
check native ownership before returning the route.

The managed native entry uses the unified Host login. The repository ships only
the native plugin. An explicitly configured legacy authorization policy is
rejected by the native entry rather than ignored.
Describe the task normally. If the assistant lacks permission and Loop supports personal authorization for that action, the assistant asks for your approval in the same conversation. Select Review in Loop in the conversation, then review the exact scope, expiry and reuse in the browser. The originating task receives the decision automatically. Manage existing grants in Loop account settings. Business management and installed App actions retain separate authorization.

## Validation

See `backend/README.md` in the source checkout for the headless E2E commands and
coverage boundaries. A model E2E uses a deterministic upstream, the real Loop
server, the official DSH runtime and persisted session output. Protocol tests
and macOS headless tests do not establish Windows/Linux or Desktop GUI
acceptance.
