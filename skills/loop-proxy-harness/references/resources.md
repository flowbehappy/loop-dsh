# Memory and files

Discover `loop-proxy actions memory.` or `loop-proxy actions drive.`, describe the
chosen action, then pass its parameters directly to `loop-proxy call <actionId>`.

`memory.search` reads the selected Agent's managed memory. Do not supply another
identity or guess a Memory ID. `memory.commit` sends a complete snapshot with its
operationId, expectedVersionId and expectedGeneration. If no Memory is bound, tell the owner what is needed to remember it. Ask before saving a personal preference into any shared resource. Write only for the user's
requested memory change; preserve unrelated content. On an unknown outcome, reuse
the exact operation/payload only after reconciliation. On conflict, re-read.

Create a requested folder with `drive.mkdir` when available. Upload to an existing parent and open the completed file using the returned webUrl.

Drive operations use authorized `drive://` locators. Follow the described transfer
limits and use uploadId, offset and version handles returned by Loop. A locator
is not a local path or arbitrary URL. Verify the final receipt/read-back before
claiming that a transfer completed.

## DataSpaces, Data APIs and dashboards

The hosted Data API invocation path currently executes queries. CSV import adds
rows. A successful API-spec validation does not prove a row update can run.
When asked to change an existing row, check the available record actions before
defining an API. If none can update it, report the limitation and keep the
original row intact.

Discover `dataspace.` and `dashboard.` actions and read their schemas. Create a
DataSpace, wait for active placement, then plan/apply a table with a primary key
and the returned revision. Never guess a revision or use a plan for other data.

Remote CSV import requires `contentBase64`; `file` is just a logical filename.
The optional checksum hashes decoded CSV bytes, not base64 text. Prefer omitting
an optional checksum to guessing it. Inspect imported and rejected row counts.
Use inline `pages[].content` for dashboards, not local `contentFile`; omit pageId
when adding a new page, and reuse returned pageId for revisions.

For a filtered read-only Data API, validate and publish a query spec. For example,
declare `params: [{"name":"status","type":"string","default":"待处理"}]`
in the API spec and use this query step on table `stores`:

```json
{"from":{"table":"stores"},"select":[{"column":"store_name"},{"column":"import_status"},{"column":"block_reason"}],"where":{"column":"import_status","operator":"eq","value":{"param":"status"}},"limit":20}
```

Use the current schema and validation diagnostics to check the expression form.
Invoke using the returned `dapi_...` id, not the route or a guessed spec id.
Verify both included and excluded rows: a query intended for pending stores
must not return completed stores. Build the dashboard from those verified rows;
label a static snapshot as a snapshot, never promise live updates without a
working live connection. Re-read persisted resources and inspect the actual
rendered result before claiming the requested outcome is complete.

Data API routes are unique across the whole Loop workspace, not just one
DataSpace. Prefer a route containing this space/task's unique key. A route
conflict with an empty API list in this space can refer to another space; it
does not mean validateOnly saved a draft. Do not overwrite unrelated APIs.
The typed `validation.normalized` and top-level API summaries omit dynamic
predicates and parameter defaults. Their absence there does not mean the
submitted filter was removed. Inspect the saved `api.spec` for the complete
round-trip specification, then invoke with matching and nonmatching test values.
