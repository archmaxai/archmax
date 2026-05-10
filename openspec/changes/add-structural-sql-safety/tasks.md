## 1. Verify DuckDB parser surface

- [x] 1.1 Confirm `json_serialize_sql(sql)` returns a stable JSON shape on the DuckDB version pinned in `packages/core/package.json` (`@duckdb/node-api`). Verified top-level keys: `error` (boolean), `statements` (array, on success), `error_type` / `error_message` / `error_subtype` / `position` (on failure). Each statement contains a `node` whose `type` is `SELECT_NODE` for SELECT/CTE forms.
- [ ] 1.2 Capture sample AST output for: bare `SELECT`, `WITH`-CTE, `EXPLAIN SELECT`, `EXPLAIN ANALYZE SELECT`, `PIVOT`, `UNPIVOT`, FROM-first SELECT, dollar-quoted strings, `U&"…"` identifiers, `SET_OPERATION_NODE` (UNION/INTERSECT/EXCEPT). Save fixtures under `packages/core/src/services/__fixtures__/sql-ast/`. Use the actual observed node-type names (`SELECT_NODE`, `BASE_TABLE`, `JOIN`, `TABLE_FUNCTION`, `SUBQUERY`, `EXPRESSION_LIST`, `PIVOT`, `COLUMN_REF`, `STAR`, `CONSTANT`, `FUNCTION`, `OPERATOR`, `CASE_EXPR`, `CAST`, `COMPARISON`, `SET_OPERATION_NODE`) when building the walker's allowlist.
- [x] 1.3 Confirm `json_serialize_sql` is parse-only: a query whose tables, schemas, or extensions do NOT exist in the parsing instance (`SELECT * FROM totally_nonexistent_table`, `SELECT * FROM information_schema.tables JOIN read_parquet('s3://x/y') USING (id)`, `WITH cte AS (SELECT * FROM "main"."missing") …`) parses successfully and returns a complete AST. The parsing instance therefore does NOT need the project's source tables, scoped views, attached catalogs, or extensions.
- [x] 1.4 Confirm `json_serialize_sql` returns parser errors as data (`{"error":true,"error_type":"parser","error_message":"…","position":"…"}`), not as thrown exceptions, so the validator can map them to a structural-validation rejection without try/catch on the SQL execution path.
- [ ] 1.5 Confirm `json_serialize_sql` accepts the SQL via a bound parameter (`?` placeholder) so the SQL text under validation is never interpolated into the parser query itself.

## 2. Implement structural validator

