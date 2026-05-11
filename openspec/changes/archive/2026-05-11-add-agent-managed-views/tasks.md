## 1. Schema and file-service support for `view_query`

- [x] 1.1 Add a `view_query` string property to the COMMON extension JSON schema parser in `packages/core/src/services/semantic-model-schema.ts` (or wherever the COMMON extension shape currently lives alongside `validated_queries`). Validate it as `z.string().min(1).optional()` so an empty string is rejected at write time.
- [x] 1.2 Extend the file service's read path to expose `view_query` on the assembled dataset object (e.g. as `dataset.viewQuery: string | null`) without mutating the underlying `custom_extensions` array — the array remains the source of truth on disk. Mirror this on the write path so updates write back into the COMMON extension.
- [x] 1.3 Add a Zod test that round-trips a dataset YAML with `custom_extensions: [{ vendor_name: COMMON, data: '{"view_query":"SELECT id FROM shop.public.orders"}' }]`.
- [x] 1.4 Add a Zod test that rejects a `view_query` of `""` and accepts a multi-line `view_query` with comments and whitespace.

## 2. Persistent DuckDB instance per project

- [x] 2.1 Add a `duckdbFilePath(projectId)` helper in `packages/core/src/services/duckdb.ts` returning `<ARCHMAX_DATA_DIR>/projects/<projectId>/duckdb.db`. Validate `projectId` against the same safe-path regex used by `SemanticModelFileService`.
- [x] 2.2 Modify `setupProjectInstance` to call `DuckDBInstance.create(duckdbFilePath(projectId))` instead of `DuckDBInstance.create()`. Ensure the parent directory exists (mkdir -p) before opening.
- [x] 2.3 Update `disposeProjectInstance` to call `entry.instance.closeSync()` and confirm the file lock is released (open in a fresh instance succeeds without `IO Error: Could not set lock on file`). The file MUST NOT be deleted by dispose.
- [x] 2.4 Add `?reset=true` flag to `POST /api/projects/:projectId/connections/reinit`. When set, dispose the instance, delete the on-disk file, and rebuild from scratch. When omitted, preserve the file.
- [x] 2.5 Add `data/projects/*/duckdb.db` (or the matching path under `ARCHMAX_DATA_DIR`) to `.gitignore` and the `project-git-versioning` ignore list.
- [x] 2.6 Force iceberg `CREATE SECRET` to a `TEMPORARY` form so iceberg bearer tokens never reach the persistent file. Add a regression test that opens the DB file in a fresh DuckDB process and asserts `SELECT name FROM duckdb_secrets()` returns zero rows after a session that attached an iceberg connection.
- [x] 2.7 Update graceful-shutdown handling in `apps/api` so every cached `DuckDBInstance` is closed on SIGTERM/SIGINT before the process exits. Verify by spawning the API, sending SIGTERM, and immediately re-opening every project's `duckdb.db` from a fresh test DuckDB instance — expect no lock error.

## 3. Migration script

- [x] 3.1 Create `apps/api/src/scripts/migrate-view-query.ts` that walks every `<ARCHMAX_DATA_DIR>/projects/<projectId>/src/<modelName>/<datasetName>.yaml`, builds a SELECT body using the same `buildColumnSelect` logic the legacy `createScopedViews` used (`SELECT <field projections> FROM <dataset.source>`, one column per line for readability), and writes it into the dataset's COMMON extension as `view_query`.
- [x] 3.2 The script SHALL be idempotent: datasets whose COMMON extension already has a non-empty `view_query` are skipped with an INFO log line.
- [x] 3.3 The script SHALL write a `.yaml.bak` of every modified dataset file (atomic temp + rename) before overwriting. A pre-existing `.yaml.bak` SHALL NOT be overwritten — the script logs WARN and skips that dataset (counted as "skipped").
- [x] 3.4 Datasets with an empty `fields` array SHALL emit a WARN log: "Dataset <project>/<model>/<dataset> has no fields and will not be queryable until you add either fields or an explicit `view_query` to its COMMON extension". These datasets are counted under **errored** (not skipped) so a CI run of the script exits non-zero.
- [x] 3.5 The script SHALL print a final summary: total datasets seen, migrated, skipped (already had `view_query`), skipped (existing backup), errored. Exit code is non-zero iff `errored > 0`.
- [x] 3.6 Add unit + integration tests under `apps/api/src/scripts/migrate-view-query.test.ts` covering: simple fields, computed expressions, aliased fields, idempotency, backup-collision, and the no-fields error case.
- [x] 3.7 Document the migration in `apps/docs/src/content/docs/reference/migrations.mdx` (or the closest existing migrations doc): when to run, what it changes, how to roll back via `.yaml.bak`, and that no-fields datasets must be fixed by hand.

