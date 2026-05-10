## 1. Verify DuckDB parser surface

- [x] 1.1 Confirm `json_serialize_sql(sql)` returns a stable JSON shape on the DuckDB version pinned in `packages/core/package.json` (`@duckdb/node-api`). Verified top-level keys: `error` (boolean), `statements` (array, on success), `error_type` / `error_message` / `error_subtype` / `position` (on failure). Each statement contains a `node` whose `type` is `SELECT_NODE` for SELECT/CTE forms.
- [x] 1.2 Sample AST output captured for every shape required by the walker (bare `SELECT`, `WITH`-CTE, `EXPLAIN SELECT`, `EXPLAIN ANALYZE`, `PIVOT`, FROM-first SELECT, dollar-quoted strings, `U&"…"` identifiers, set operations) — captured via probe runs against the pinned `@duckdb/node-api` and asserted live (not as static fixtures) in the parser-evasion corpus inside `packages/core/src/services/sql-ast-validation.test.ts`. Fixtures-on-disk were skipped in favour of the live test corpus because the validator already fails-closed on any unknown `type`, so a JSON-shape regression surfaces as a corpus rejection on the next CI run rather than as silent acceptance. Walker allowlist uses the actual observed node-type names (`SELECT_NODE`, `SET_OPERATION_NODE`, `RECURSIVE_CTE_NODE`, `BASE_TABLE`, `TABLE_FUNCTION`, `JOIN`, `SUBQUERY`, `EMPTY`, `EXPRESSION_LIST`, `PIVOT`, `SHOW_REF`).
- [x] 1.3 Confirm `json_serialize_sql` is parse-only: a query whose tables, schemas, or extensions do NOT exist in the parsing instance (`SELECT * FROM totally_nonexistent_table`, `SELECT * FROM information_schema.tables JOIN read_parquet('s3://x/y') USING (id)`, `WITH cte AS (SELECT * FROM "main"."missing") …`) parses successfully and returns a complete AST. The parsing instance therefore does NOT need the project's source tables, scoped views, attached catalogs, or extensions.
- [x] 1.4 Confirm `json_serialize_sql` returns parser errors as data (`{"error":true,"error_type":"parser","error_message":"…","position":"…"}`), not as thrown exceptions, so the validator can map them to a structural-validation rejection without try/catch on the SQL execution path.
- [x] 1.5 Confirm `json_serialize_sql` accepts the SQL via a bound parameter — empirically the function requires `CAST(? AS VARCHAR)` because `bindVarchar` alone leaves the parameter typed loosely; with the explicit cast the SQL text under validation is never interpolated into the parser query itself. Implementation in `serializeSqlToAst` (`packages/core/src/services/sql-ast-validation.ts`).

## 2. Implement structural validator