- [ ] 2.1 Create `packages/core/src/services/sql-ast-validation.ts` exporting `validateSqlAst(sql: string, opts: { catalogSlugs: string[]; modelName?: string }): Promise<string | null>`. Returns a human-readable rejection message or `null` on accept.
- [ ] 2.2 Implement a process-wide lazy `DuckDBInstance` for parsing only — no extensions, no attached catalogs, `enable_external_access=false`. Each parse opens a fresh connection, runs `SELECT json_serialize_sql(?)`, and disconnects, with a 1 s timeout via `withQueryTimeout`.
- [ ] 2.3 Implement the AST walker with an allowlist of permitted node `type` values (`SELECT_NODE`, `SET_OPERATION_NODE`, `CTE_NODE`, `RECURSIVE_CTE_NODE`, `BASE_TABLE_REF`, `JOIN_REF`, `SUBQUERY_REF`, `EXPRESSION_LIST_REF`, `TABLE_FUNCTION_REF`, `PIVOT_REF`, plus expression leaves). Any unknown `type` deny-fails.
- [ ] 2.4 Enforce `BASE_TABLE_REF.schema_name === ""` and `catalog_name === ""`. Forbidden table names (`information_schema`, `pg_catalog`, `sqlite_master`, `main`, `temp`, `system`) plus connection slugs plus any schema beginning with `_scope_` are matched against the resolved name in the AST, not the source text. (The `_scope_*` rule blocks every quoting variant — plain double-quoted, dollar-quoted, unicode-escaped, case-folded — of the platform's internal model-scoped view schemas.)
- [ ] 2.5 Enforce a `TABLE_FUNCTION_REF.function_name` allowlist: `generate_series`, `range`, `unnest`, `repeat`, `from_json`, `values`. Reject everything else, including `read_csv*`, `read_parquet*`, `read_json*`, `read_blob*`, `read_text*`, `duckdb_*`, `parse_sql`, `json_serialize_sql`.
- [ ] 2.6 Enforce a function-call denylist for non-table `FUNCTION` nodes covering `pg_read_*`, `pg_ls_dir`, `read_*`, `duckdb_*`, `nextval`, `currval`.
- [ ] 2.7 Reject when `statements` length ≠ 1, when the top-level node is not a SELECT/EXPLAIN-of-SELECT, or when the EXPLAIN node has `analyzed === true`.
- [ ] 2.8 Map any `error: true` payload from `json_serialize_sql` to a generic `"Could not parse query: <message>"` rejection so the parser's own diagnostics are surfaced verbatim.

## 3. Test the structural validator

- [ ] 3.1 Unit tests `packages/core/src/services/sql-ast-validation.test.ts` cover every accept/deny scenario in the spec deltas, including the parser-evasion corpus: quoted system identifiers (`"main"."x"`, `"information_schema"."tables"`), quoted `_scope_*` identifiers (`"_scope_ecommerce"."orders"`, `U&"\\005Fscope\\005Fecommerce"."orders"`, dollar-quoted variants, mixed case `"_SCOPE_ECOMMERCE"."orders"`), dollar-quoted strings containing `;`, `e''` escape strings, mid-token block comments, `EXPLAIN /*c*/ ANALYZE`, FROM-first SELECTs, PIVOT/UNPIVOT, U&"…" identifiers.
- [ ] 3.2 Property-based test that for every input in `__fixtures__/sql-ast/`, the validator's verdict matches the recorded expectation.
- [ ] 3.3 Test that the parsing connection is reused across calls (singleton instance), that a parse on a bad connection self-heals on the next call, and that the 1 s timeout fires on a hand-crafted slow input (or a `setTimeout`-mocked stand-in).

## 4. Wire into call sites

- [ ] 4.1 In `packages/core/src/services/mcp-tools.ts::executeScopedQuery` (`apps/api/src/services/agent.ts` re-export), call `validateSqlAst` after the existing `validateReadOnlySQL` + `validateScopedSQL` regex pre-filter and before `getProjectInstance`. Reject with the AST validator's message on any non-null return.
- [ ] 4.2 In `packages/core/src/services/agent-tools.ts::makeExecuteQueryTool`, add the same call on the same ordering. The semantic-model-agent path does not currently use `validateScopedSQL`; preserve that behaviour (the agent legitimately uses fully-qualified `catalog.schema.table` references) and pass an empty `catalogSlugs: []` so the AST validator only enforces the read-only / no-system-catalog / no-`read_*` rules. Document this divergence in code comments.
- [ ] 4.3 Add a feature flag `SQL_VALIDATION_AST` (read once at module load; default `true`). When `false`, the structural validator is skipped, preserving the regex-only path as a kill-switch.
- [ ] 4.4 Update `executeStoredQuery` to re-run `validateSqlAst` on the persisted SQL before execution, so a stored query that became forbidden after a code change cannot be replayed.

## 5. Integration tests

- [ ] 5.1 Extend `apps/api/src/routes/mcp-logs.integration.test.ts` (or a new `apps/api/src/mcp/sql-validation.integration.test.ts`) with the parser-evasion corpus, exercised through the full MCP `execute_query` JSON-RPC path. Assert each entry returns `isError: true` with a structural-validation message.
- [ ] 5.2 Add a happy-path integration assertion that an `EXPLAIN SELECT * FROM orders` (allowed) still passes after the new layer.
- [ ] 5.3 In `apps/e2e/tests/mcp.spec.ts`, add one e2e assertion that `SELECT * FROM "information_schema"."tables"` is rejected via the MCP endpoint (not via the unit validator) — this ensures the wiring is real end-to-end.

## 6. Update existing tests

- [ ] 6.1 Update `apps/api/src/services/agent.test.ts` to remove the `'a;b'` false-positive comment once the AST validator is the gate (or split it into "regex layer false positive" and "AST layer accept" coverage).
- [ ] 6.2 Update `packages/core/src/services/sql-validation.test.ts` to mark the regex layer's known false positives as such and assert that `validateSqlAst` accepts the same inputs.

## 7. Documentation

- [ ] 7.1 Update `apps/docs/src/content/docs/reference/mcp-tools.mdx` (and any related guide) to describe the structural validator, the allowed statement shape, and the extended denylist of system catalogs / table functions. This is user-facing because token holders will encounter the new error messages.
- [ ] 7.2 Add a short note in `apps/docs/src/content/docs/guides/data-federation.mdx` clarifying that bare dataset names are required (the AST validator now enforces this structurally, not just lexically).
- [ ] 7.3 Update `openspec/project.md` if the validator architecture changes how a contributor reasons about adding new MCP tools that accept SQL.

## 8. Verification

- [ ] 8.1 Run `pnpm typecheck` and `pnpm lint` and confirm both exit 0.
- [ ] 8.2 Run `pnpm --filter @archmax/core test` and `pnpm --filter @archmax/api test` and confirm full pass including the new corpus.
- [ ] 8.3 Run `apps/e2e` against the Docker Compose stack (`APP_IMAGE=archmax:local docker compose -f docker-compose.ci.yml --env-file /dev/null up -d --force-recreate app` per `AGENTS.md`) and confirm the MCP suite — including the new structural-rejection assertion — is green.
- [ ] 8.4 Run `openspec validate add-structural-sql-safety --strict` and confirm zero warnings.
