## MODIFIED Requirements

### Requirement: Semantic Layer Tools

The MCP server SHALL expose the following tools for AI agent consumption. The MCP server SHALL identify itself as `"archmax"` in the server name field. All tools operate within the scope of the project identified by the URL slug — `projectId` is no longer a tool parameter. Tools that return semantic model data SHALL filter results based on the authenticated token's `scopes` array. Tools SHALL assemble semantic models in memory and surface compact **markdown** through `SemanticModelDigest`; there is no `build/` artifact. **Production remains gated by publishing**: the production endpoint SHALL read the published `data_models/` from the project repository's latest commit (Git HEAD, via `isomorphic-git`), so uncommitted working-directory edits are not exposed. The testing endpoint SHALL read the live working-directory `data_models/`, reflecting the latest unpublished edits. The MCP tool registration, digest generation, and scope filtering code SHALL be shared between both modes with no conditional branches; only the source (committed tree vs working directory) differs. If a project has no published models (no commit exists, or the committed `data_models/` is empty), production model-related tools SHALL return an informational message indicating that the project has no published models and instructing the user to publish from the admin UI.

- `list_connections` — List all active connections for the project
- `list_semantic_models` — List semantic models the token has access to (filtered by scopes; production reads the committed `data_models/`)
- `get_semantic_model_overview` — Get a compact overview of an accessible semantic model (markdown digest of the published `data_models/`)
- `get_dataset_fields` — Get fields for a dataset within an accessible semantic model (read from the published `data_models/`)

#### Scenario: List semantic models filtered by token scope

- **WHEN** `list_semantic_models` is called with a token scoped to `["shopify"]`
- **AND** the project has published models `shopify`, `datev`, and `hrworks`
- **THEN** only the `shopify` model summary is returned

#### Scenario: Access denied for out-of-scope model

- **WHEN** `get_semantic_model_overview` is called for model `datev`
- **AND** the token's scopes are `["shopify"]`
- **THEN** an error content response with `isError: true` is returned indicating access denied

#### Scenario: Get dataset fields respects token scope

- **WHEN** `get_dataset_fields` is called for a dataset in an accessible published model
- **THEN** the fields are returned normally from the assembled published data

#### Scenario: No published models exist

- **WHEN** `list_semantic_models` is called on the production endpoint and the project has no commit (or the committed `data_models/` is empty)
- **THEN** a text response is returned indicating "No published models. Publish your semantic models from the admin UI to make them available here."

#### Scenario: Production serves the last published state, not live edits

- **WHEN** a model is edited and saved but not yet published, and a production tool is called
- **THEN** the tool reflects the committed (last-published) `data_models/`, not the uncommitted edit

#### Scenario: Testing endpoint serves the live working directory

- **WHEN** a tool is called through the testing MCP endpoint
- **THEN** the current working-directory `data_models/` files are assembled on-the-fly in memory
- **AND** the same tool code, digest logic, and scope filtering is used as in production
- **AND** the result reflects the latest saved source state, including unpublished edits
