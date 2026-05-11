# Design — Agent-managed DuckDB views with persistent storage

## Context

The semantic layer's read path runs through DuckDB views in a per-model schema (`_scope_<modelName>`). Today these views are mechanically generated from each dataset's `fields` (`packages/core/src/services/duckdb.ts:473-526`) and live in an in-memory DuckDB instance (`DuckDBInstance.create()` with no path). Both choices made sense as a v1: they meant "no extra YAML surface to teach the agent" and "no on-disk artefact to garbage-collect". The downsides, now visible, are:

- The agent has no way to author a non-mirror view (soft-delete filters, denormalising joins, projecting only relevant columns).
- The agent has no way to *test* a view it just authored, because the view doesn't survive the parsing-only round-trip the agent makes through the YAML files.

Stakeholders: AI agents writing semantic models, human reviewers of those models, MCP token holders running queries, project owners who want to scope what their MCP token can see.

Constraints:
- DuckDB instance is shared across MCP `execute_query`, the semantic-model-agent SQL tools, the data browser, and connection tests. We cannot fork a separate file per consumer without losing federated joins.
- Iceberg connections store a bearer token in-process via `CREATE SECRET`. A persistent DB file MUST NOT leak that token to disk.
- The MCP `execute_query` SQL validator (regex + AST in `add-structural-sql-safety`) rejects references to attached catalogs (`shopify.public.*`) at the user level — the views are the only legitimate way to reach data. This invariant remains.
- The schema name `_scope_<modelName>` is platform-internal. It MUST NOT leak into agent-visible surfaces (tool descriptions, system prompt, error messages). The agent's mental model is "datasets are bare names; `view_query` defines their body".

## Goals / Non-Goals

Goals:
- The agent owns each dataset's view body via a `view_query` field in the COMMON custom extension.
- The agent has a dedicated tool, `runModelQuery`, that materialises and queries scoped views in one call. Catalog-level exploration stays on `executeQuery`. Two distinct tools, two distinct purposes.
- DuckDB instance is file-backed per project, so the views the agent applied are still there at the next session.
- Materialisation is **stateless**: every `runModelQuery` and every MCP `execute_query` call runs `CREATE OR REPLACE VIEW` for every dataset in the model from the YAML's `view_query`. No in-memory cache to keep in sync.
- Migration is automatic for existing models: a one-time backfill script writes the *current* mechanical SELECT into each dataset's `view_query`.

Non-Goals:
- Cross-dataset view composition ("model-level views" with joins). The `view_query` field is per-dataset; cross-dataset joins live in `relationships`.
- Replacing the `fields` array. Field metadata (`data_type`, `example_data`, `dimension`, etc.) is still authoritative for digest generation and AI context. The view body just needs to *expose* every declared field name.
- Eager view materialisation on YAML save. The agent calls `runModelQuery` to materialise + verify.
- An in-memory hash cache. Profile first; add later only if `CREATE OR REPLACE` round-trips dominate latency.
- Surfacing `_scope_<model>` to the agent in any way. Internal-only.

## Decisions

### Decision 1 — `view_query` lives inside the existing COMMON `custom_extensions` JSON

Same precedent as `validated_queries`. Adding `view_query` as a sibling key avoids a new top-level YAML property and reuses the existing `jsonStringSchema` parsing machinery in the file service. Reading and writing remains "extension passthrough" — the file service does not interpret `view_query`; the DuckDB service does.

Alternatives considered:
- **A top-level `view_query` field on `Dataset`.** Rejected: would change the OSI-aligned dataset shape and force schema migrations in every consumer (frontend graph view, digest renderer, agent prompt, OSI export). The JSON-blob friction is real but localised to the agent's `write_file` step.
- **A separate `views/` directory of `.sql` files.** Rejected: detaches the view body from the dataset YAML and creates a new path-safety surface.
- **A `vendor_name: "archmax"` extension.** Rejected: graph-view extensions already reside in `archmax`, but the view body is conceptually a *first-class* part of the semantic model. It belongs alongside `validated_queries` under `COMMON`.

### Decision 2 — DuckDB file is per-project at `<ARCHMAX_DATA_DIR>/projects/<projectId>/duckdb.db`

Sits inside the directory the project file service already manages and inherits its backup story. `disposeProjectInstance` closes the handle without deleting. The `connections/reinit?reset=true` flag is the operator's escape hatch for corrupt state.

Alternatives:
- **Single global DuckDB file.** Rejected: project isolation; project deletion would have to surgically drop schemas.
- **Per-model file.** Rejected: federated joins across attached catalogs require one DuckDB process to hold all attaches simultaneously.
- **Stay in memory; separate process for view persistence.** Rejected: doubles the DuckDB load and the agent's tool would still hit the in-memory instance, missing the persisted views.

