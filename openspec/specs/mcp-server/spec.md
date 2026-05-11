# mcp-server Specification

## Purpose
JSON-RPC endpoint exposing semantic layer data as MCP tools for AI agent consumption. Allows AI agents to discover and query database schema semantics via a standard tool protocol.
## Requirements
### Requirement: MCP Endpoint

The API SHALL expose a POST endpoint at `/mcp/:projectSlug/mcp` that accepts JSON-RPC requests with `tools/list` and `tools/call` methods. The `:projectSlug` path parameter identifies the project by its unique slug. **BREAKING**: The previous endpoint at `/mcp/semlayer` is removed.

#### Scenario: List available tools

- **WHEN** a `tools/list` JSON-RPC request is received at `/mcp/:projectSlug/mcp`
- **THEN** all available MCP tools are returned with their names, descriptions, and input schemas
- **AND** tools that accept `projectId` no longer require it as a parameter (it is inferred from the URL)

#### Scenario: Call a tool

- **WHEN** a `tools/call` JSON-RPC request is received with a valid tool name and arguments
- **THEN** the tool is executed within the scope of the project identified by the slug
- **AND** results are returned in MCP content format

#### Scenario: Unknown tool

- **WHEN** a `tools/call` request references a non-existent tool
- **THEN** a JSON-RPC error with code -32601 is returned

#### Scenario: Invalid project slug

- **WHEN** a request is made to `/mcp/:projectSlug/mcp` with a slug that matches no project
- **THEN** a 404 error is returned

### Requirement: Bearer Token Auth

The MCP endpoint SHALL require a Bearer token for authentication. The token is validated by hashing it with SHA-256 and looking up a matching `McpToken` document scoped to the resolved project. The token MUST not be expired and not be soft-deleted. On successful auth, the token's `lastUsedAt` is updated. The `MCP_BEARER_TOKEN` environment variable is no longer used.

#### Scenario: Valid project-scoped token

- **WHEN** a request includes a valid `Authorization: Bearer <token>` header
- **AND** the token matches an active, non-expired McpToken for the project
- **THEN** the request is processed
- **AND** the token's `lastUsedAt` is updated

#### Scenario: Missing token

- **WHEN** a request has no Authorization header
- **THEN** a 401 error is returned

#### Scenario: Invalid token

- **WHEN** a request includes a Bearer token that does not match any McpToken for the project
- **THEN** a 401 error is returned

#### Scenario: Expired token

- **WHEN** a request includes a Bearer token whose corresponding McpToken has `expiresAt` in the past
- **THEN** a 401 error is returned

### Requirement: Rate Limiting

The MCP endpoint SHALL rate limit requests per client IP, defaulting to `MCP_RATE_LIMIT_MAX` requests per 60-second window.

#### Scenario: Rate limit exceeded

- **WHEN** a client exceeds the rate limit
- **THEN** a 429 response with `Retry-After` header is returned

### Requirement: Semantic Layer Tools

The MCP server SHALL expose the following tools for AI agent consumption. The MCP server SHALL identify itself as `"archmax"` in the server name field. All tools operate within the scope of the project identified by the URL slug — `projectId` is no longer a tool parameter. Tools that return semantic model data SHALL filter results based on the authenticated token's `scopes` array. Tools SHALL always read semantic model data from assembled single-file YAMLs — never from split source files directly. In production, the assembled files are read from the `build/` directory (populated by an explicit publish). In testing mode, the tools read from a temporary assembly of the current `src/` files. The MCP tool registration, digest generation, and scope filtering code SHALL be shared between both modes with no conditional branches. If no published build exists in production (the `build/` directory is empty or missing), model-related tools SHALL return an informational message indicating that the project has no published models.

- `list_connections` — List all active connections for the project
- `list_semantic_models` — List semantic models the token has access to (filtered by scopes, reads assembled YAMLs)
- `get_semantic_model_overview` — Get a compact overview of an accessible semantic model (reads assembled YAMLs)
- `get_dataset_fields` — Get fields for a dataset within an accessible semantic model (reads assembled YAMLs)

#### Scenario: List semantic models filtered by token scope

