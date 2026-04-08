## MODIFIED Requirements

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

### Requirement: Semantic Layer Tools

The MCP server SHALL expose the following tools for AI agent consumption. All tools operate within the scope of the project identified by the URL slug — `projectId` is no longer a tool parameter. Tools that return semantic model data SHALL filter results based on the authenticated token's `scopes` array.

- `list_connections` — List all active connections for the project
- `list_semantic_models` — List semantic models the token has access to (filtered by scopes)
- `get_semantic_model_overview` — Get a compact overview of an accessible semantic model
- `get_dataset_fields` — Get fields for a dataset within an accessible semantic model

#### Scenario: List semantic models filtered by token scope

- **WHEN** `list_semantic_models` is called with a token scoped to `["shopify"]`
- **AND** the project has models `shopify`, `datev`, and `hrworks`
- **THEN** only the `shopify` model summary is returned

#### Scenario: Access denied for out-of-scope model

- **WHEN** `get_semantic_model_overview` is called for model `datev`
- **AND** the token's scopes are `["shopify"]`
- **THEN** an error content response with `isError: true` is returned indicating access denied

#### Scenario: Get dataset fields respects token scope

- **WHEN** `get_dataset_fields` is called for a dataset in an accessible model
- **THEN** the fields are returned normally

#### Scenario: Read-only token blocks write operations

- **WHEN** a tool that performs write operations is called
- **AND** the token's permission is `"read"`
- **THEN** an error content response is returned indicating insufficient permissions

### Requirement: Rate Limiting

The MCP endpoint SHALL rate limit requests per client IP, defaulting to `MCP_RATE_LIMIT_MAX` requests per 60-second window.

#### Scenario: Rate limit exceeded

- **WHEN** a client exceeds the rate limit
- **THEN** a 429 response with `Retry-After` header is returned
