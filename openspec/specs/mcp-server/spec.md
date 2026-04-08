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

The MCP server SHALL expose the following tools for AI agent consumption:

- `list_semantic_models` — List semantic models the token has access to (filtered by token scopes), reading from YAML files on disk
- `get_semantic_model_overview` — Get a compact markdown overview of a semantic model: datasets, relationships, and metrics (required: `modelName`)
- `get_dataset_fields` — Get all fields for a dataset as a compact markdown list with types, examples, enums, synonyms, and instructions, paginated at 25 fields per page (required: `modelName`, `datasetName`; optional: `page`)
- `execute_query` — Run a scoped SQL query against the project's DuckDB instance (required: `modelName`, `sql`; optional: `params`). Each call is scoped to a single semantic model whose datasets become `_scope."<datasetName>"` VIEWs.

#### Scenario: List semantic models reads from disk
- **WHEN** `list_semantic_models` is called
- **THEN** the project's YAML files are read from `<SEMLAYER_DATA_DIR>/<projectId>/` and filtered to only models in the token's scopes
- **AND** a summary of each model (name, description, dataset count, metric count) is returned

#### Scenario: Get semantic model overview
- **WHEN** `get_semantic_model_overview` is called with a valid `modelName` that is in the token's scopes
- **THEN** a compact markdown digest of the model's datasets, relationships, and metrics is returned

#### Scenario: Get dataset fields paginated
- **WHEN** `get_dataset_fields` is called with a valid `modelName`, `datasetName`, and optional `page`
- **THEN** up to 25 fields are returned per page with type, example data, enums, and AI context

#### Scenario: Model not found
- **WHEN** `get_semantic_model_overview` or `get_dataset_fields` is called with a non-existent model name
- **THEN** an error content response with `isError: true` is returned

#### Scenario: Dataset not found
- **WHEN** `get_dataset_fields` is called with a valid model but non-existent dataset name
- **THEN** an error content response with `isError: true` is returned

#### Scenario: Access denied for out-of-scope model
- **WHEN** any tool is called with a model name not in the token's scopes
- **THEN** an error content response with `isError: true` and an "Access denied" message is returned

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

### Requirement: MCP DuckDB Connection Hardening

Each `execute_query` invocation SHALL open a DuckDB connection with security hardening applied before query execution. The hardening SHALL include: `SET enable_external_access = false` (prevents file reads, network access, COPY operations), resource limits (`SET threads = 2`, `SET memory_limit = '512MB'`), and `SET lock_configuration = true` (prevents any setting changes by injected SQL). These settings SHALL be applied per-connection so they do not affect other DuckDB consumers (data browser, semantic model agent).

#### Scenario: External access disabled
- **WHEN** an MCP query attempts `SELECT * FROM read_csv('/etc/passwd')`
- **THEN** the query fails because `enable_external_access` is false
- **AND** no file system content is returned

#### Scenario: Configuration locked
- **WHEN** an MCP query attempts `SET enable_external_access = true`
- **THEN** the SET statement fails because `lock_configuration` is true

#### Scenario: Resource limits applied
- **WHEN** an MCP query consumes excessive resources
- **THEN** the query is constrained by the configured thread and memory limits