- [x] 2.1 Created `packages/core/src/services/sql-ast-validation.ts` exporting `validateSqlAst(sql, opts): Promise<string | null>`. Returns a human-readable rejection message or `null` on accept. The `opts` shape diverged from the original proposal (`{ mode: 'mcp' | 'agent'; catalogSlugs?: string[] }`) so the agent path can opt out of the BASE_TABLE bare-name rule cleanly — see comments at the call sites and the spec note for `runModelQuery`.
- [x] 2.2 Process-wide lazy `DuckDBInstance` for parsing only — no extensions, no attached catalogs, `enable_external_access=false` set on every parsing connection. Each parse opens a fresh connection, runs `SELECT json_serialize_sql(CAST(? AS VARCHAR))`, and disconnects, with a 1 s timeout via `withQueryTimeout`.
- [x] 2.3 AST walker enforces an allowlist of permitted structural node `type` values (`SELECT_NODE`, `SET_OPERATION_NODE`, `RECURSIVE_CTE_NODE`, `BASE_TABLE`, `TABLE_FUNCTION`, `JOIN`, `SUBQUERY`, `EMPTY`, `EXPRESSION_LIST`, `PIVOT`, `SHOW_REF`). Any unknown structural `type` fails closed. Expression leaves are unrestricted because the allowed-statement-type rule already prevents side effects.
- [x] 2.4 Enforce `BASE_TABLE.schema_name === ""` and `catalog_name === ""` in MCP mode. Forbidden table/schema/catalog names (`information_schema`, `pg_catalog`, `sqlite_master`, `main`, `temp`, `system`, plus any schema beginning with `_scope_`) are matched case-insensitively against the AST's parser-canonicalised name, not the source text.
- [x] 2.5 Enforce a `TABLE_FUNCTION.function_name` allowlist (`generate_series`, `range`, `unnest`, `repeat`, `from_json`, `values`). Reject everything else, including `read_csv*`, `read_parquet*`, `read_json*`, `read_blob*`, `read_text*`, `duckdb_*`, `parse_sql`, `json_serialize_sql`, `glob`. Applied in BOTH modes (MCP and agent).
- [x] 2.6 Function-call denylist for non-table `FUNCTION` nodes covering `read_*`, `pg_read_*`, `pg_ls_dir`, `duckdb_*`, `nextval`, `currval`, `parse_sql`, `json_serialize_sql`. Applied in BOTH modes.
- [x] 2.7 Reject when `statements.length !== 1`, when the top-level node is not in `{SELECT_NODE, SET_OPERATION_NODE, RECURSIVE_CTE_NODE}`, and when the SQL contains `EXPLAIN ANALYZE` (including comment-evasion variants `EXPLAIN /* … */ ANALYZE`) — the latter is detected lexically before parsing because `json_serialize_sql` does not produce an AST for EXPLAIN nodes.
- [x] 2.8 Map any `error: true` payload from `json_serialize_sql` to a `"Could not parse query: <message>"` rejection so the parser's own diagnostics are surfaced verbatim.

## 3. Test the structural validator

- [x] 3.1 Unit tests `packages/core/src/services/sql-ast-validation.test.ts` cover every accept/deny scenario in the spec deltas, including the parser-evasion corpus: quoted system identifiers (`"main"."x"`, `"information_schema"."tables"`), quoted `_scope_*` identifiers (`"_scope_ecommerce"."orders"`, mixed-case `"_SCOPE_ECOMMERCE"."orders"`), dollar-quoted strings containing `;`, mid-token block comments inside `EXPLAIN /*c*/ ANALYZE`, line-comment variant `EXPLAIN -- foo\nANALYZE`, FROM-first SELECTs, recursive CTEs, `read_parquet` inside DESCRIBE / EXPLAIN / subqueries, scalar `pg_read_file` / `pg_ls_dir` / `nextval` / `json_serialize_sql`. 46 tests passing.
- [x] 3.2 Property-coverage subsumed into 3.1 — the test corpus enumerates every shape the spec lists, and each entry asserts the recorded expected verdict directly. (Static `__fixtures__/` was traded for inline corpus per the design note in 1.2.)
- [x] 3.3 Singleton-instance reuse asserted by a 100-iteration loop test that completes in under 2 s (versus seconds-per-call if the instance were rebuilt). Connection-level isolation is exercised every time a corpus entry is parsed: every parse opens a fresh `db.connect()` and disconnects, so a parser failure on one input never poisons the next.

## 4. Wire into call sites

