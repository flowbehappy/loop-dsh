# Capability and error recovery

Read the returned error code, message and hint before choosing a recovery step.
Discovery, authorization and resource access are separate checks:

Capability lists and schemas do not need a local upload channel. A host-sync
failure concerns workspace mapping/upload; it is not evidence that the Agent
directory, model service or every business action is unavailable. A 403 does
not by itself prove expired login. Preserve the operation, code and explanation;
do not promise that logging in again will repair a missing permission.
Ordinary business reads and writes also use the current connection without an
upload binding. Supply the intended resource from the user or authorized reads;
the server still checks the action permission and that resource's access.
Turning off upload does not turn off task or document editing. Collaboration
needs its own exact conversation route and participant access.

| Evidence | Meaning and next step |
| --- | --- |
| Action absent from `actions` | Unavailable to this connection; not proof that Loop has no such API or which permission failed. Describe the exact known action for a reason; do not guess alternative action names. |
| `forbidden` or permission denial | Keep the target. If the Host returns a delegation input schema, submit the ordinary call with the requested arguments so the user sees the approval in this conversation. When personal delegation is unavailable or the user's own access is denied, explain the missing permission. |
| `independent_authorization` in schema | Follow the existing approval path; having a schema does not make the action directly callable. |
| Authentication failure | Recover the current connection through Host login controls. Never inspect credentials. |
| Binding failure | The Host can prepare a missing local-workspace mapping on demand; `collaboration_prepare` restores collaboration to its exact channel for a requested assignment. Saved project/account/server conflicts remain blocked. Report the actual error and a verified recovery path; do not invent controls or create another channel to bypass access. |
| `invalid_execution` with `dispatched:false` | Local Bash options were rejected before contacting Loop. Correct the options once; if the same failure remains, report it and stop. It says nothing about server availability. |
| Invalid directory cursor | Omit the cursor or use an empty string for the first page. For later pages use the exact returned nextCursor; never try invented values. |
| `invalid_command` / `validation` | No successful call is established. Read the action schema and correct syntax or named fields. Do not probe with unrelated writes. |
| Revision conflict | Re-read the resource and reconsider the intended edit against the current revision. |
| Timeout, disconnection or unknown write outcome | Inspect the resource/receipt before any retry; retain the original request identity and payload. If the read also fails with a connection error, stop until connection recovery rather than trying aliases or other reads. `retryable` is not permission to replay a write. |

## Waiting on asynchronous work

Separate four facts: the handoff was accepted, the work changed state, a result
is available, and the original Session can receive it. A dispatch receipt is not
a result; a progress or completion label does not prove a reply entered the
inbox. Check the exact Task or subscription under the same Session and binding.
Do not search unrelated history, guess an ID, or change the audience to recover.

For an accepted Loop handoff, call `collaboration_wait` with the `taskId` or
`subscriptionId` from that work. Omit the selector only for a single managed
scope. Use the returned state rather than assuming calling the tool suspended
anything:

| State | Next step |
| --- | --- |
| `waiting_for_push` | End this turn; the existing Session inbox receives feedback. Do not poll or start a new task. |
| `feedback_queued` | Let the queued feedback enter the current or next turn; do not fetch or resend it. |
| `scope_required`, `scope_unavailable` | Use the exact accepted receipt or subscription from this Session; check the known route or access before proceeding. |
| `reconcile_required` | Writes for this exact scope still lack a known outcome. Reconcile using the original request IDs and payloads; do not submit replacements. |
| `pull` | When needed, read a bounded page with `collaboration_read_updates` for that exact subscription. A partial or empty page is not proof of no result; do not poll. |
| `paused`, `mode_unknown` | Do not assume automatic wake or alter the mode unless authorized. Inspect the exact subscription or report the limit. |
| `delivery_pending` | The service has a delivery that is not yet committed to this Session. Let normal inbox recovery run; do not assume a new wake, resend the handoff, or repeatedly call wait. |
| `delivery_unavailable`, `delivery_gap`, `push_unavailable` | Inspect the original route or exact result through an authorized read when useful. Report the confirmed blocker or remaining uncertainty; do not trust an automatic wake. |

A failed wait does not change the goal or dispatch anything. Continue independent
authorized work and report what remains unresolved. Retry a confirmed read-only
or pre-send failure on the same scope when there is a concrete recovery reason.
For an unknown mutation outcome, reconcile with the original identity and
payload first; do not issue a fresh write or assume non-delivery.

A history page may not expose the send's clientMessageId, and a missing message
in a partial page does not prove non-delivery. Use only fields in the current
schema; if reconciliation cannot determine the outcome, report it as unresolved.

Before diagnosing a missing known action, call `schema <actionId>`: the catalog
only filters availability, while the descriptor request preserves the actual
rejection. If it still gives no specific reason, report the uncertainty rather
than presenting a possible permission setting as the confirmed cause.

For channel invitations, `channel.agent-add` belongs to the channel **manage**
permission. New personal assistants enable this permission by default; existing
saved choices are preserved. An empty catalog is not evidence that invitations
are unsupported. An exact `actions channel.agent-add` query checks the schema
when the catalog is empty. `action_not_granted` confirms a missing action grant;
for a lasting change to the assistant’s own permissions, use Loop `/settings/account` → Personal Assistant (个人助手) → Edit permissions
(编辑权限) → Channels (频道) → Manage access (管理授权) to let the authorizing human
restore this permission. `unknown_action` means this server does not expose the
action; `forbidden_scope` requires the indicated connection authorization.
Do not infer expired login from any of these results. Even when enabled, ordinary
channel and Agent access checks still apply. Request only the necessary
permission, not all management permissions. User authorization to share an
audience remains required.

The tasks/agents guides expose collaboration tools for the current turn. Tool
visibility does not accept a target or authorize a write. For an explicit
assignment request, select exact directory targets within the user's scope and
use `collaboration_prepare`; the DSH @ picker is another way to identify targets,
not the only way. If a guide was loaded but a tool is
still missing, report that Host capability problem. Do not switch from an
attempted tracked dispatch to `task.create`/`task.assign`: it loses the DSH receipt
subscription and can duplicate a task when the first outcome is uncertain.

`loop-proxy` consumes literal JSON before the shell. In a command such as
`loop-proxy call message.send {"target":"<returned-target>","content":"A says \"hello\".\nNext line.","clientMessageId":"<stable-id>"}`,
only JSON string contents need escaping. Preserve quotes, newlines, paths and
code as data rather than removing them. `dispatched:false` means local rejection
before a request was sent; correct that request without creating test messages.

Separate missing accepted target, saved channel access, channel membership and
action grants. None proves the other. A saved channel returning not_found may be
deleted or inaccessible; do not claim deletion or server failure without evidence.
Report the smallest confirmed blocker and its recovery step. Do not broaden a
failed dispatch into unrelated inventory, workflow execution or a different task.

Keep recovery proportional to the user's goal. Complete independent authorized
steps while one dependency is blocked. Ask only for information, sharing consent
or a permission change that is actually missing, and explain its exact effect.
Do not request broader access than the operation needs or repeat an answered
question. A permitted alternative is useful only when it achieves the same goal
and preserves its intended audience, tracking and result guarantees; it must
not evade a denial or duplicate an operation with unknown outcome.

For competing `role.update` and `role.delete` requests on the same role, use
`role.request-get` to check the earlier request through execution. Read
`role.get` for the current version before submitting the next intended change.
