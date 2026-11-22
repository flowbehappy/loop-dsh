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

See [Workspace recovery and upload consent](README.native.md#upgrade-and-rollback) for the checks and confirmation flow after a connection changes.

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

### Resource links in DSH

Once the embedded Loop page session is ready, ordinary clicks on HTTP(S) resource
links for the configured Loop installation open the owning Loop panel. The plugin
reuses the module route map and the existing authenticated page bridge, preserving
the workspace, detail path, query and fragment without reloading the iframe.
This applies to native anchors across DSH, including Markdown and source cards;
no message text or individual resource ID is rewritten. The configured origin,
port and any base path must match. Loop still checks resource access normally.

The plugin registers one capture listener through its lifecycle because the
supported DSH host has no public link-handler registry. Disabling it removes the
listener. It does not patch DSH, replace browser APIs, or inspect other frames.
Unknown routes, other installations, downloads, modified/middle clicks and links
clicked before the page session is ready retain DSH's original behavior. Browser
context-menu actions remain available. Links opened by code rather than anchors
are outside this click integration.

### Embedded page capabilities

All Loop modules share one iframe policy. Each capability below is delegated
only to the iframe's `src` origin, including after same-origin module navigation.
Navigation to an unrelated origin does not inherit the delegation. This enables
the page to request a capability; it does not grant browser/OS consent or bypass
secure-context, user-activation or ancestor policy checks.

| Capability | Purpose |
| --- | --- |
| `clipboard-write` | Copy links, text and images across modules |
| `clipboard-read` | Monaco editor menu paste and browser-supported clipboard reads |
| `fullscreen` | Fullscreen video previews and page presentations |
| `autoplay` | Media playback, subject to browser autoplay rules |
| `picture-in-picture` | Native video picture-in-picture controls |
| `web-share` | Allow native system sharing when a module offers it; no new share UI is added |

The existing sandbox already permits scripts, same-origin page identity/storage,
forms, downloads, modals (including print), popups, external popup pages and
user-activated storage-access requests. It still does not permit the embedded
page to replace DSH's top-level window. Camera, microphone, display capture,
location and device APIs have no current Loop call sites and are not added.
Untrusted nested previews retain their own sandbox and permission boundaries.

Not every browser restriction has an iframe permission token. Cross-origin
notification permission prompts and File System Access file/directory pickers
cannot be enabled by this policy. They need a top-level Loop flow or a supported
fallback such as ordinary file inputs; this plugin change does not implement
those application flows. See the [File System Access security model](https://wicg.github.io/file-system-access/#security-considerations)
and the [Notifications specification discussion](https://github.com/whatwg/notifications/issues/177).


## Human 委托与业务能力

直接描述要办的事即可。助手先使用自己的权限，缺少权限时会在原聊天中请求你授权可代办的操作。助手准备具体范围，点击“前往 Loop 确认”后在浏览器核对动作、资源、到期时间和可重复使用性。确认或拒绝后原任务会自动收到结果。业务管理动作需明确授权，应用委托限具体应用及动作。已有授权可在 Loop 账号设置中查看和撤销。

完整业务说明见[仓库 README](../../README.md)，测试边界见[后端验证](backend/README.md)。