- **WHEN** `list_semantic_models` is called with a token scoped to `["shopify"]`
- **AND** the project has published models `shopify`, `datev`, and `hrworks` in `build/`
- **THEN** only the `shopify` model summary is returned

#### Scenario: Access denied for out-of-scope model

- **WHEN** `get_semantic_model_overview` is called for model `datev`
- **AND** the token's scopes are `["shopify"]`
- **THEN** an error content response with `isError: true` is returned indicating access denied

#### Scenario: Get dataset fields respects token scope

- **WHEN** `get_dataset_fields` is called for a dataset in an accessible published model
- **THEN** the fields are returned normally from assembled YAML data

#### Scenario: No published models exist

- **WHEN** `list_semantic_models` is called and the project's `build/` directory is empty or missing
- **THEN** a text response is returned indicating "No published models. Publish your semantic models from the admin UI to make them available here."

#### Scenario: Testing endpoint serves from temporary assembly

- **WHEN** a tool is called through the testing MCP endpoint
- **THEN** the current source files in `src/` are assembled on-the-fly into single-file YAMLs
- **AND** the same tool code, digest logic, and scope filtering is used as in production
- **AND** the result reflects the latest source state, not the last publish

#### Scenario: MCP client configuration uses archmax server name

- **WHEN** an external MCP client connects to the server
- **THEN** the server identifies itself with name `"archmax"`
- **AND** documentation examples show `mcpServers.archmax` as the configuration key

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

### Requirement: MCP DuckDB Connection Hardening

