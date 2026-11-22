---
order: 90
---

# Connect DeepSeek Harness to Loop

Download [loop-dsh.tgz](https://github.com/flowbehappy/loop-dsh/releases/latest/download/loop-dsh.tgz). In DSH, open Plugins, add a third-party plugin, and enter the downloaded file’s absolute path. If prompted about the `koffi` installation script, review the package name and approve it to finish installing. Restart DSH if prompted.

## Sign in and authorize

Open More → Sign in in DSH, confirm the Loop server, and complete authorization in the external browser. Each installation stores one credential pair through the DSH provider. Agent actions, models and conversation uploads share that connection while retaining their server-side purpose and resource checks. Installations can be revoked independently. Embedded pages and Worksite retain separate authorization boundaries.

Manage action and resource access under Personal assistant in Loop account settings. Reading, writing, models and uploads are enabled by default; deletion and management are disabled. Describe the task normally. If the assistant lacks permission and Loop supports personal authorization for that action, the assistant asks for your approval in the same conversation. Select Review in Loop in the conversation, then review the exact scope, expiry and reuse in the browser. The originating task receives the decision automatically. Manage existing grants in Loop account settings. Business management and installed App actions retain separate authorization.

## Use Loop

Open Tasks from the sidebar. Open Inbox, Contacts, Projects, Workflows, Knowledge, Cloud Drive, Data Spaces, Experts & Skills, or Connectors from More. Select authorized knowledge bases or Skills with `/`; selection grants no access. Use `@` or natural language to select colleagues and Agents. A plain mention creates neither a task nor a notification. Delegation requires the accepted current user message and any necessary sharing consent.

The plugin exposes an on-demand Skill and virtual `loop-proxy` commands intercepted before shell execution. No global executable is installed. Loop validates every actual action. Authorized models appear in the native DSH model selector and refresh automatically.

## Uploads, sign-out and upgrades

By default only new visible events observed while signed in are uploaded. Enable upload of disconnected history explicitly to replay accessible history. Hidden reasoning, raw tool arguments, file contents and credentials are excluded.

Sign-out freezes the exact connection and removes local credentials only after confirmed server revocation. Unknown outcomes remain recoverable and do not affect other installations. Disabling the plugin is not sign-out.

Keep the DSH home, sessions, queues and previous artifact during upgrades. Old Go connector credentials are not imported into the native provider; sign in again. Do not overwrite upgraded collaboration state during rollback. See the [native installation guide](../../../../plugins/loop-proxy-dsh/README.native.md).