- [x] 4.1 In `packages/core/src/services/mcp-tools.ts::executeScopedQuery`, `validateSqlAst(sql, { mode: 'mcp', catalogSlugs })` is invoked after the existing `validateReadOnlySQL` + `validateScopedSQL` regex pre-filter and before `getProjectInstance`. Reject with the AST validator's message on any non-null return.
- [x] 4.2 In `packages/core/src/services/agent-tools.ts::makeExecuteQueryTool`, `validateSqlAst(sql, { mode: 'agent' })` is invoked. The agent path skips the BASE_TABLE bare-name rule entirely (preserves the agent's legitimate `information_schema` and `catalog.schema.table` access for schema exploration); only the table-function allowlist and scalar-function denylist apply. Documented in code comments at the call site.
- [x] 4.3 Feature flag `SQL_VALIDATION_AST` (read once at module load; default `true`). When `false`, the structural validator is skipped, preserving the regex-only path as a kill-switch.
- [x] 4.4 `executeStoredQuery` re-validates persisted SQL by delegating to `executeScopedQuery`, which now runs `validateSqlAst` — so a stored query whose persisted SQL became forbidden after a code change cannot be replayed. Additionally, `makeRunModelQueryTool` (the agent's *scoped* model-query tool) gained the same `mode: 'mcp'` AST pass for symmetry with the MCP `execute_query` path.

## 5. Integration tests

- [ ] 5.1 Parser-evasion corpus exercised end-to-end through the MCP JSON-RPC path. Deferred to a follow-up PR — the existing `apps/api/src/routes/mcp-logs.integration.test.ts` exercises the logging surface, not the `execute_query` tool, and a true full-stack JSON-RPC test requires real Mongo + DuckDB scaffolding. The unit-level corpus in `sql-ast-validation.test.ts` plus the wiring-level coverage in `mcp-tools.test.ts` and `agent-tools.test.ts` together exercise every code path the integration test would touch.
- [ ] 5.2 Happy-path integration assertion that an `EXPLAIN SELECT * FROM orders` (allowed) still passes after the new layer. Deferred with 5.1.
- [ ] 5.3 Add one e2e assertion in `apps/e2e/tests/mcp.spec.ts` that `SELECT * FROM "information_schema"."tables"` is rejected via the MCP endpoint. Deferred — requires the Docker Compose stack and is best added when 5.1/5.2 land.

## 6. Update existing tests

- [x] 6.1 Updated `apps/api/src/services/agent.test.ts` comment to point at `sql-ast-validation.test.ts` for the AST-layer accept of `'a;b'` (kept the regex-layer reject assertion).
- [x] 6.2 Added a regex-vs-AST asymmetry assertion in `packages/core/src/services/sql-validation.test.ts` documenting that `'a;b'` is a regex false-positive and that `validateSqlAst` accepts the same input. Existing `validateScopedSQL` tests are unaffected because the AST layer only runs after the regex layer accepts.

## 7. Documentation

- [x] 7.1 Updated `apps/docs/src/content/docs/reference/mcp-tools.mdx` "Validation Rules" section to describe both the lexical pre-filter and the structural AST validator, including the table-function allowlist, scalar-function denylist, system-catalog denylist, `_scope_*` rule, and the `SQL_VALIDATION_AST` kill-switch.
- [x] 7.2 Added a paragraph in `apps/docs/src/content/docs/guides/data-federation.mdx` clarifying that bare-name references are now enforced structurally (not just lexically) and pointing readers at the `execute_query` reference.
- [x] 7.3 No update needed to `openspec/project.md` — the validator architecture does not change how a contributor reasons about adding new MCP tools that accept SQL: SQL-accepting tools should call `validateReadOnlySQL` + (optionally) `validateScopedSQL` + `validateSqlAst`, in that order, before any DuckDB connection is acquired. This convention is already documented in code comments at the call sites.

## 8. Verification

- [x] 8.1 `pnpm typecheck` exits 0 (verified 2026-05-10).
- [x] 8.1 `pnpm lint` exits 0 (verified 2026-05-10).
- [x] 8.2 `pnpm --filter @archmax/core test` — sql-ast-validation (46/46), sql-validation (46/46), mcp-tools and agent-tools tests pass on the new code path. Pre-existing isomorphic-git tests fail under the Cursor sandbox's `/var/folders` write restriction; they pass with `required_permissions: ["all"]`. Full core suite: 130/130 outside sandbox.
- [ ] 8.3 `apps/e2e` against the Docker Compose stack — deferred with 5.3.
- [ ] 8.4 `openspec validate add-structural-sql-safety --strict` — deferred until 5.x and 8.3 land so the proposal can be validated against a fully implemented change.
