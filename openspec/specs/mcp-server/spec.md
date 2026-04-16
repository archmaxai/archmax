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

### Requirement: Scoped DuckDB VIEWs

The `execute_query` tool SHALL maintain DuckDB VIEWs in per-model schemas named `_scope_<modelName>` (e.g., `_scope_ecommerce`). Each dataset becomes a VIEW named `_scope_<modelName>."<datasetName>"` that selects only the field expressions from the dataset's source table. When a field's logical `name` differs from its physical `expression`, the VIEW SHALL alias the expression to the logical name (e.g., `SELECT personid AS "person_id" FROM source`). Aliased columns MUST be queryable through the VIEW using the logical field name. VIEWs are created lazily on the first `execute_query` call for a model and cached using a content hash of the model's YAML file. Subsequent calls skip view creation if the hash matches. When the model changes (e.g., after a publish), the hash mismatch triggers view recreation. The DuckDB `search_path` is set to the model's scoped schema before query execution, so agents use bare dataset names (e.g., `FROM "orders"`) and DuckDB resolves them to the scoped VIEWs. The `get_semantic_model` overview SHALL annotate each dataset with its bare table name (the dataset name) for use in queries. When a field expression cannot be resolved against the source table, the field SHALL be excluded from the VIEW and a warning SHALL be logged. The warning MUST include the dataset name, field name, and the error message from DuckDB.

#### Scenario: VIEW created from semantic model dataset
- **WHEN** `execute_query` is called with `modelName: "ecommerce"` and the model has dataset `orders` sourced from `shop.public.orders` with fields `order_id`, `total_amount`, `status`
- **THEN** a VIEW `_scope_ecommerce."orders"` is created as `SELECT order_id, total_amount, status FROM shop.public.orders`
- **AND** the `search_path` is set so `FROM "orders"` resolves to this VIEW
- **AND** queries against the VIEW return only those three columns

#### Scenario: VIEW reflects field expressions
- **WHEN** a dataset field has a computed expression (e.g., `c_first_name || ' ' || c_last_name`)
- **THEN** the VIEW includes the expression as a column with the field's name as alias

#### Scenario: VIEW correctly aliases renamed fields
- **WHEN** a dataset field has `name: "person_id"` and `expression: "personid"` (physical column is `personid`, logical name is `person_id`)
- **THEN** the VIEW includes `personid AS "person_id"` in its SELECT list
- **AND** querying `SELECT person_id FROM "dataset_name"` through the VIEW returns the correct data
- **AND** the column appears as `person_id` in query result metadata

#### Scenario: VIEWs cached between calls
- **WHEN** `execute_query` is called twice with the same `modelName` and the model has not changed
- **THEN** the second call skips VIEW creation entirely
- **AND** query execution proceeds using the existing VIEWs

#### Scenario: VIEWs refreshed on model change
- **WHEN** a semantic model is re-published and then `execute_query` is called
- **THEN** the content hash mismatch triggers VIEW recreation with the updated field definitions

#### Scenario: Concurrent queries for different models
- **WHEN** two concurrent `execute_query` calls arrive for models "ecommerce" and "analytics" that both have a dataset named "orders"
- **THEN** each call operates on its own schema (`_scope_ecommerce` and `_scope_analytics`) via per-connection `search_path`
- **AND** neither call's VIEWs interfere with the other

#### Scenario: Dataset names shown in model overview
- **WHEN** `get_semantic_model` is called for model "ecommerce"
- **THEN** each dataset row includes the bare dataset name as the table name for use in queries

#### Scenario: Invalid field expression excluded from VIEW
- **WHEN** a dataset field has an expression that cannot be resolved against the source table (e.g., the physical column was renamed or dropped)
- **THEN** the field is excluded from the VIEW
- **AND** a warning is logged with the dataset name, field name, and the DuckDB error message
- **AND** the remaining valid fields are still included in the VIEW

### Requirement: MCP Query SQL Validation

The `execute_query` tool SHALL validate all SQL queries before execution. Only `SELECT`, `WITH`, `EXPLAIN`, and `DESCRIBE` statements SHALL be allowed, and multi-statement queries SHALL be rejected. Queries SHALL be validated to ensure they do not reference raw attached catalog names directly — agents SHALL use bare dataset names which resolve via `search_path`. Explicit `_scope_` schema prefixes in queries SHALL be rejected with a message instructing the agent to use dataset names directly. The list of forbidden catalog names is derived from the project's active connection slugs.

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

### Requirement: MCP DuckDB Connection Hardening

Each `execute_query` invocation SHALL open a DuckDB connection with security hardening applied before query execution. The hardening SHALL include: `SET enable_external_access = false` (prevents file reads, network access, COPY operations), resource limits (`SET threads = 2`, `SET memory_limit = '512MB'`), and `SET search_path = '<scopeSchema>'` (resolves bare dataset names to the model's scoped VIEWs). Each setting SHALL be applied independently so that a failure on one does not skip the others. The `lock_configuration` setting SHALL NOT be used because it is instance-wide in DuckDB and would prevent per-connection `search_path` changes needed for model scoping; SQL validation (`validateReadOnlySQL`) serves as the primary guard against configuration tampering by rejecting all non-query statements. These settings SHALL be applied per-connection so they do not affect other DuckDB consumers (data browser, semantic model agent). The semantic model agent's `executeQuery` tool SHALL also apply the same `hardenConnection()` settings before executing any query, ensuring parity with the MCP code path.

#### Scenario: External access disabled
- **WHEN** an MCP query attempts `SELECT * FROM read_csv('/etc/passwd')`
- **THEN** the query fails because `enable_external_access` is false
- **AND** no file system content is returned

#### Scenario: SET statements blocked by SQL validation
- **WHEN** an MCP query attempts `SET enable_external_access = true`
- **THEN** the query is rejected by `validateReadOnlySQL` before execution because it is not a SELECT/WITH/EXPLAIN/DESCRIBE statement

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