Each `execute_query` invocation SHALL open a DuckDB connection with security hardening applied before query execution. The hardening SHALL include: `SET enable_external_access = false` (prevents file reads, network access, COPY operations), resource limits (`SET threads = 2`, `SET memory_limit = '512MB'`), and `SET search_path = '<scopeSchema>'` (resolves bare dataset names to the model's scoped VIEWs). Each setting SHALL be applied independently so that a failure on one does not skip the others. The `lock_configuration` setting SHALL NOT be used because it is instance-wide in DuckDB and would prevent per-connection `search_path` changes needed for model scoping; SQL validation (`validateSqlAst`) serves as the primary guard against configuration tampering by rejecting all non-SELECT statements. These settings SHALL be applied per-connection so they do not affect other DuckDB consumers (data browser, semantic model agent). The semantic model agent's `executeQuery` tool SHALL also apply the same `hardenConnection()` settings before executing any query, ensuring parity with the MCP code path.

#### Scenario: External access disabled
- **WHEN** an MCP query attempts `SELECT * FROM read_csv('/etc/passwd')`
- **THEN** the query fails because `enable_external_access` is false
- **AND** no file system content is returned

#### Scenario: SET statements blocked by SQL validation
- **WHEN** an MCP query attempts `SET enable_external_access = true`
- **THEN** the query is rejected by `validateSqlAst` before execution because the parser refuses to serialise non-SELECT statements

#### Scenario: search_path resolves dataset names
- **WHEN** an MCP query uses `SELECT * FROM "orders"` for model "ecommerce"
- **THEN** DuckDB resolves `"orders"` via the `search_path` set to `_scope_ecommerce`
- **AND** the query executes against the scoped VIEW

#### Scenario: Different models get independent search paths
- **WHEN** two successive `execute_query` calls target models "ecommerce" and "analytics"
- **THEN** each connection's `search_path` is set to its own scoped schema
- **AND** bare dataset names resolve correctly for each model independently

#### Scenario: Resource limits applied
- **WHEN** an MCP query consumes excessive resources
- **THEN** the query is constrained by the configured thread and memory limits

#### Scenario: Agent executeQuery tool hardened
- **WHEN** the semantic model agent's `executeQuery` tool runs a query against DuckDB
- **THEN** `hardenConnection()` is applied to the connection before query execution
- **AND** `enable_external_access` is false, threads are limited to 2, and memory is limited to 512MB

### Requirement: MCP Request Improvement Tool

The MCP server SHALL expose a `request_improvement` tool that allows external clients to submit structured improvement requests for a semantic model. The tool SHALL accept `modelName` (string, required), `title` (string, required, max 200 characters), and `description` (string, required, max 2000 characters). The tool SHALL validate that the specified `modelName` exists within the token's accessible scope before persisting. On success, an `Improvement` document SHALL be created with status `pending` and the token's name recorded as `createdVia`. The tool SHALL be logged via `McpCallLog` consistent with other tools.

#### Scenario: Successful improvement request

- **WHEN** `request_improvement` is called with `modelName: "ecommerce"`, `title: "Missing shipping_address field"`, `description: "The orders dataset is missing the shipping_address column which exists in the source table"`
- **AND** `ecommerce` is in the token's scope
- **THEN** an `Improvement` document is created with status `pending`, `modelName: "ecommerce"`, and `createdVia` set to the token's name
- **AND** a success message is returned: "Improvement request submitted successfully"

#### Scenario: Model not in scope

- **WHEN** `request_improvement` is called with `modelName: "datev"`
- **AND** the token's scopes are `["shopify"]`
- **THEN** an error content response with `isError: true` is returned indicating access denied

#### Scenario: Model does not exist

- **WHEN** `request_improvement` is called with a `modelName` that has no published model
- **THEN** an error content response with `isError: true` is returned indicating the model was not found

#### Scenario: Input validation

- **WHEN** `request_improvement` is called with `title` exceeding 200 characters or `description` exceeding 2000 characters
- **THEN** an error content response is returned indicating the input exceeds length limits

### Requirement: MCP Session Token Re-validation

When an MCP request includes an `mcp-session-id` header referencing an existing session, the server SHALL re-validate the associated bearer token before processing the request. The server SHALL store the `tokenId` when a session is created. On each subsequent session request, the server SHALL verify that the token has not been soft-deleted and has not expired. If the token is no longer valid, the session SHALL be terminated and a 401 error returned.

#### Scenario: Revoked token rejected on session request
- **WHEN** a bearer token is revoked (soft-deleted) after an MCP session was established
- **AND** a subsequent request is made using the session's `mcp-session-id`
- **THEN** the server looks up the token by `tokenId`, finds it deleted, and returns a 401 error
- **AND** the session is removed from the session map

#### Scenario: Expired token rejected on session request
- **WHEN** a bearer token's `expiresAt` passes while an MCP session is active
- **AND** a subsequent request is made using the session's `mcp-session-id`
- **THEN** the server looks up the token, finds it expired, and returns a 401 error

#### Scenario: Valid token allows session request
- **WHEN** a session request includes a valid `mcp-session-id`
- **AND** the associated token is still active and not expired
- **THEN** the request is processed normally

### Requirement: MCP E2E Test Coverage

The project SHALL include a Playwright E2E test suite (`apps/e2e/tests/mcp.spec.ts`) that exercises the MCP server's full stack: bearer token authentication, tool invocation, scope enforcement, and token revocation. The test SHALL create a semantic model via the REST API referencing the e2e federated databases (Postgres, MySQL, MSSQL), publish it, and then interact with the MCP endpoint using JSON-RPC over HTTP. The test SHALL run in both CI and local Docker Compose environments using the same `docker-compose.ci.yml` stack.

#### Scenario: MCP tools return correct data from federated databases

- **WHEN** a semantic model `e2e_federation` is created with datasets sourced from Postgres (`e2e_products`), MySQL (`e2e_orders`), and MSSQL (`e2e_customers`)
- **AND** the model is published
- **AND** an MCP token scoped to `["e2e_federation"]` is created
- **THEN** `list_semantic_models` returns `e2e_federation`
- **AND** `get_semantic_model` returns the model overview with all three datasets
- **AND** `get_datasets` returns field details for each dataset
- **AND** `execute_query` with `SELECT * FROM "products" LIMIT 10` returns rows from the Postgres `e2e_products` table

#### Scenario: MCP scope enforcement in E2E

- **WHEN** an MCP token is scoped to `["other_model"]`
- **AND** the token is used to call `get_semantic_model` with `modelName: "e2e_federation"`
- **THEN** the response contains `isError: true` with an access denied message
- **AND** `list_semantic_models` returns no models

#### Scenario: MCP request improvement tool in E2E

- **WHEN** `request_improvement` is called with a valid token, `modelName: "e2e_federation"`, a title, and a description
- **THEN** the response indicates the improvement request was submitted successfully

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

