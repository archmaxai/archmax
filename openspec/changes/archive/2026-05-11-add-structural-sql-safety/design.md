## Context

`execute_query` is the only externally-reachable surface where a bearer-token holder gets to feed raw SQL into the project's DuckDB instance. We rely on three layers today:

1. **Lexical validators** (`validateReadOnlySQL`, `validateScopedSQL` in `packages/core/src/services/sql-validation.ts`) — regex matches against the raw SQL string.
2. **Connection hardening** (`hardenConnection` in `packages/core/src/services/duckdb.ts`) — `SET enable_external_access = false`, `SET memory_limit`, `SET threads`, `SET search_path = '_scope_<model>'`, plus `READ_ONLY` on `ATTACH`.
3. **Per-project resource isolation** — query timeout, concurrency semaphore, scoped views.

Layer 1 has a fundamental limitation: it does not understand SQL. The existing test suite at `apps/api/src/services/agent.test.ts:107-113` already encodes a known false positive that exists because the regex cannot tokenize string literals; the symmetrical concern is false *negatives* introduced by quoting and escape mechanisms DuckDB accepts but our regex doesn't model. Examples of inputs that warrant scrutiny:

- `SELECT * FROM "information_schema"."tables"` (quoted identifier; current `\binformation_schema\b` happens to still match, but `\bmain\.[a-z_]/i` is byte-level and would not match `"main"."foo"`).
- `SELECT * FROM /*foo*/ duckdb_tables/**/()` (comment between identifier and parenthesis).
- `EXPLAIN /*c*/ ANALYZE SELECT 1` (comment between `EXPLAIN` and `ANALYZE` defeats `^\s*EXPLAIN\s+ANALYZE\b`).
- `SELECT $tag$ ; DROP TABLE x ; $tag$ FROM t` (DuckDB dollar-quoted string — semicolons inside it are literal text but the regex `;\s*\S` flags it as multi-statement).
- `WITH foo AS (FROM orders SELECT *) SELECT * FROM foo` (DuckDB FROM-first syntax inside a CTE — passes the first-keyword allowlist, but the AST is still a SELECT, so it's actually safe; the point is the regex doesn't know that).
- Identifiers built with `U&"\\0064\\0075\\0063\\006B\\0064\\0062_tables"` (DuckDB accepts unicode-escape identifiers).

The user's framing — "is there an SQL parser that can disassemble the query, or should the duckdb instance be replicated?" — names two distinct mitigations. They address different threat classes.

## Goals / Non-Goals

- **Goals**
  - Prevent SQL whose *parse tree* contains anything outside the allowed shape, regardless of how it is spelled in source text.
  - Keep the validator deterministic and fast (sub-millisecond per query) so it can sit on the synchronous request path.
  - Reuse the DuckDB grammar that will execute the query, so validator and engine cannot disagree.
  - Preserve existing connection-level hardening unchanged.
