## MODIFIED Requirements

### Requirement: Semantic Layer Tools

The MCP server SHALL expose the following tools for AI agent consumption. The MCP server SHALL identify itself as `"archmax"` in the server name field. All tools operate within the scope of the project identified by the URL slug — `projectId` is no longer a tool parameter. Tools that return semantic model data SHALL filter results based on the authenticated token's `scopes` array. Tools SHALL always read semantic model data from assembled single-file YAMLs — never from split source files directly. In production, the assembled files are read from the `build/` directory (populated by an explicit publish). In testing mode, the tools read from a temporary assembly of the current `src/` files. The MCP tool registration, digest generation, and scope filtering code SHALL be shared between both modes with no conditional branches. If no published build exists in production (the `build/` directory is empty or missing), model-related tools SHALL return an informational message indicating that the project has no published models.

- `list_semantic_models` — List semantic models the token has access to (filtered by scopes, reads assembled YAMLs)
- `get_semantic_model` — Get a compact overview of an accessible semantic model (reads assembled YAMLs)
- `get_datasets` — Get one or more datasets with their fields; each dataset entry specifies its own page for independent pagination (reads assembled YAMLs)
- `execute_query` — Run a read-only SQL query scoped to a single semantic model
- `request_improvement` — Submit an improvement request for a semantic model

The `get_datasets` tool SHALL accept a `modelName` (string, required) and a `datasets` array (required, 1–10 items). Each element in `datasets` SHALL be an object with `name` (string, required) and `page` (number, optional, default 1). This allows callers to paginate each dataset independently within a single batch call.

#### Scenario: List semantic models filtered by token scope

- **WHEN** `list_semantic_models` is called with a token scoped to `["shopify"]`
- **AND** the project has published models `shopify`, `datev`, and `hrworks` in `build/`
- **THEN** only the `shopify` model summary is returned

#### Scenario: Access denied for out-of-scope model

- **WHEN** `get_semantic_model` is called for model `datev`
- **AND** the token's scopes are `["shopify"]`
- **THEN** an error content response with `isError: true` is returned indicating access denied

#### Scenario: Get datasets with per-dataset pagination

- **WHEN** `get_datasets` is called with `modelName: "ecommerce"` and `datasets: [{ "name": "orders", "page": 1 }, { "name": "customers", "page": 3 }]`
- **THEN** page 1 of `orders` fields and page 3 of `customers` fields are returned

#### Scenario: Get datasets with default page

- **WHEN** `get_datasets` is called with `datasets: [{ "name": "orders" }]` and no `page` specified
- **THEN** page 1 of the dataset's fields is returned

#### Scenario: Read-only token blocks write operations

- **WHEN** a tool that performs write operations is called
- **AND** the token's permission is `"read"`
- **THEN** an error content response is returned indicating insufficient permissions

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

## RENAMED Requirements

- FROM: `### Requirement: MCP Suggest Improvement Tool`
- TO: `### Requirement: MCP Request Improvement Tool`

## MODIFIED Requirements

### Requirement: MCP Request Improvement Tool

The MCP server SHALL expose a `request_improvement` tool that allows external clients to submit structured improvement requests for a semantic model. The tool SHALL accept `modelName` (string, required), `title` (string, required, max 200 characters), and `description` (string, required, max 2000 characters). The tool SHALL validate that the specified `modelName` exists within the token's accessible scope before persisting. The tool SHALL reject calls from read-only tokens with an error indicating insufficient permissions. On success, an `Improvement` document SHALL be created with status `pending` and the token's name recorded as `createdVia`. The tool SHALL be logged via `McpCallLog` consistent with other tools.

#### Scenario: Successful improvement request

- **WHEN** `request_improvement` is called with `modelName: "ecommerce"`, `title: "Missing shipping_address field"`, `description: "The orders dataset is missing the shipping_address column which exists in the source table"`
- **AND** the token has write permission and `ecommerce` is in scope
- **THEN** an `Improvement` document is created with status `pending`, `modelName: "ecommerce"`, and `createdVia` set to the token's name
- **AND** a success message is returned: "Improvement request submitted successfully"

#### Scenario: Read-only token rejected

- **WHEN** `request_improvement` is called with a read-only token
- **THEN** an error content response with `isError: true` is returned indicating insufficient permissions

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
