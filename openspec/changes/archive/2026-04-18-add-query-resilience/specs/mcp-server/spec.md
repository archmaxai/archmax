## MODIFIED Requirements

### Requirement: MCP Execute Query Tool

The MCP server SHALL expose an `execute_query` tool that runs read-only SQL queries scoped to a single semantic model. The tool requires a `modelName` parameter (selecting which model's datasets become available as tables), a `sql` string with positional placeholders (`$1`, `$2`, ...), and an optional `params` array of values. The tool SHALL also accept an optional `store` boolean parameter (default `true`). When `store` is `true`, the query (SQL text, params, and model name) SHALL be persisted as a `StoredQuery` document and the response SHALL include a `storedQueryId` field containing the stored query's ID. The tool description SHALL instruct agents that the returned `storedQueryId` can be passed to `execute_stored_query` to re-run the same query later, optionally with different parameters. Agents SHALL use bare dataset names as table names (e.g., `FROM orders`) — the DuckDB `search_path` is set to the model's scoped schema so that unqualified names resolve to the correct VIEWs automatically. Results SHALL be limited to 1000 rows with a configurable timeout (`QUERY_TIMEOUT_MS`, default 30000ms). On timeout, the DuckDB query SHALL be cancelled via `connection.interrupt()` and the timer SHALL be cleaned up. All calls SHALL be logged via `McpCallLog` with the SQL query and row count. The tool description SHALL instruct agents to use dataset names directly without schema prefixes.

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

#### Scenario: Query timeout with cancellation
- **WHEN** a query exceeds `QUERY_TIMEOUT_MS` (default 30s)
- **THEN** the DuckDB query is cancelled via `connection.interrupt()`
- **AND** the timeout timer is cleaned up
- **AND** an error is returned indicating the query timed out

#### Scenario: Result row limit
- **WHEN** a query returns more than 1000 rows
- **THEN** only the first 1000 rows are returned
- **AND** a `truncated: true` flag is included in the response

## ADDED Requirements

### Requirement: Per-Project Query Concurrency Control

The system SHALL enforce a per-project limit on concurrent DuckDB queries, configurable via the `MAX_CONCURRENT_QUERIES` environment variable (default: 10). When all query slots for a project are occupied, incoming queries SHALL wait for a slot. If no slot becomes available within `QUERY_TIMEOUT_MS`, the request SHALL be rejected with a clear error message indicating the concurrency limit has been reached. Different projects SHALL have independent concurrency limits. The concurrency control SHALL apply to all DuckDB query execution paths: MCP `execute_query`, MCP `execute_stored_query`, and the semantic model agent's `executeQuery` tool.

#### Scenario: Queries within concurrency limit execute normally
- **WHEN** fewer than `MAX_CONCURRENT_QUERIES` queries are running for a project
- **THEN** new queries execute immediately without queuing

#### Scenario: Excess queries are queued
- **WHEN** `MAX_CONCURRENT_QUERIES` queries are already running for a project
- **AND** a new query arrives
- **THEN** the new query waits for a slot to become available

#### Scenario: Queued query rejected after timeout
- **WHEN** all query slots are occupied for a project
- **AND** no slot becomes available within `QUERY_TIMEOUT_MS`
- **THEN** the waiting query is rejected with an error indicating the concurrency limit
- **AND** the slot is not consumed

#### Scenario: Independent limits per project
- **WHEN** project A has `MAX_CONCURRENT_QUERIES` queries running
- **AND** project B has available slots
- **THEN** queries for project B execute immediately regardless of project A's load

#### Scenario: Slot released after query completion
- **WHEN** a query finishes (success or failure)
- **THEN** the query slot is released and a waiting query may proceed

#### Scenario: Slot released after query timeout
- **WHEN** a query is cancelled due to `QUERY_TIMEOUT_MS` timeout
- **THEN** the query slot is released
