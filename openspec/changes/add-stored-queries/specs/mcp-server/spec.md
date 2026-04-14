## MODIFIED Requirements

### Requirement: MCP Execute Query Tool

The MCP server SHALL expose an `execute_query` tool that runs read-only SQL queries scoped to a single semantic model. The tool requires a `modelName` parameter (selecting which model's datasets become available as tables), a `sql` string with positional placeholders (`$1`, `$2`, ...), and an optional `params` array of values. The tool SHALL also accept an optional `store` boolean parameter (default `true`). When `store` is `true`, the query (SQL text, params, and model name) SHALL be persisted as a `StoredQuery` document and the response SHALL include a `storedQueryId` field containing the stored query's ID. The tool description SHALL instruct agents that the returned `storedQueryId` can be passed to `execute_stored_query` to re-run the same query later, optionally with different parameters. Agents SHALL use bare dataset names as table names (e.g., `FROM orders`) — the DuckDB `search_path` is set to the model's scoped schema so that unqualified names resolve to the correct VIEWs automatically. Results SHALL be limited to 1000 rows with a 30-second timeout. All calls SHALL be logged via `McpCallLog` with the SQL query and row count. The tool description SHALL instruct agents to use dataset names directly without schema prefixes.

#### Scenario: Successful scoped query with store enabled
- **WHEN** `execute_query` is called with `modelName: "ecommerce"`, a valid SELECT query, and `store: true` (or `store` omitted, defaulting to true)
- **THEN** the query is executed and results are returned as JSON with columns, rows, rowCount, and truncated fields
- **AND** the response JSON includes a `storedQueryId` string identifying the stored query
- **AND** a `StoredQuery` document is persisted with the SQL, params, modelName, project, and token association
- **AND** the call is logged to McpCallLog

#### Scenario: Successful scoped query with store disabled
- **WHEN** `execute_query` is called with `store: false`
- **THEN** the query is executed and results are returned normally
- **AND** no `storedQueryId` is included in the response
- **AND** no `StoredQuery` document is created

#### Scenario: Access denied for out-of-scope model in execute_query
- **WHEN** `execute_query` is called with a `modelName` not in the token's scopes
- **THEN** an error content response with `isError: true` and an "Access denied" message is returned

#### Scenario: Model not found in execute_query
- **WHEN** `execute_query` is called with a `modelName` that doesn't exist
- **THEN** an error content response with `isError: true` is returned

#### Scenario: Query with parameters
- **WHEN** `execute_query` is called with `modelName: "ecommerce"`, `sql: "SELECT * FROM \"orders\" WHERE status = $1"`, and `params: ["shipped"]`
- **THEN** the query is executed with parameterized binding
- **AND** results are returned normally

#### Scenario: Query timeout
- **WHEN** a query exceeds 30 seconds
- **THEN** the query is cancelled and an error is returned

#### Scenario: Result row limit
- **WHEN** a query returns more than 1000 rows
- **THEN** only the first 1000 rows are returned
- **AND** a `truncated: true` flag is included in the response

## ADDED Requirements

### Requirement: StoredQuery Persistence

The system SHALL persist stored queries as `StoredQuery` documents in MongoDB. Each document SHALL contain: `project` (ObjectId reference to Project), `tokenId` (ObjectId reference to McpToken, nullable), `modelName` (string), `sql` (string), and `params` (string array, default empty). Documents SHALL be timestamped with `createdAt` and indexed by `(project, createdAt)`. Stored queries do not expire automatically. The model SHALL follow the project's standard Mongoose pattern (interface, schema, hot-reload-safe export).

#### Scenario: StoredQuery created on execute_query
- **WHEN** `execute_query` is called with `store: true` and the query executes successfully
- **THEN** a `StoredQuery` document is created with the project ID, token ID, model name, SQL text, and params

#### Scenario: StoredQuery not created on error
- **WHEN** `execute_query` is called with `store: true` but the query fails (validation error, execution error, timeout)
- **THEN** no `StoredQuery` document is created

### Requirement: MCP Execute Stored Query Tool

The MCP server SHALL expose an `execute_stored_query` tool that re-executes a previously stored query by its ID. The tool SHALL accept a required `storedQueryId` string parameter and an optional `params` array of string values. When `params` is provided, it overrides the stored query's original parameters; when omitted, the stored parameters are used. The tool SHALL validate that the stored query belongs to the same project as the current request and that the model referenced by the stored query is within the token's scopes. The tool SHALL delegate query execution to the same `executeScopedQuery` logic used by `execute_query`, ensuring identical validation, scoping, hardening, and result formatting. All calls SHALL be logged via `McpCallLog`. The tool description SHALL explain that `storedQueryId` values are obtained from `execute_query` responses.

#### Scenario: Re-execute stored query with original params
- **WHEN** `execute_stored_query` is called with a valid `storedQueryId` and no `params`
- **THEN** the stored query's SQL and original params are used for execution
- **AND** results are returned in the same format as `execute_query`

#### Scenario: Re-execute stored query with overridden params
- **WHEN** `execute_stored_query` is called with a valid `storedQueryId` and `params: ["pending"]`
- **THEN** the stored query's SQL is executed with the provided params instead of the stored ones
- **AND** results are returned normally

#### Scenario: Stored query not found
- **WHEN** `execute_stored_query` is called with a `storedQueryId` that does not exist
- **THEN** an error content response with `isError: true` and a "Stored query not found" message is returned

#### Scenario: Stored query belongs to different project
- **WHEN** `execute_stored_query` is called with a `storedQueryId` that belongs to a different project
- **THEN** an error content response with `isError: true` and a "Stored query not found" message is returned (no information leakage)

#### Scenario: Stored query model out of scope
- **WHEN** `execute_stored_query` is called with a valid `storedQueryId` whose `modelName` is not in the token's scopes
- **THEN** an error content response with `isError: true` and an "Access denied" message is returned

