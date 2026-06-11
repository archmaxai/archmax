## MODIFIED Requirements

### Requirement: Semantic Layer Tools

The MCP server SHALL expose the following tools for AI agent consumption. The MCP server SHALL identify itself as `"archmax"` in the server name field. All tools operate within the scope of the project identified by the URL slug — `projectId` is no longer a tool parameter. Tools that return semantic model data SHALL filter results based on the authenticated token's `scopes` array. Tools SHALL read semantic model data from the project's current `data_models/` source via in-memory assembly (`SemanticModelFileService.get()`), surfacing compact **markdown** through `SemanticModelDigest`; there is no `build/` artifact and no published-snapshot gate. Both the production and testing MCP endpoints SHALL read the same live `data_models/` source — the MCP tool registration, digest generation, and scope filtering code SHALL be shared between both modes with no conditional branches. If a project has no semantic models (the `data_models/` directory is empty or missing), model-related tools SHALL return an informational message indicating that the project has no semantic models yet.

- `list_connections` — List all active connections for the project
- `list_semantic_models` — List semantic models the token has access to (filtered by scopes, read from `data_models/`)
- `get_semantic_model_overview` — Get a compact overview of an accessible semantic model (markdown digest of `data_models/` source)
- `get_dataset_fields` — Get fields for a dataset within an accessible semantic model (read from `data_models/`)

#### Scenario: List semantic models filtered by token scope

- **WHEN** `list_semantic_models` is called with a token scoped to `["shopify"]`
- **AND** the project has models `shopify`, `datev`, and `hrworks` in `data_models/`
- **THEN** only the `shopify` model summary is returned

#### Scenario: Access denied for out-of-scope model

- **WHEN** `get_semantic_model_overview` is called for model `datev`
- **AND** the token's scopes are `["shopify"]`
- **THEN** an error content response with `isError: true` is returned indicating access denied

#### Scenario: Get dataset fields respects token scope

- **WHEN** `get_dataset_fields` is called for a dataset in an accessible model
- **THEN** the fields are returned normally from the assembled `data_models/` data

#### Scenario: No semantic models exist

- **WHEN** `list_semantic_models` is called and the project's `data_models/` directory is empty or missing
- **THEN** a text response is returned indicating that the project has no semantic models yet

#### Scenario: Production and testing endpoints serve live source

- **WHEN** a tool is called through either the production or the testing MCP endpoint
- **THEN** the current `data_models/` files are assembled on-the-fly in memory
- **AND** the same tool code, digest logic, and scope filtering is used for both endpoints
- **AND** the result reflects the latest saved source state
