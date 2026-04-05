# mcp-server Specification

## Purpose
JSON-RPC endpoint exposing semantic layer data as MCP tools for AI agent consumption. Allows AI agents to discover and query database schema semantics via a standard tool protocol.

## Requirements

### Requirement: MCP Endpoint

The API SHALL expose a POST endpoint at `/mcp/semlayer` that accepts JSON-RPC requests with `tools/list` and `tools/call` methods.

#### Scenario: List available tools

- **WHEN** a `tools/list` JSON-RPC request is received
- **THEN** all available MCP tools are returned with their names, descriptions, and input schemas

#### Scenario: Call a tool

- **WHEN** a `tools/call` JSON-RPC request is received with a valid tool name and arguments
- **THEN** the tool is executed and results are returned in MCP content format

#### Scenario: Unknown tool

- **WHEN** a `tools/call` request references a non-existent tool
- **THEN** a JSON-RPC error with code -32601 is returned

### Requirement: Bearer Token Auth

The MCP endpoint SHALL require a Bearer token for authentication. If `MCP_BEARER_TOKEN` is not set, an ephemeral token is generated and logged at startup.

#### Scenario: Valid token

- **WHEN** a request includes a valid `Authorization: Bearer <token>` header
- **THEN** the request is processed

#### Scenario: Missing token

- **WHEN** a request has no Authorization header
- **THEN** a 401 error is returned

#### Scenario: Invalid token

- **WHEN** a request includes an invalid Bearer token
- **THEN** a 401 error is returned

### Requirement: Rate Limiting

The MCP endpoint SHALL rate limit requests per client IP, defaulting to `MCP_RATE_LIMIT_MAX` requests per 60-second window.

#### Scenario: Rate limit exceeded

- **WHEN** a client exceeds the rate limit
- **THEN** a 429 response with `Retry-After` header is returned

### Requirement: Semantic Layer Tools

The MCP server SHALL expose the following tools:

- `list_data_sources` — List all active data sources with their descriptions
- `get_data_source` — Get full details for a named data source (required: `name`)
- `list_semantic_models` — List all active semantic models with populated data source references
- `get_semantic_model` — Get a specific semantic model by name (required: `name`)
- `describe_table` — Get column-level semantics for a table in a data source (required: `dataSource`, `table`)

#### Scenario: List data sources returns active only

- **WHEN** `list_data_sources` is called
- **THEN** only data sources with `isActive: true` are returned

#### Scenario: Describe table returns column details

- **WHEN** `describe_table` is called with a valid data source name and table name
- **THEN** the table's columns with types, descriptions, and key annotations are returned

#### Scenario: Get data source not found

- **WHEN** `get_data_source` is called with a name that doesn't exist
- **THEN** an error content response with `isError: true` is returned