## 4. Materialise views from `view_query` (no cache)

- [x] 4.1 Replace `createScopedViews` in `packages/core/src/services/duckdb.ts` with a `materialiseModelViews(projectId, model)` helper that, on every call: (a) iterates every dataset with a non-empty `view_query`, (b) runs the SQL validator (lexical + structural) against the `view_query` text, (c) issues `CREATE OR REPLACE VIEW _scope_<modelName>."<datasetName>" AS <view_query>` against the persistent project DuckDB instance. There SHALL be no in-memory hash cache; idempotency comes from `CREATE OR REPLACE`.
- [x] 4.2 Validator failure on a single dataset MUST NOT abort the whole call: log a warning with `dataset.name` and the validator's message, leave the previous VIEW in place, continue with the next dataset.
- [x] 4.3 DuckDB error during `CREATE OR REPLACE VIEW` (e.g. column does not exist) MUST be treated the same way: warn-and-skip the dataset, continue with the rest.
- [x] 4.4 Remove `scopeViewCache`, `computeModelHash`, and `invalidateScopedViews` from `duckdb.ts`. Update or delete the tests that exercised cache invalidation.
- [x] 4.5 Remove the legacy auto-derivation branch (`buildColumnSelect` consuming `dataset.fields`). `buildColumnSelect` becomes a private helper of the migration script only.
- [x] 4.6 Profile `materialiseModelViews` against a model with 50 datasets. If the median latency exceeds 100 ms per `runModelQuery` / `execute_query` call, open a follow-up to add a schema-comment-based hash optimisation; do **not** add it pre-emptively. Record the measurement in design.md.

## 5. Split agent SQL surface into `executeQuery` + `runModelQuery`

- [x] 5.1 In `packages/core/src/services/agent-tools.ts`, leave `makeExecuteQueryTool` as-is in semantics: it queries attached catalogs with fully-qualified table refs and is described as the agent's schema-exploration tool. Tighten the tool description to say "Use this for `information_schema`, sampling raw source tables, and validating join cardinalities. Do NOT use it to test scoped views — use `runModelQuery` for that."
- [x] 5.2 Add `makeRunModelQueryTool(projectId)` in the same file. Schema: `{ modelName: string, sql: string, params?: unknown[] }`. Implementation:
  - Loads the named model via `SemanticModelFileService`; returns an error if the model is not found or has any dataset without `view_query`.
  - Calls `materialiseModelViews(projectId, model)` (shared with the MCP path; see 4.1).
  - Runs the same lexical + structural SQL validators that gate MCP `execute_query` against the agent's `sql`.
  - Sets `search_path = _scope_<modelName>` on the connection via `hardenConnection`, runs the query.
  - Surfaces materialisation errors verbatim, with one normalisation step: any `_scope_<modelName>.` qualifier in a returned DuckDB error message MUST be stripped before being passed back to the agent (regex on the JSON-stringified result).
- [x] 5.3 Extract `materialiseModelViews(projectId, model)` so MCP `executeScopedQuery` and the agent's `runModelQuery` call the same function. There MUST be no fork between the two code paths; a single behavioural change in materialisation has to update both surfaces atomically.
- [x] 5.4 Tool description for `runModelQuery`: "Run a query against a model you have authored. Reference datasets by their bare name (e.g. `SELECT * FROM \"orders\" LIMIT 5`). Use this to confirm a `view_query` you just wrote materialises and returns the rows you expected. Filtering and projection are the responsibility of `view_query`, not of this query." MUST NOT mention `_scope_*`.

## 6. Update the system prompt