- **Non-Goals**
  - Cross-database SQL portability (this is DuckDB-specific by design — using DuckDB's parser is the point).
  - Statement rewriting / autofix.
  - Replacing the `search_path` mechanism for dataset-name resolution.
  - Per-token process isolation (see Decisions below).

## Decisions

### Decision 1: Use DuckDB's own parser via `json_serialize_sql`, not a third-party TS parser

**What:** Obtain the AST by running `SELECT json_serialize_sql($1, skip_default := true, format := false)` on a dedicated, single-purpose DuckDB connection that has no extensions installed, no catalogs attached, and `enable_external_access=false`. Parse the JSON result and walk it. If `json_serialize_sql` returns an `error: true` payload, reject the query with the parser's own message.

**Alternatives considered:**

| Option | Pro | Con | Verdict |
|---|---|---|---|
| **DuckDB `json_serialize_sql`** (chosen) | Same parser as the engine. Zero new dependency. Handles every DuckDB-specific construct (PIVOT, FROM-first, dollar-quoting, U&"…"). | One in-process parse per query (~sub-ms). | **Chosen** |
| `sql-parser-cst` (TS library) | No DuckDB round-trip; pure JS. | Different grammar from DuckDB. PIVOT, dollar-quoting, FROM-first, COPY syntax variants would need bespoke handling. Will drift over time. | Rejected — the whole point is parser/engine agreement. |
| `pgsql-ast-parser`, `node-sql-parser` | Off-the-shelf. | Postgres-grammar-biased; same drift problem. | Rejected. |
| Hand-rolled DuckDB tokenizer | Full control. | Reinvents the engine's parser; high maintenance. | Rejected. |

### Decision 2: Walk the AST against an allowlist, not a denylist

**What:** The walker recurses through every node in `statements[*]` and asserts that each node's `type` (or `class`/`function_name` for expressions) is in a small set of permitted node types. Anything unknown is denied by default. Concretely:

- Top-level statement: exactly one entry; `type` must be `SELECT_NODE` or `EXPLAIN` (with `analyzed === false`) wrapping a SELECT/CTE.
- Permitted node `type`s in the tree: `SELECT_NODE`, `SET_OPERATION_NODE` (UNION/INTERSECT/EXCEPT), `CTE_NODE`, `RECURSIVE_CTE_NODE`, `BASE_TABLE_REF`, `JOIN_REF`, `SUBQUERY_REF`, `EXPRESSION_LIST_REF`, `TABLE_FUNCTION_REF` (with restricted function name), `PIVOT_REF`, plus all the leaf expression node types.
- For `BASE_TABLE_REF`: `schema_name` and `catalog_name` MUST be empty strings; `table_name` is opaque.
- For `TABLE_FUNCTION_REF`: `function_name` MUST be in a small, hand-maintained allowlist (`generate_series`, `range`, `unnest`, `repeat`, `from_json` …); explicitly NOT `read_csv*`, `read_parquet*`, `read_json*`, `read_blob*`, `read_text*`, `duckdb_*`, `parse_sql`, `json_serialize_sql`.
- For `FUNCTION` expressions: a denylist (`pg_read_*`, `read_*`, `duckdb_*`, `nextval`, `currval`) is enforced; everything else passes (the allowed-statement-type check already prevents side effects).

Allowlist over denylist because the DuckDB grammar adds new node types over time (Iceberg, vector ops, etc.) and we want the safe failure mode to be "reject and ask a human", not "accidentally accept".

### Decision 3: Keep the regex pre-filter as defense-in-depth

**What:** `validateReadOnlySQL` runs first. If it rejects, return its message immediately. If it accepts, run the structural validator. This means:

- Cost on the deny path stays at zero parse calls (regex catches obvious junk).
- Cost on the accept path is one parse.
- Bugs in either layer are caught by the other (asymmetric — regex over-blocks, AST under-blocks; together they're conservative).

The alternative — deleting the regex once AST lands — was considered. Rejected for now because (a) the regex layer is ~30 lines and well-tested, (b) it gives us a kill-switch (`SQL_VALIDATION_AST_ONLY=false`) if `json_serialize_sql` ever has a bug we need to bypass, and (c) the false-positive case (`'a;b'`) is rare in agent-generated SQL and acceptable until we verify the AST validator has been in production long enough to drop the belt.

### Decision 4: Do NOT replicate the DuckDB instance per token / spawn child processes

The user's other proposed mitigation was "replicate the DuckDB instance". This is a process-isolation control, not a parsing control, so it addresses a *different* threat: a hypothetical exploit where a malicious query escapes the DuckDB sandbox via a memory-safety bug in an extension. Several reasons this is not the right *primary* mechanism for the problem at hand:

1. **It does not address the string-form ambiguity** that motivated the change. An attacker who can submit raw SQL still runs it inside the per-token DuckDB; they just run it in a smaller blast radius.
2. **Cost is 100–1000× a parse**: spawning a process, attaching all the project's connections (each of which is a network round-trip to Postgres/MySQL/MSSQL with a credential hand-off), creating scoped views, then tearing it down — even pooled, this is multi-hundred-millisecond overhead per query.
3. **Existing in-process hardening already covers most of the threat**: `enable_external_access=false`, `READ_ONLY` on `ATTACH`, `lock_configuration` would-be (but can't because of `search_path`), and per-connection `SET`s. The remaining residual risk (DuckDB extension memory safety) is a vendor concern best mitigated at the OS layer (containerization) rather than per-query process spawning.
4. **It's a separate, larger change**: if we ever need it, it should be its own proposal that addresses pooling, connection-multiplexing, and the latency budget for MCP calls — not bundled with a string-form-ambiguity fix.

The defensible position is: **structural parsing is the right answer to "the regex is fooled by quoting"; process isolation is the right answer to "DuckDB itself has a vulnerability"**, and we are addressing the former, not the latter.

### Decision 5: Parsing connection lifecycle

The parser runs on a dedicated, lazy-initialized `DuckDBInstance` separate from the per-project federated instance. It has no extensions installed, no catalogs attached, `enable_external_access=false`, and is shared process-wide. The parsing itself is thread-safe via DuckDB's connection model (each parse opens a fresh `connection` from the shared instance, runs `SELECT json_serialize_sql(?)`, and disconnects). Bound parameter form (`?` placeholder) is used so the SQL text is never interpolated into the parser query — this is critical: we are not allowed to parse-by-concatenation a string we are simultaneously trying to validate.

**Crucially, `json_serialize_sql` is parse-only** — it invokes only the DuckDB parser, not the binder. This means the parsing instance does NOT need any of the project's source tables, scoped views, attached catalogs, or extensions to validate a query. Table/view resolution happens later in DuckDB's binder, which runs only when the query is actually `Prepare`/`Run`-ed against the project's federated instance. This decoupling has been verified empirically against the pinned `@duckdb/node-api` version with the following representative inputs:

- `SELECT a, b FROM totally_nonexistent_table WHERE x > 1` → parses successfully into a `SELECT_NODE` with a `BASE_TABLE` reference whose `schema_name=""`, `table_name="totally_nonexistent_table"`, `catalog_name=""`. No error despite the table not existing.
- `SELECT * FROM information_schema.tables JOIN read_parquet('s3://x/y') USING (id)` → parses successfully even though `information_schema` is empty and the parquet extension is not loaded. The AST contains a `BASE_TABLE` with `schema_name="information_schema"` and a `TABLE_FUNCTION` with `function_name="read_parquet"`, which is precisely what the AST walker needs to reject the query without ever resolving them.
- `WITH cte AS (SELECT * FROM "main"."missing") SELECT * FROM cte` → parses successfully; the parser canonicalizes the quoted identifier into `schema_name="main"`, `table_name="missing"`. This is the property that makes the structural validator immune to quoting variants: the AST stores the resolved name, not the source-text spelling.
- Genuine garbage like `NOT EVEN SQL` → `{"error":true,"error_type":"parser","error_message":"syntax error at or near \"NOT\"",…}`. Errors are returned as data, not thrown.

The observed top-level AST node types used by the walker's allowlist are therefore: `SELECT_NODE`, `SET_OPERATION_NODE`, `BASE_TABLE`, `JOIN`, `TABLE_FUNCTION`, `SUBQUERY`, `EXPRESSION_LIST`, `PIVOT`, plus expression leaves (`COLUMN_REF`, `STAR`, `CONSTANT`, `FUNCTION`, `OPERATOR`, `CASE_EXPR`, `CAST`, `COMPARISON`, etc.). CTEs appear under `cte_map.map[*].value` of the enclosing `SELECT_NODE`, not as a separate top-level node. The walker MUST traverse `cte_map` recursively to apply the same rules to every CTE body.

## Risks / Trade-offs

- **Risk:** DuckDB's `json_serialize_sql` JSON shape changes between versions, breaking the AST walker silently. **Mitigation:** the walker uses a strict allowlist on `type` values, so any unknown node type causes a deny (fail-closed). The parser-evasion test corpus runs against every version bump as part of CI; a breakage shows up as legitimate queries being rejected, not as malicious queries being accepted.
- **Risk:** The parser itself has a parsing-only bug (e.g., a query that crashes the parser or hangs). **Mitigation:** the parsing connection has a 1 s timeout via `withQueryTimeout`; on timeout the query is rejected with a generic "could not parse query" error.
- **Risk:** An allowed function name is a synonym for a forbidden one (e.g., DuckDB's `read_csv` has at least four aliases). **Mitigation:** the function denylist is matched against the *resolved* function name in the AST (DuckDB resolves aliases at parse time when `json_serialize_sql` is called); a follow-up test asserts that all known aliases of `read_csv` / `read_parquet` / etc. resolve to the same canonical name in the AST.
- **Trade-off:** ~sub-millisecond per query on the accept path. Negligible against the 30 s query budget but measurable in synthetic micro-benchmarks; we accept it because it eliminates a class of evasion bugs.
- **Trade-off:** Two validators, not one. We pay for that with slightly more code. We get a kill-switch and false-negative independence in return.

## Migration Plan

Single coordinated rollout:

1. Land `sql-ast-validation.ts` with full test coverage (parser-evasion corpus + AST-walk unit tests) but unwired.
2. Wire into `executeScopedQuery` and `makeExecuteQueryTool` behind a feature flag (`SQL_VALIDATION_AST=true`, default true in dev/test, default true in prod after step 4).
3. Run E2E suite (`apps/e2e/tests/mcp.spec.ts` + the new evasion-corpus test) against both code paths.
4. Remove the feature flag once verified; the regex pre-filter stays.
5. Rollback path: setting `SQL_VALIDATION_AST=false` reverts to the regex-only gate. The connection-hardening layer is unaffected.

## Open Questions

- Should the AST validator be moved upstream into `executeStoredQuery` as well (currently parameter-bound stored queries skip re-validation because the SQL was validated at store time)? Default answer: yes, for symmetry — but it is a marginal cost and we can defer if the test corpus shows zero regressions on stored queries.
- Should we expose a public `POST /api/projects/:id/sql/validate` endpoint that returns the AST validator's verdict for a given SQL string, so the playground UI can pre-flight queries before the user submits? This is a UX nicety and is out of scope for this proposal.
