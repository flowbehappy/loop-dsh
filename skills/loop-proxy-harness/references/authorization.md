# Personal authorization in Loop

Use `loop-proxy schema` and `loop-proxy call` for work as the connected Agent.
When the user requests personal authorship, select it explicitly with
`loop-proxy human actions <domain.>`, `loop-proxy human schema <action>` and
`loop-proxy human call <action> <JSON>` (`human-apps` for Apps). Discovery and
schema inspection need no prior consent. Use published action names, not guessed
synonyms. An unknown action does not mean the connection lacks the capability. Loop computes
exact authorization from the call arguments; the Host presents the confirmation
in this conversation and executes that same call after approval. Choose identity
from the user’s request; honor any instruction not to seek personal access.
The plugin does not infer identity or consent from natural-language keywords. Keep target IDs
and give the tool a brief description of the operation and objects in the user's
language. A normal Agent call also offers this flow on a definite permission denial.

Discovery and schema inspection do not request consent. Do not invent resource
constraints or ask the user to repeat their request in special words. On refusal,
stop that personal action. Network failures and uncertain writes require receipt
reconciliation before retrying. Existing grants are reviewed and revoked in Loop
account settings.

## Explicit manual authorization

The manual entry point remains available when the user asks to prepare an
independent personal authorization. It is not a prerequisite for ordinary calls.
Use the published action contract and exact resource locators:

```text
loop-proxy human authorize project.get {"summary":"查看春季发布项目","resourceConstraints":["project:prj_example"]}
loop-proxy human-apps authorize app.invoke {"summary":"在客户应用中查询客户资料","resourceConstraints":["app:example","app-action:example/lookup"],"write":true}
```

List every required target. Read requests use read-only access. Specify write:true
for mutations and app.invoke; manage:true only for requested management. Only an
inherently unscoped action and an explicit workspace-wide request justify
resourceConstraints:[] with workspaceWide:true. The tool waits for the user's
decision; never open the authorization URL yourself. After approval use the same
Human connection and action. Refusal, cancellation, expiry or revocation ends that
personal action. A new user instruction starts a separate task.