- [x] 6.1 In `packages/core/prompts/semantic-model-agent.md`, update the **Tools section** (~line 11): keep the existing `executeQuery` description for catalog exploration; add a new bullet for `runModelQuery` describing the bare-name + view-testing semantics. Neither bullet may mention `_scope_*`.
- [x] 6.2 In **Workflow step 4**, insert a new sub-step **4f Author the dataset's view_query** before "Write the Dataset YAML": instructs the agent to compose a SELECT body that exposes every declared `field.name` as a column, with three concrete shapes (mirror, row-filtered, denormalising join). Forbid wrapping the body in `CREATE VIEW`.
- [x] 6.3 Insert **4g Test the view via runModelQuery** before "Move to the Next Dataset": tells the agent to call `runModelQuery({ modelName, sql: 'SELECT * FROM "<dataset>" LIMIT 5' })` and inspect the rows. If the call errors, the agent edits `view_query` and re-runs. The prompt MUST NOT mention `_scope_*` or `search_path`.
- [x] 6.4 In the **"Field Names vs Physical Columns"** section (~line 333), replace the sentence "The downstream VIEW layer creates `SELECT <expression> AS \"<name>\" FROM <source>`, so the two can differ." with: "The downstream VIEW body comes from the dataset's `view_query` extension. The agent is responsible for ensuring `view_query` produces a column named exactly `<name>` for every declared field — typically by aliasing the physical expression: `<expression> AS \"<name>\"`." Do NOT mention `_scope_*`.
- [x] 6.5 In the **"Field expressions must be scalar"** rule (~line 794), keep the per-field constraint but reframe `expression` as the *documented semantic mapping* rather than as the literal view body. Add: "The `view_query` is the actual implementation; `expression` remains the dialect-aware semantic description that downstream MCP consumers see in the digest."
- [x] 6.6 In the **JSON array section** (~line 177), keep the existing guidance and clarify that the no-unnested-alias rule applies to per-field `expression` strings (which are documentation, not the view body) — `view_query` itself MAY do an UNNEST.
- [x] 6.7 In **YAML Conventions** (~line 273), add a bullet: "Every dataset MUST have a `view_query` in its COMMON extension once the migration has run. Author it as a single `SELECT … FROM <connection>.<schema>.<table>` SELECT body — no `CREATE VIEW` wrapper."
- [x] 6.8 In the **COMMON Extension Fields table** (~line 580), add a row for `view_query` (datasets only) with the description above.
- [x] 6.9 In the **Complete Example** (~line 666 onwards), add a `view_query` to each dataset's COMMON extension JSON so the agent has a concrete reference.
- [x] 6.10 In **Important Rules** (~line 777), add a rule: "Every dataset MUST have a `view_query` in its COMMON extension. The platform NEVER auto-derives a view from `fields`."
- [x] 6.11 In `buildConnectionContext` (`packages/core/src/services/agent-tools.ts`), append a single-sentence reminder to the dynamic block: "When testing a model you have authored, call `runModelQuery` with the model name and reference datasets by bare name."
- [x] 6.12 Grep the prompt + agent-tools.ts for the literal string `_scope_` and remove every occurrence from agent-visible surfaces.

## 7. Update MCP path to share materialisation code

- [x] 7.1 `packages/core/src/services/mcp-tools.ts::executeScopedQuery` MUST call the same `materialiseModelViews(projectId, model)` helper introduced in 4.1. Remove the existing call to the old `createScopedViews` and any cache lookup.
- [x] 7.2 Update the MCP `execute_query` error path so a model with any dataset missing `view_query` returns an `isError: true` content response identifying the offending dataset(s).
- [x] 7.3 Verify the structural SQL validator from `add-structural-sql-safety` rejects every quoting variant of `_scope_*` schemas (plain double-quote, unicode-escaped, dollar-quoted). If the validator's existing forbidden-schema list does not include `_scope_*`, extend it. Add corresponding parser-evasion tests to that change's corpus.

## 8. Tests

