## MODIFIED Requirements

### Requirement: MCP Execute Query Tool

The MCP server SHALL expose an `execute_query` tool that runs read-only SQL queries scoped to a single semantic model. The tool requires a `modelName` parameter (selecting which model's datasets become `_scope_<modelName>.*` VIEWs), a `sql` string with positional placeholders (`$1`, `$2`, ...), and an optional `params` array of values. Results SHALL be limited to 1000 rows with a 30-second timeout. All calls SHALL be logged via `McpCallLog` with the SQL query and row count. The tool description SHALL explain the `_scope_<modelName>."<datasetName>"` naming convention without enumerating all VIEWs (agents discover datasets via `get_semantic_model` / `get_dataset`).

#### Scenario: Successful scoped query
- **WHEN** `execute_query` is called with `modelName: "ecommerce"` and a valid SELECT query referencing scoped VIEW names (e.g., `SELECT * FROM _scope_ecommerce."orders" LIMIT 10`)
- **THEN** VIEWs are available for the "ecommerce" model's datasets in the `_scope_ecommerce` schema
- **AND** the query is executed against the project's DuckDB instance
- **AND** results are returned as JSON with columns and rows
- **AND** the call is logged to McpCallLog

#### Scenario: Access denied for out-of-scope model in execute_query
- **WHEN** `execute_query` is called with a `modelName` not in the token's scopes
- **THEN** an error content response with `isError: true` and an "Access denied" message is returned

#### Scenario: Model not found in execute_query
- **WHEN** `execute_query` is called with a `modelName` that doesn't exist
- **THEN** an error content response with `isError: true` is returned

#### Scenario: Query with parameters
- **WHEN** `execute_query` is called with `modelName: "ecommerce"`, `sql: "SELECT * FROM _scope_ecommerce.\"orders\" WHERE status = $1"`, and `params: ["shipped"]`
- **THEN** the query is executed with parameterized binding
- **AND** results are returned normally

#### Scenario: Query timeout
- **WHEN** a query exceeds 30 seconds
- **THEN** the query is cancelled and an error is returned

#### Scenario: Result row limit
- **WHEN** a query returns more than 1000 rows
- **THEN** only the first 1000 rows are returned
- **AND** a `truncated: true` flag is included in the response

### Requirement: Scoped DuckDB VIEWs

The `execute_query` tool SHALL maintain DuckDB VIEWs in per-model schemas named `_scope_<modelName>` (e.g., `_scope_ecommerce`). Each dataset becomes a VIEW named `_scope_<modelName>."<datasetName>"` that selects only the field expressions from the dataset's source table. VIEWs are created lazily on the first `execute_query` call for a model and cached using a content hash of the model's YAML file. Subsequent calls skip view creation if the hash matches. When the model changes (e.g., after a publish), the hash mismatch triggers view recreation. The `get_semantic_model` overview SHALL annotate each dataset with its corresponding `_scope_<modelName>."<datasetName>"` VIEW name.

#### Scenario: VIEW created from semantic model dataset
- **WHEN** `execute_query` is called with `modelName: "ecommerce"` and the model has dataset `orders` sourced from `shop.public.orders` with fields `order_id`, `total_amount`, `status`
- **THEN** a VIEW `_scope_ecommerce."orders"` is created as `SELECT order_id, total_amount, status FROM shop.public.orders`
- **AND** queries against the VIEW return only those three columns

#### Scenario: VIEW reflects field expressions
- **WHEN** a dataset field has a computed expression (e.g., `c_first_name || ' ' || c_last_name`)
- **THEN** the VIEW includes the expression as a column with the field's name as alias

#### Scenario: VIEWs cached between calls
- **WHEN** `execute_query` is called twice with the same `modelName` and the model has not changed
- **THEN** the second call skips VIEW creation entirely
- **AND** query execution proceeds using the existing VIEWs

#### Scenario: VIEWs refreshed on model change
- **WHEN** a semantic model is re-published and then `execute_query` is called
- **THEN** the content hash mismatch triggers VIEW recreation with the updated field definitions

#### Scenario: Concurrent queries for different models
- **WHEN** two concurrent `execute_query` calls arrive for models "ecommerce" and "analytics" that both have a dataset named "orders"
- **THEN** each call operates on its own schema (`_scope_ecommerce` and `_scope_analytics`)
- **AND** neither call's VIEWs interfere with the other

#### Scenario: VIEW names shown in model overview
- **WHEN** `get_semantic_model` is called for model "ecommerce"
- **THEN** each dataset row includes the corresponding `_scope_ecommerce."<datasetName>"` VIEW name

### Requirement: MCP Query SQL Validation

The `execute_query` tool SHALL validate all SQL queries before execution. Only `SELECT`, `WITH`, `EXPLAIN`, and `DESCRIBE` statements SHALL be allowed, and multi-statement queries SHALL be rejected. Queries SHALL be validated to ensure they do not reference raw attached catalog names directly — only `_scope_<modelName>.*` table references for the requested model are permitted. References to other models' scoped schemas (e.g., `_scope_analytics.*` when querying `modelName: "ecommerce"`) SHALL be rejected. The list of forbidden catalog names is derived from the project's active connection slugs.

#### Scenario: Write query rejected
- **WHEN** any token submits `INSERT INTO _scope_ecommerce."orders" VALUES (1, 100, 'new')`
- **THEN** the query is rejected with an error before execution
- **AND** no database modification occurs

#### Scenario: Raw catalog reference rejected
- **WHEN** any token submits `SELECT * FROM shopify.public.orders`
- **THEN** the query is rejected with an error indicating that raw catalog references are not allowed
- **AND** the error suggests using `_scope_<modelName>.*` VIEW names instead

#### Scenario: Multi-statement query rejected
- **WHEN** any token submits `SELECT 1; DROP TABLE _scope_ecommerce."orders"`
- **THEN** the query is rejected before execution

#### Scenario: Valid scoped query passes validation
- **WHEN** a query references only `_scope_ecommerce.*` tables (e.g., `SELECT o.total_amount FROM _scope_ecommerce."orders" o`) and the `modelName` is "ecommerce"
- **THEN** the query passes validation and is executed

#### Scenario: Cross-model scope reference rejected
- **WHEN** `execute_query` is called with `modelName: "ecommerce"` and the SQL references `_scope_analytics."revenue"`
- **THEN** the query is rejected with an error indicating that only `_scope_ecommerce.*` VIEWs are accessible
