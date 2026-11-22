# Workflows and installed Apps

Discover `workflow.` or `app.` with `loop-proxy actions <prefix>`; Agent-installed
App actions use `extension:` IDs. Describe only the matching action, then call
its exact ID and parameter object. Availability depends on the live installation
and selected connection.

Starting, resuming or cancelling a workflow requires the user's request. Keep
the returned run/step identity and inspect its actual state. A start receipt is
not a completed result. On an uncertain response, inspect that run before retrying.

Agent App actions use their exact exposed `extension:<extension>:<action>` ID.
Human-delegated Apps use authorized `app.catalog`/`app.invoke` actions and their
exact resource locators. Do not substitute one mode for another or infer authority
from installation alone. Apply the action's current idempotency and revision rules.

## Author a Loop Plan

`workflow.plan` source is Loop's graph DSL, not GitHub Actions, Argo or a shell
script. Start from this minimal manual plan (no messages, triggers or notifications):

```yaml
apiVersion: loop.plan/v1
kind: PlanVersion
output:
  message: {type: string, required: true}
graph:
  entry:
    nodeId: done
    port: in
    input:
      message: {value: "Completed"}
  nodes:
  - id: done
    type: end
    end: {outcome: succeeded}
  edges: []
```

Call `workflow.plan` action `validate` with `source`; inspect diagnostics even
when the tool succeeds. Then `create` with a unique key, displayName and source;
`publish` with returned planId and draft.revision as expectedRevision; start with
`workflow.run` action `start`, planId, returned planVersionId and `input: {}`. Use `workflow.run` action `show` on that exact runId for compact state,
then `show` with `section: "output"` to verify the actual output. The example binds a constant into the declared Plan output. End nodes inherit
that contract; do not add a separate input schema to an end node. Inspect run
output separately before claiming its value.
On validation failure, correct the named field from diagnostics rather than
probing unrelated DSL dialects or scanning local repositories for source code.
