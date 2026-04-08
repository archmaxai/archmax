## MODIFIED Requirements

### Requirement: Semantic Layer Tools

The MCP server SHALL expose the following tools for AI agent consumption. The MCP server SHALL identify itself as `"archsem"` in the server name field. All tools operate within the scope of the project identified by the URL slug — `projectId` is no longer a tool parameter. Tools that return semantic model data SHALL filter results based on the authenticated token's `scopes` array. Tools SHALL always read semantic model data from assembled single-file YAMLs — never from split source files directly. In production, the assembled files are read from the `build/` directory (populated by an explicit publish). In testing mode, the tools read from a temporary assembly of the current `src/` files. The MCP tool registration, digest generation, and scope filtering code SHALL be shared between both modes with no conditional branches. If no published build exists in production (the `build/` directory is empty or missing), model-related tools SHALL return an informational message indicating that the project has no published models.

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

#### Scenario: MCP client configuration uses archsem server name

- **WHEN** an external MCP client connects to the server
- **THEN** the server identifies itself with name `"archsem"`
- **AND** documentation examples show `mcpServers.archsem` as the configuration key
