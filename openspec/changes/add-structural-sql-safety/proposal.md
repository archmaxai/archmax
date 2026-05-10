# Change: Structural SQL safety check via AST parsing

## Why

The current `execute_query` validators in `packages/core/src/services/sql-validation.ts` are purely regex-based. They are known to be string-form fragile: the agent-side test suite at `apps/api/src/services/agent.test.ts:107-113` already documents a false positive (`SELECT 'a;b' FROM t` is rejected because the regex cannot see inside string literals), and the inverse class — *false negatives* — is more concerning. Quoting tricks (`"main"."foo"`), DuckDB-specific string forms (`$$…;DROP TABLE x;…$$`, `e'\\x21'`, `U&"\\006D\\0061\\0069\\006E"."x"`), comments injected mid-token (`EXPLAIN /*x*/ ANALYZE …`), DuckDB FROM-first / PIVOT / UNPIVOT statements, and bare `read_*` aliases registered as macros are all examples where a regex either over- or under-matches. We need a validator that uses the same parser DuckDB uses to execute, so the rules cannot disagree about what a query "really is".

## What Changes

- Introduce a structural SQL validator built on top of DuckDB's own parser via the `json_serialize_sql(sql)` table function (already shipping in DuckDB 1.x). The validator parses the user-submitted SQL on a dedicated, isolated DuckDB connection (no extensions, no attached catalogs) and walks the resulting JSON AST.
- The AST walker enforces, in a way that string formatting cannot evade:
  - exactly one top-level statement, of type `SELECT_NODE` or an `EXPLAIN` wrapper (with `analyze=false`) over a SELECT/WITH;
  - every `BASE_TABLE_REF` / `TABLE_FUNCTION_REF` has empty `schema_name` and `catalog_name` (bare names only — schema resolution is the server's job via `search_path`);
  - no table-function reference to `read_csv*`, `read_parquet*`, `read_json*`, `read_blob*`, `parse_sql`, `json_serialize_sql`, `duckdb_*`, or any function whose name is on the explicit denylist;
  - no `PRAGMA`, `SET`, `COPY`, `ATTACH`, `DETACH`, `INSTALL`, `LOAD`, `CREATE SECRET`, or any non-read node anywhere in the tree;
  - no reference to system catalogs (`information_schema`, `pg_catalog`, `sqlite_master`, `main`, `temp`, `system`) or to the project's connection slugs.
- Layer the new check **after** the existing regex pre-filter and **before** query execution. The regex pre-filter remains as a microsecond-cheap deny path that catches obvious junk before paying for a parse round-trip; connection-level hardening (`enable_external_access=false`, `READ_ONLY` ATTACH, `search_path`, resource limits) remains untouched.
- Apply the structural validator to both call sites that currently consume `validateReadOnlySQL`/`validateScopedSQL`: the MCP `execute_query` tool (`packages/core/src/services/mcp-tools.ts`) and the semantic-model-agent `executeQuery` tool (`packages/core/src/services/agent-tools.ts`).
- Add a parser-evasion test corpus covering quoted system-schema references, dollar-quoted strings, `e''` escapes, mid-token comments, `EXPLAIN ANALYZE` written with comments, `PIVOT`/`UNPIVOT`, FROM-first SELECTs, and unicode-escaped identifiers. The corpus runs against the structural validator and is required to reject every entry.
- Document — in `design.md` — why per-token / per-query DuckDB instance replication or child-process isolation was considered and rejected as the *primary* mechanism (it does not address the string-form ambiguity that motivated the change, and the per-process cost is 100–1000× a parse).

## Impact

- Affected specs:
  - `mcp-server` — `MCP Query SQL Validation` requirement modified to add the structural pass; new requirement `Structural SQL AST Validation` added.
  - `semantic-model-agent` — `executeQuery Tool` requirement modified to require the same structural pass.
- Affected code:
  - `packages/core/src/services/sql-validation.ts` (regex layer kept; signature gains a structural step or is composed by a new module)
  - new `packages/core/src/services/sql-ast-validation.ts`
  - `packages/core/src/services/mcp-tools.ts` (`executeScopedQuery`, line ~233)
  - `packages/core/src/services/agent-tools.ts` (`makeExecuteQueryTool`, line ~24)
  - tests: `packages/core/src/services/sql-ast-validation.test.ts` (new), updates to `sql-validation.test.ts` and `apps/api/src/services/agent.test.ts`, plus an MCP integration test that exercises the parser-evasion corpus end-to-end through `execute_query`.
- No external dependency added — DuckDB ships `json_serialize_sql` natively. Per-query latency increases by one in-process DuckDB parse (~sub-millisecond) on the dedicated parsing connection.
