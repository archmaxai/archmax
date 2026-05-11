## ADDED Requirements

### Requirement: Structural SQL AST Validation

The `execute_query` tool SHALL parse every submitted SQL statement using DuckDB's own parser before execution, and SHALL reject the query unless its abstract syntax tree (AST) matches a strict allowlisted shape. The parse SHALL be performed via DuckDB's `json_serialize_sql` function on a dedicated, process-wide DuckDB instance that has no extensions installed, no catalogs attached, and `enable_external_access=false`. The SQL SHALL be passed to `json_serialize_sql` via a bound parameter — never by string concatenation. Parser errors and parse timeouts SHALL be surfaced as a generic structural-validation rejection with the parser's own diagnostic message included verbatim. The structural validator SHALL run after the existing lexical pre-filter (`validateReadOnlySQL` + `validateScopedSQL`) and before any DuckDB connection is acquired against the project's federated instance.

The parsing instance SHALL NOT require any of the project's source tables, scoped views, attached catalogs, or extensions to validate a query — `json_serialize_sql` is parse-only and does not invoke DuckDB's binder. Table and view resolution happens only later, in the federated instance, when the query is actually `Prepare`/`Run`-ed.

The AST walker SHALL enforce, at every depth of the tree:

- Exactly one entry in the top-level `statements` array.
- The top-level statement type SHALL be a SELECT-shaped node (observed AST type: `SELECT_NODE`), optionally wrapped by an `EXPLAIN` node whose `analyzed` flag is `false`. Set-operation roots (`SET_OPERATION_NODE`) over SELECT children are also permitted. EXPLAIN ANALYZE, PRAGMA, SET, COPY, ATTACH, DETACH, INSTALL, LOAD, CREATE SECRET, CALL, and every DDL/DML statement type SHALL be rejected even if the engine would parse them.
- An allowlist of permitted intermediate node types covering only read-shaped constructs (observed types: `SELECT_NODE`, `SET_OPERATION_NODE`, `BASE_TABLE`, `JOIN`, `TABLE_FUNCTION`, `SUBQUERY`, `EXPRESSION_LIST`, `PIVOT`, plus expression leaves such as `COLUMN_REF`, `STAR`, `CONSTANT`, `FUNCTION`, `OPERATOR`, `CASE_EXPR`, `CAST`, `COMPARISON`). CTEs appear under `cte_map.map[*].value` of the enclosing `SELECT_NODE` and SHALL be traversed recursively. Any AST node whose type is not in the allowlist SHALL cause rejection (fail-closed default).
- Every base-table reference SHALL have empty `schema_name` and empty `catalog_name`. Bare table identifiers are required so that schema resolution remains the server's responsibility via `search_path`.
- Every base-table reference's resolved `table_name` (and, where present, `schema_name`/`catalog_name`) SHALL be matched, case-insensitively, against the union of system-catalog names (`information_schema`, `pg_catalog`, `sqlite_master`, `main`, `temp`, `system`), the project's active connection slugs, and any schema name beginning with `_scope_`; any match SHALL cause rejection. Matching SHALL be performed against the AST's parser-canonicalized name, not against the source SQL text, so that quoting variants (`"information_schema"`, `U&"…"`, `"main"."foo"`, dollar-quoted identifiers, unicode-escaped `_scope_*`, etc.) cannot evade the check. The `_scope_*` rule covers the platform's internal model-scoped view schemas — agents reference datasets by bare name only, never by their scoped-schema qualifier.
- Every `TABLE_FUNCTION` reference's `function_name` SHALL be in a small allowlist of read-only functions (e.g. `generate_series`, `range`, `unnest`, `repeat`, `from_json`, `values`). Any other table-function name — in particular `read_csv*`, `read_parquet*`, `read_json*`, `read_blob*`, `read_text*`, `parse_sql`, `json_serialize_sql`, and any function whose name begins with `duckdb_` — SHALL cause rejection.
- Scalar function calls anywhere in the tree (AST type `FUNCTION`) SHALL be checked against a denylist covering at minimum `read_*`, `pg_read_*`, `pg_ls_dir`, `duckdb_*`, `nextval`, and `currval`. Other functions are permitted because the allowed-statement-type rule already prevents side effects.

