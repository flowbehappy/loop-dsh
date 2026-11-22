# Personal authorization in Loop

Start ordinary tasks with the connected Agent. On a definite permission denial the
Host checks whether Loop supports personal authorization for the same action.
If discovery returns a personal input schema, continue with the ordinary
`loop-proxy call` and the exact requested targets. Give the tool a brief description
of the operation and objects in the user's language. The Host presents the approval
in the current conversation and completes that same call after approval. Do not ask
the user to repeat their request in special words, open settings or run a second
Human call. On refusal, stop. Network failures and uncertain writes require
reconciliation before retrying. When the user specifically requests personal
authorship, they can also ask directly to act in their name. Resolve exact targets from that request or
authorized reads. Before any Human catalog/schema/call, prepare ONE specific action
with a plain-language description in the user's language, naming the actual objects:

```text
loop-proxy human authorize project.get {"summary":"查看春季发布项目","resourceConstraints":["project:prj_example"]}
loop-proxy human-apps authorize app.invoke {"summary":"在客户应用中查询客户资料","resourceConstraints":["app:example","app-action:example/lookup"],"write":true}
```

Use real target IDs. List all target locators, including both the channel and
workspace member for a membership change. Read requests use read-only access. Specify write:true for mutations and app.invoke. Use manage:true only for an expressly
requested management action. Only for an inherently unscoped operation and an
explicit workspace-wide request may you use resourceConstraints:[] plus
workspaceWide:true. The tool stays open until the original conversation receives
the decision. Never open the authorization URL yourself. On refusal, cancellation,
expiry or revocation, stop the personal action. After approval inspect the same
prefix and action with schema and invoke it with call. Check uncertain write
outcomes before retrying. A new user instruction starts a separate task. Existing
grants are reviewed and revoked in Loop account settings.