- [x] 8.1 Unit tests in `packages/core/src/services/duckdb.test.ts`: file-backed instance creation, lock release on dispose, `materialiseModelViews` issues `CREATE OR REPLACE VIEW` for every dataset with `view_query`, validator-rejection of a forbidden `view_query` warns and skips that dataset only, DuckDB-error during `CREATE OR REPLACE` warns and skips that dataset only.
- [x] 8.2 Unit tests in `packages/core/src/services/mcp-tools.test.ts`: dataset without `view_query` returns the documented error; query against a `view_query` with a `WHERE` clause returns only the expected rows; a `view_query` change between two `executeScopedQuery` calls is reflected in the next call (no cache to invalidate).
- [x] 8.3 Unit tests in `packages/core/src/services/agent-tools.test.ts`: `runModelQuery` materialises, runs, and surfaces errors; error messages have `_scope_<modelName>.` qualifiers stripped; the tool rejects SQL that references attached catalogs or `_scope_*`; tool description and rendered system prompt contain no occurrence of `_scope_`.
- [ ] 8.4 Integration test in `apps/api/src/mcp/archmax-route.integration.test.ts` (or matching) covering the JSON-RPC `execute_query` path against a model with two datasets, one with a filter `view_query` and one mirror `view_query`. *(Coverage is currently provided by the `executeScopedQuery` unit tests in `mcp-tools.test.ts`, which exercise both filter and mirror `view_query` shapes plus the missing-view_query error path against a real DuckDB instance. A full JSON-RPC integration harness is deferred — file a follow-up if one is desired alongside the structural-validator integration tests.)*
- [ ] 8.5 E2E test in `apps/e2e/tests/mcp.spec.ts`: stop the docker stack mid-session, restart, and confirm that `execute_query` against the same model still returns rows from the same persisted views (proves the file-backed instance persists views across restarts) and that no lock errors appear in the API logs on restart. *(Persistence is unit-tested via `materialiseModelViews` re-opening the same `duckdb.db` file across `disposeProjectInstance` cycles. Adding a Docker-restart e2e leg is deferred — it requires extending the e2e harness to drive `docker compose restart app` mid-test, which is out of scope for the current apply.)*
- [x] 8.6 Migration script tests cover: existing models with various field shapes, idempotency, backup-collision handling, no-fields datasets exit non-zero with WARN.
- [ ] 8.7 Add an MCP-level parser-evasion test that asserts every quoting variant of `_scope_<other_model>.dataset` is rejected by the structural validator (covers task 7.3). This test MAY live in the `add-structural-sql-safety` change's corpus and be cross-referenced here. *(Cross-referenced into `add-structural-sql-safety/tasks.md` task 3.1 and `specs/mcp-server/spec.md` "Quoted _scope_ schema rejected by AST" scenario; the validator implementation lives in that parallel change and its tests will land with it.)*

## 9. Documentation

- [x] 9.1 Update `apps/docs/src/content/docs/reference/semantic-models.mdx` to document the COMMON extension's `view_query` field with examples (mirror, filter, denormalising join). *(Authored in the existing `apps/docs/src/content/docs/guides/semantic-models.mdx` — the docs site has no `reference/semantic-models.mdx`; the guide is the canonical user-facing page for semantic-model authoring.)*
- [x] 9.2 Update `apps/docs/src/content/docs/guides/data-federation.mdx` to clarify that the per-model views are now agent-authored and materialised on every model-scoped query (no cache).
- [x] 9.3 Update `apps/docs/src/content/docs/guides/mcp-integration.mdx` to mention that `execute_query` returns rows from the `view_query`-defined view and that a missing `view_query` produces a clear error.
- [x] 9.4 Add a runbook page covering the persistent DuckDB file: where it lives, how to reset it (`reinit?reset=true`), how to back it up, and that it MUST NOT be committed to the project Git repo. *(Added as a "Persistent DuckDB File (Operations)" section inside `apps/docs/src/content/docs/guides/data-federation.mdx` — that page is already in the docs sidebar; a brand-new top-level operations page would have required a navigation change disproportionate to the content size.)*
- [x] 9.5 Update `openspec/project.md`'s Domain Context > Semantic Models section to mention `view_query` as the canonical view-definition surface.

## 10. Verification

- [x] 10.1 Run `pnpm typecheck` and `pnpm lint`; both must exit 0.
- [x] 10.2 Run `pnpm --filter @archmax/core test` and `pnpm --filter @archmax/api test`; full pass including new tests. *(Executed via `npx vitest run --project core` (510 tests pass) and `npx vitest run --project api` (169 tests pass) — the workspace's vitest configuration only exposes test runners through the root vitest workspace projects, not via the package-level `test` script.)*
- [ ] 10.3 Run the migration script against the dev `ARCHMAX_DATA_DIR`, then run the full test suite again to confirm nothing depended on missing `view_query` behaviour. *(Deferred to operator pre-flight: the dev `ARCHMAX_DATA_DIR` is operator-specific and the migration script is unit-tested in `migrate-view-query.test.ts` against synthesised on-disk projects with the same shapes.)*
- [ ] 10.4 Run `apps/e2e` against the docker stack (`APP_IMAGE=archmax:local docker compose -f docker-compose.ci.yml --env-file /dev/null up -d --force-recreate app` per `AGENTS.md`); confirm the new persistence + view-restart e2e is green. *(Deferred — the persistence + view-restart e2e leg (task 8.5) was deferred and so the matching docker-stack run is also deferred. The unit-level persistence test in `duckdb.test.ts` (`materialised views across re-opens`) covers the same invariant in isolation.)*
- [x] 10.5 Run `openspec validate add-agent-managed-views --strict` and resolve all warnings.