The structural validator SHALL be applied uniformly to all SQL paths into `execute_query`, including replays of stored queries (`execute_stored_query`); a stored query whose persisted SQL no longer passes structural validation SHALL be rejected at replay time even though it was valid when stored.

#### Scenario: Quoted system schema rejected by AST not regex
- **WHEN** any token submits `SELECT * FROM "information_schema"."tables"`
- **THEN** the structural validator parses the query, observes a base-table reference whose resolved name is `information_schema.tables`, and rejects it
- **AND** the rejection message references the structural-validation layer

#### Scenario: Dollar-quoted multi-statement evasion rejected
- **WHEN** any token submits `SELECT $tag$;DROP TABLE x;$tag$ FROM orders`
- **THEN** the lexical pre-filter may incorrectly flag the embedded semicolon, but if it does not, the structural validator parses the query, observes a single SELECT statement, and accepts it
- **AND** when any token submits a *genuine* multi-statement query like `SELECT 1; DROP TABLE orders`, the structural validator observes `statements.length === 2` and rejects it independently of the regex

#### Scenario: Comment-evasion of EXPLAIN ANALYZE rejected
- **WHEN** any token submits `EXPLAIN /*c*/ ANALYZE SELECT * FROM orders`
- **THEN** the structural validator parses the query, observes an EXPLAIN node with `analyzed === true`, and rejects it
- **AND** the rejection occurs even though the regex `^\s*EXPLAIN\s+ANALYZE\b` does not match

#### Scenario: Quoted catalog reference rejected
- **WHEN** any token submits `SELECT * FROM "shopify"."public"."orders"` and `shopify` is an active connection slug
- **THEN** the structural validator observes a base-table reference whose `catalog_name === "shopify"` and rejects it
- **AND** the rejection message indicates that direct catalog references are not allowed

#### Scenario: Quoted _scope_ schema rejected by AST
- **WHEN** any token submits `SELECT * FROM "_scope_ecommerce"."orders"` (or any other quoting variant of `_scope_<modelName>`, including dollar-quoted, unicode-escaped, and case-folded forms)
- **THEN** the structural validator observes a base-table reference whose resolved `schema_name` begins with `_scope_` and rejects it
- **AND** the rejection occurs even when the lexical pre-filter's `_scope_*` regex would have missed the quoting variant

#### Scenario: Unicode-escape identifier evasion rejected
- **WHEN** any token submits a query whose only table reference is written as `U&"\006D\0061\0069\006E"."x"` (which decodes to `main.x`)
- **THEN** the structural validator observes a resolved base-table reference of `main.x` and rejects it
- **AND** the rejection occurs on the AST, not on the source text

#### Scenario: Disallowed table function rejected
- **WHEN** any token submits `SELECT * FROM read_parquet('s3://bucket/secret.parquet')`
- **THEN** the structural validator observes a TABLE_FUNCTION_REF whose `function_name === "read_parquet"` and rejects it
- **AND** the rejection occurs even if `enable_external_access=false` would also have blocked execution

#### Scenario: Unknown AST node type rejected by default
- **WHEN** a future DuckDB version introduces a new statement-level node type that is not yet in the allowlist
- **AND** any token submits a query that produces that node type
- **THEN** the structural validator rejects the query with a generic "unsupported statement shape" message
- **AND** no execution is attempted

#### Scenario: Parser failure surfaced as rejection
- **WHEN** any token submits SQL that DuckDB cannot parse
- **THEN** the structural validator returns a rejection whose message contains the parser's own diagnostic
- **AND** no DuckDB connection against the project's federated instance is acquired

#### Scenario: Parsing connection isolated from project federation
- **WHEN** the structural validator parses any SQL
- **THEN** the parse is performed on the dedicated parsing instance, which has no attached catalogs and no extensions
- **AND** failures of the parsing instance do not affect the project's federated instance, scoped views, or query timeouts