### Decision 3 — View body is wrapped by the platform; agent never writes raw `CREATE VIEW`

`view_query` stores only the `SELECT … FROM …` body. `materialiseModelViews` wraps it as `CREATE OR REPLACE VIEW _scope_<modelName>."<dataset>" AS <view_query>`. This:
- Keeps the schema name (`_scope_<modelName>`) under platform control — the agent cannot hijack another model's namespace.
- Lets the structural SQL validator (`add-structural-sql-safety`) be applied to `view_query` at materialisation time with the same allowlist as `execute_query`.
- Makes idempotency trivial: `CREATE OR REPLACE` against an unchanged body is a no-op as far as DuckDB plan caching is concerned.

### Decision 4 — Stateless materialisation; no in-memory cache

Every `runModelQuery` and every MCP `execute_query` call runs through `materialiseModelViews(projectId, model)`, which iterates every dataset and issues `CREATE OR REPLACE VIEW`. There is no `scopeViewCache` map, no per-process hash bookkeeping, and no cross-process invalidation problem.

Why this is OK:
- `CREATE OR REPLACE VIEW` against an unchanged body is microsecond-cheap in DuckDB. A 50-dataset model adds at most a few milliseconds of overhead per query — well below the typical query latency.
- The agent's edit loop (write YAML → call `runModelQuery`) sees changes immediately because there is nothing to invalidate.
- The MCP path sees the same: any operator who edits YAML and re-publishes gets the new view body on the next query.
- Cross-process concerns vanish: the only state is the DuckDB file itself.

If profiling later shows materialisation overhead dominates `runModelQuery`/`execute_query` latency for large models (>50 datasets, >100 ms), we can add a hash optimisation by storing the YAML hash as a `COMMENT ON SCHEMA _scope_<model>` and reading it on entry — the hash lives **in the DuckDB file**, not in process memory, so it can never desync. We do not pre-emptively add this; task 4.6 mandates the measurement before the optimisation.

