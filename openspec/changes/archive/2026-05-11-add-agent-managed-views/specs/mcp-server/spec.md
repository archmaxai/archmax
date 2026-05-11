## MODIFIED Requirements

### Requirement: Scoped DuckDB VIEWs

The `execute_query` tool SHALL maintain DuckDB VIEWs in per-model schemas named `_scope_<modelName>` (e.g., `_scope_ecommerce`). Each dataset becomes a VIEW named `_scope_<modelName>."<datasetName>"`. The VIEW body SHALL come from the dataset's `view_query` value inside its COMMON `custom_extensions` payload — the platform wraps the agent-authored SELECT body as `CREATE OR REPLACE VIEW _scope_<modelName>."<datasetName>" AS <view_query>`. The platform SHALL NOT auto-derive the VIEW body from the dataset's `fields` array; a dataset without a non-empty `view_query` SHALL produce no VIEW and SHALL surface an `isError: true` response when queried via `execute_query`.

VIEWs SHALL be (re)materialised on every model-scoped call (`execute_query` and the agent's equivalent). The platform SHALL NOT maintain an in-memory cache of "last seen view_query hash"; instead, it SHALL issue `CREATE OR REPLACE VIEW` for every dataset on every call, which is idempotent and inexpensive when the body is unchanged. The single source of truth for what a view SHOULD be is the dataset's `view_query` in YAML; the source of truth for what it currently IS is the persistent DuckDB file. Re-materialisation reads the former and rewrites the latter; no third-party cache exists.

The DuckDB `search_path` is set to the model's scoped schema before query execution, so MCP token holders use bare dataset names (e.g., `FROM "orders"`) and DuckDB resolves them to the scoped VIEWs. The `get_semantic_model` overview SHALL annotate each dataset with its bare table name (the dataset name) for use in queries.

Before issuing `CREATE OR REPLACE VIEW` for a dataset, the platform SHALL run the same SQL validator that gates `execute_query` against the `view_query` text. A `view_query` that fails validation SHALL be rejected: the previous VIEW (if any) is left in place untouched, and the failure is logged with the dataset name and the validator's message. A `view_query` that passes validation but fails at materialisation (e.g., references a column that no longer exists in the source table) SHALL surface the DuckDB error verbatim as a warning log including the dataset name; that dataset's VIEW is skipped for this call but other datasets in the model are unaffected.

#### Scenario: VIEW created from agent-authored view_query

- **WHEN** `execute_query` is called with `modelName: "ecommerce"` and the model's `orders` dataset has `view_query: "SELECT order_id, total_amount, status FROM shop.public.orders WHERE deleted_at IS NULL"`
- **THEN** the platform issues `CREATE OR REPLACE VIEW _scope_ecommerce."orders" AS SELECT order_id, total_amount, status FROM shop.public.orders WHERE deleted_at IS NULL`
- **AND** the `search_path` is set so `FROM "orders"` resolves to this VIEW
- **AND** queries against the VIEW return only non-deleted orders

#### Scenario: VIEW reflects view_query computed expressions

- **WHEN** a dataset's `view_query` includes `c_first_name || ' ' || c_last_name AS "full_name"`
- **THEN** the materialised VIEW exposes a `full_name` column with the computed value

#### Scenario: Dataset without view_query rejected

- **WHEN** `execute_query` is called against a model whose `orders` dataset has no `view_query` (or an empty `view_query`)
- **THEN** an `isError: true` content response is returned with a message naming the offending dataset and instructing the caller that the dataset's COMMON custom extension must define a `view_query`
- **AND** no VIEW is created for that dataset

#### Scenario: VIEWs always rematerialised on every call

- **WHEN** `execute_query` is called twice in succession with the same `modelName` and no dataset's `view_query` has changed
- **THEN** both calls issue `CREATE OR REPLACE VIEW` for every dataset in the model
- **AND** the platform does not maintain an in-memory hash cache of the last-applied `view_query` text
- **AND** the second call's results match the first's

#### Scenario: View body changes are picked up immediately

- **WHEN** a dataset's `view_query` is edited (the YAML is rewritten with a different body) and `execute_query` is called for the same model
- **THEN** the next `CREATE OR REPLACE VIEW` writes the new body
- **AND** the new body is observable to subsequent queries with no further coordination

#### Scenario: Concurrent queries for different models

- **WHEN** two concurrent `execute_query` calls arrive for models "ecommerce" and "analytics" that both have a dataset named "orders"
- **THEN** each call operates on its own schema (`_scope_ecommerce` and `_scope_analytics`) via per-connection `search_path`
- **AND** neither call's VIEWs interfere with the other

#### Scenario: Dataset names shown in model overview

- **WHEN** `get_semantic_model` is called for model "ecommerce"
- **THEN** each dataset row includes the bare dataset name as the table name for use in queries

#### Scenario: Invalid view_query rejected at materialisation

- **WHEN** a dataset's `view_query` references a forbidden table function (e.g., `read_csv('s3://…')`)
- **THEN** the SQL validator rejects the body before the `CREATE OR REPLACE VIEW` is issued
- **AND** the previous VIEW (if any) is left in place
- **AND** a warning is logged with the dataset name and the validator's message
- **AND** other datasets in the model continue to materialise normally

#### Scenario: view_query that fails to execute logs a warning

- **WHEN** a dataset's `view_query` references a column that no longer exists in the source table
- **THEN** the `CREATE OR REPLACE VIEW` statement fails with the DuckDB error
- **AND** a warning is logged with the dataset name and the DuckDB error message
- **AND** no VIEW is materialised for that dataset (other datasets in the model are unaffected)

### Requirement: MCP Query SQL Validation

The `execute_query` tool SHALL validate all SQL queries before execution. Only `SELECT`, `WITH`, `EXPLAIN`, and `DESCRIBE` statements SHALL be allowed, and multi-statement queries SHALL be rejected. Queries SHALL be validated to ensure they do not reference raw attached catalog names directly — agents SHALL use bare dataset names which resolve via `search_path`. Explicit `_scope_*` schema prefixes in queries SHALL be rejected with a message instructing the agent to use dataset names directly. The list of forbidden catalog names is derived from the project's active connection slugs.

Rejection of `_scope_*` references SHALL be enforced by **both** the lexical pre-filter (`validateScopedSQL`) and the structural AST validator (introduced by `add-structural-sql-safety`). Every `BASE_TABLE_REF` whose `schema_name` (case-insensitively, after the parser canonicalises quoting) begins with `_scope_` SHALL cause rejection at the structural layer, so that quoting variants like `"_scope_ecommerce"."orders"`, `U&"\\005Fscope\\005Fecommerce"."orders"`, dollar-quoted identifiers, or any other escape form cannot bypass the lexical regex. This invariant is the security boundary that keeps every MCP token holder inside the model's view sandbox; if it relaxes, a token scoped to one model could read datasets in any other model on the same project.

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

#### Scenario: Valid query using bare dataset names passes validation

- **WHEN** a query uses bare dataset names (e.g., `SELECT o.total_amount FROM "orders" o`) and the `modelName` is "ecommerce"
- **THEN** the query passes validation and is executed

#### Scenario: Explicit _scope_ prefix rejected

- **WHEN** `execute_query` is called with SQL referencing `_scope_ecommerce."orders"` or any `_scope_*` prefix
- **THEN** the query is rejected with an error instructing the agent to use dataset names directly via `search_path`

#### Scenario: Structural validator rejects quoted _scope_ references

- **WHEN** an MCP token holder submits `SELECT * FROM "_scope_ecommerce"."orders"` (the schema name in double quotes to evade the lexical regex)
- **THEN** the structural AST validator rejects the query because the resolved `BASE_TABLE_REF.schema_name` matches `_scope_*` after parser canonicalisation
- **AND** the error message instructs the caller to use bare dataset names

#### Scenario: Structural validator rejects unicode-escaped _scope_ references

- **WHEN** an MCP token holder submits a SQL where the schema identifier uses unicode escapes (e.g. `U&"\\005Fscope\\005Fanalytics"."revenue"`) or dollar-quoted identifiers that resolve to `_scope_<other_model>`
- **THEN** the structural AST validator rejects the query because the parser canonicalises the identifier to `_scope_…` before matching
- **AND** no DuckDB connection is opened