#### Scenario: Parsing does not require source tables to exist
- **WHEN** the structural validator parses a query that references a table not present in the parsing instance (e.g. `SELECT * FROM totally_nonexistent_table`)
- **THEN** the parse succeeds and the validator inspects the resulting AST normally
- **AND** rejection or acceptance is decided solely on the AST shape (statement type, base-table schema/catalog/name, table-function name, scalar-function denylist), without invoking DuckDB's binder
- **AND** the parsing instance never sees the project's scoped views, attached catalogs, or extensions

### Requirement: Structural SQL Validator Feature Flag

The application SHALL read an environment variable `SQL_VALIDATION_AST` at startup. When set to `false`, the structural validator SHALL be skipped and only the lexical pre-filter applies; this is a kill-switch for the case where a DuckDB version regression breaks `json_serialize_sql`. The default value SHALL be `true`. The flag SHALL NOT disable any other security layer (lexical validators, connection hardening, scoped views, READ_ONLY ATTACH, search_path).

#### Scenario: Default behaviour
- **WHEN** `SQL_VALIDATION_AST` is unset
- **THEN** the structural validator runs on every `execute_query` invocation

#### Scenario: Kill-switch disables structural validator only
- **WHEN** `SQL_VALIDATION_AST=false`
- **THEN** the lexical pre-filter, connection hardening, READ_ONLY ATTACH, and search_path scoping continue to apply
- **AND** the structural validator is skipped

## MODIFIED Requirements

### Requirement: MCP Query SQL Validation

The `execute_query` tool SHALL validate all SQL queries before execution using a layered approach. A lexical pre-filter (`validateReadOnlySQL` + `validateScopedSQL`) SHALL run first as a cheap deny path: only `SELECT`, `WITH`, `EXPLAIN`, and `DESCRIBE` statements SHALL be allowed at the lexical layer, multi-statement queries SHALL be rejected, queries SHALL be checked for raw attached catalog names, and explicit `_scope_` schema prefixes SHALL be rejected. After the lexical pre-filter accepts a query, a structural validator (see "Structural SQL AST Validation") SHALL parse the query with DuckDB's own parser and walk the resulting AST against an allowlist; this structural pass is the authoritative gate, and any rule that the lexical pre-filter expresses approximately (statement count, statement type, system-catalog references, table-function denylist) SHALL also be enforced structurally so that quoting and escape forms cannot evade it. Both passes SHALL run before any DuckDB connection is acquired against the project's federated instance.

#### Scenario: Write query rejected
- **WHEN** any token submits `INSERT INTO "orders" VALUES (1, 100, 'new')`
- **THEN** the query is rejected with an error before execution
- **AND** no database modification occurs

#### Scenario: Raw catalog reference rejected
- **WHEN** any token submits `SELECT * FROM shopify.public.orders`
- **THEN** the query is rejected with an error indicating that raw catalog references are not allowed
- **AND** the error suggests using dataset names directly

#### Scenario: Multi-statement query rejected
- **WHEN** any token submits `SELECT 1; DROP TABLE "orders"`
- **THEN** the query is rejected before execution
- **AND** the rejection is enforced by both the lexical pre-filter and the structural validator independently

#### Scenario: Valid query using bare dataset names passes validation
- **WHEN** a query uses bare dataset names (e.g., `SELECT o.total_amount FROM "orders" o`) and the `modelName` is "ecommerce"
- **THEN** the query passes both lexical and structural validation and is executed

#### Scenario: Explicit _scope_ prefix rejected
- **WHEN** `execute_query` is called with SQL referencing `_scope_ecommerce."orders"` or any `_scope_*` prefix
- **THEN** the query is rejected with an error instructing the agent to use dataset names directly via `search_path`

#### Scenario: Quoting evasion rejected by structural validator
- **WHEN** any token submits a query whose source text is shaped to bypass lexical regex matching (e.g., quoted system schemas, unicode-escape identifiers, mid-token comments, dollar-quoted statement separators)
- **THEN** the structural validator parses the query and rejects it based on the AST's resolved names and node types
- **AND** the rejection does not depend on whether the lexical pre-filter caught the same input