Alternatives considered:
- **Keep the existing in-memory `scopeViewCache`.** Rejected: cross-process inconsistency (the file-backed DB can be modified out-of-band; the cache wouldn't know), and cache adds 30+ lines of bookkeeping for a saving we have not measured.
- **Materialise eagerly on YAML save.** Rejected: forces every YAML write through the DuckDB instance, adds a second authoring path the agent has to coordinate with `runModelQuery`, and re-introduces a cache-invalidation surface (a save would have to invalidate any previous materialisation).

### Decision 5 — Two-tool agent surface: `executeQuery` + `runModelQuery`

The agent has two distinct SQL needs and they get two distinct tools.

| Tool             | Purpose                                                | Validation                                                            | SQL form                       |
| ---------------- | ------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------ |
| `executeQuery`   | Catalog exploration: `information_schema`, sampling raw source tables, validating join cardinalities | Read-only validator; queries MUST be fully qualified `catalog.schema.table` | `SELECT … FROM shop.public.…`  |
| `runModelQuery`  | Test a view the agent has authored; equivalent to MCP `execute_query` for the agent | Same lexical + structural validator as MCP `execute_query`; bare dataset names | `SELECT … FROM "<dataset>"`    |

Both tools share `materialiseModelViews(projectId, model)` (extracted from the MCP path). A single behavioural change in materialisation MUST affect both surfaces; tasks 4.1 and 5.3 enforce code-sharing.

Alternatives considered:
- **One tool with optional `modelName` parameter** (the previous design). Rejected: the LLM has to track which mode it's in, the system prompt has to teach both, and the validation rules conflict (catalog refs allowed in mode 1, forbidden in mode 2). Two clean tool descriptions are easier to consume.
- **Drop `executeQuery` entirely; force every agent SQL through scoped views.** Rejected: the agent legitimately needs to inspect raw catalog metadata before authoring a model. Without `executeQuery`, the agent has no way to discover what tables exist.

### Decision 6 — Iceberg secrets stay ephemeral

`CREATE SECRET` defaults persist secrets to `~/.duckdb/stored_secrets/`. We pass `TEMPORARY` (or whichever in-memory variant the pinned `@duckdb/node-api` accepts) so iceberg bearer tokens never reach the project's `duckdb.db` file. A test asserts that opening `duckdb.db` in a fresh DuckDB process and running `SELECT * FROM duckdb_secrets()` returns zero rows.

### Decision 7 — Migration preserves current behaviour exactly

`apps/api/src/scripts/migrate-view-query.ts` walks every project's `src/<model>/<dataset>.yaml`, reads the dataset, builds the SELECT body using the same column-quoting and aliasing logic the legacy `createScopedViews` used today, and writes it into a new `view_query` key inside the dataset's COMMON extension, formatted one column per line for readability. Idempotent (skips datasets whose extension already has `view_query`); writes a `.yaml.bak` backup before saving; refuses to overwrite an existing backup.

Datasets with an empty `fields` array are NOT silently skipped — they emit a WARN log and count under "errored" so a CI run of the script exits non-zero. Such datasets are unusable in the new world (no auto-derivation, no `view_query`) and require operator intervention before the migration is "done".

### Decision 8 — `_scope_<model>` is platform-private; agent surfaces hide it

The agent's mental model is: datasets are queryable bare names; `view_query` defines their body. The internal mechanism — that bare names resolve via DuckDB `search_path` against an `_scope_<modelName>` schema — is platform-private and never leaks to the agent.

Enforcement (covered by the "Agent Surfaces Hide Scoped Schema Name" requirement):
- Tool descriptions for `executeQuery` and `runModelQuery` contain no `_scope_*`.
- The system prompt and `buildConnectionContext` block contain no `_scope_*`.
- DuckDB error messages returned by `runModelQuery` have any `_scope_<modelName>.` qualifier stripped before being returned to the agent.

The complementary security boundary — that an agent or MCP token holder cannot reach a different model's views by *typing* `_scope_<other_model>` — is enforced by the structural SQL validator from `add-structural-sql-safety`. Task 7.3 mandates that this validator's forbidden-schema list includes `_scope_*` and that quoting evasions (`"_scope_x"."y"`, unicode escapes, dollar-quoted identifiers) are all rejected. This change's spec adds two scenarios to the MCP server's SQL Validation requirement to lock that contract in.

## Risks / Trade-offs

- **Risk: persistent file gets corrupted.** Mitigation: `connections/reinit?reset=true` deletes the file and rebuilds. The next call rematerialises every view from `view_query`. Operator runbook documents the procedure.
- **Risk: agent writes a `view_query` that references a forbidden function.** Mitigation: the structural AST validator runs on `view_query` at materialisation time, with the same allowlist as `execute_query`. A bad `view_query` is rejected; the previous view (if any) keeps serving traffic; a warning is logged.
- **Risk: `CREATE OR REPLACE` overhead becomes the bottleneck.** Mitigation: task 4.6 mandates a measurement before any optimisation. If hot, add a schema-comment hash check (state in DB file, not in process memory) — see Decision 4.
- **Risk: dataset field name ↔ view column name drift.** Accepted: DuckDB will fail at query time with "column does not exist", which is the right error for the consumer to see. We do **not** add a separate drift warning — it's not actionable and the runtime error is louder.
- **Trade-off: persistence increases storage footprint.** A typical 100-dataset project sits well under 10 MB. Acceptable.
- **Trade-off: file lock semantics.** A persistent DuckDB file held by the API process locks the file. We must keep the existing `disposeProjectInstance` path that releases the handle, and the API must hold only one handle per project. The handle MUST be released cleanly on graceful shutdown.

## Migration Plan

1. Land schema/Zod support for `view_query` in the COMMON extension *first* (still optional). Existing models continue to work because auto-derivation is still in place.
2. Land the persistent DuckDB instance change behind `getProjectInstance`. Verify data browser, MCP, and agent integration tests still pass with file-backed mode and that `disposeProjectInstance` releases the lock.
3. Run `migrate-view-query.ts` against the dev environment, inspect a handful of YAMLs, confirm `runModelQuery` against `<dataset>` returns the same rows as before.
4. Replace `createScopedViews` with `materialiseModelViews` (no cache); switch MCP `executeScopedQuery` to call it. Datasets without `view_query` after the migration log a warning and produce no view (so `execute_query`/`runModelQuery` against them returns the documented error). This is the BREAKING moment.
5. Add the new `runModelQuery` tool; keep `executeQuery` as catalog-exploration only.
6. Update prompt and docs.
7. Profile materialisation; if hot, add the schema-comment hash optimisation in a follow-up change.

Rollback: the migration writes `.yaml.bak` files. Restoring them and reverting `materialiseModelViews` reverts the model surface; the persistent DB file is harmless when the auto-derivation path is restored (it can be deleted via `reinit?reset=true`).

## Open Questions

- Should `view_query` be surfaced as a first-class field in the frontend model editor (vs a JSON blob inside the COMMON extension)? Out of scope; follow-up.
- Should `view_query` support parameters (e.g. project-time tokens like `${current_year}`)? Out of scope.
- If the schema-comment hash optimisation lands later, should the comment also include a timestamp so operators can audit when each model was last materialised? Likely yes, but only specced once we measure the need.
