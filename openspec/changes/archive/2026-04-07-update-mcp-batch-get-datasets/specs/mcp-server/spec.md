## MODIFIED Requirements
### Requirement: Semantic Layer Tools

The MCP server SHALL expose the following tools for AI agent consumption. All tools operate within the scope of the project identified by the URL slug — `projectId` is no longer a tool parameter. Tools that return semantic model data SHALL filter results based on the authenticated token's `scopes` array. All digest tools (`get_semantic_model`, `get_datasets`) SHALL return plain markdown text, not JSON. The markdown format is optimized for LLM consumption and is not intended to be machine-parsed back into structured data.

- `list_semantic_models` — List semantic models the token has access to (filtered by scopes)
- `get_semantic_model` — Get a compact overview of a semantic model with datasets, relationships, and metrics; supports scoped pagination
- `get_datasets` — **BREAKING**: Replaces `get_dataset`. Accepts an array of dataset names (`datasetNames`, 1–10 entries) and returns a compact markdown field list for each. When a single dataset is requested, the `page` parameter enables field pagination. When multiple datasets are requested, page 1 of each is returned. Missing or inaccessible datasets produce an inline error marker rather than failing the entire call.
- `execute_query` — Run a read-only SQL query against scoped VIEWs derived from the token's allowed semantic models

#### Scenario: Batch multiple datasets in one call
- **WHEN** `get_datasets` is called with `modelName` and `datasetNames: ["orders", "customers", "products"]`
- **THEN** a single response is returned containing page 1 of each dataset's field digest
- **AND** each dataset section is separated by a clear delimiter
- **AND** the `page` parameter is ignored

#### Scenario: Single dataset with pagination
- **WHEN** `get_datasets` is called with `modelName` and `datasetNames: ["orders"]` and `page: 2`
- **THEN** the response contains page 2 of the `orders` dataset field digest
- **AND** behavior is identical to the former `get_dataset` tool

#### Scenario: Partial failure in batch
- **WHEN** `get_datasets` is called with `datasetNames: ["orders", "nonexistent", "customers"]`
- **THEN** digests for `orders` and `customers` are returned normally
- **AND** an inline error marker is included for `nonexistent` (e.g. `Dataset "nonexistent" not found in model "..."`)
- **AND** the overall response is NOT marked as `isError`

#### Scenario: All datasets not found
- **WHEN** `get_datasets` is called with `datasetNames: ["foo", "bar"]` and neither exists
- **THEN** the response contains inline error markers for each
- **AND** the overall response is marked as `isError: true`

#### Scenario: Access denied for model
- **WHEN** `get_datasets` is called for a model the token does not have access to
- **THEN** an error content response with `isError: true` is returned indicating access denied

#### Scenario: Get semantic model references get_datasets
- **WHEN** `get_semantic_model` is called with `modelName` and no `scope`
- **THEN** a compact markdown overview is returned containing: model name, description, ai_context instructions, a dataset summary table (name, source, field count, description), relationship join paths, and a metrics table (name, expression, description)
- **AND** each section that exceeds the configured page size is truncated with a hint to use scoped pagination for more

#### Scenario: Scoped pagination for datasets section
- **WHEN** `get_semantic_model` is called with `scope: "datasets"` and `page: 2` for a model with 80 datasets
- **THEN** datasets 51–80 are returned in the dataset summary table format
- **AND** the model header (name, description) is included for context
- **AND** pagination metadata indicates page 2 of 2

#### Scenario: Scoped pagination for relationships
- **WHEN** `get_semantic_model` is called with `scope: "relationships"` and `page: 1` for a model with 120 relationships
- **THEN** the first 50 relationship join paths are returned
- **AND** a hint indicates 70 more relationships on the next page

#### Scenario: Metrics fit on one page
- **WHEN** `get_semantic_model` is called with `scope: "metrics"` for a model with 10 metrics
- **THEN** all 10 metrics are returned in a single page
- **AND** no pagination hint is shown

#### Scenario: List semantic models filtered by token scope
- **WHEN** `list_semantic_models` is called with a token scoped to `["shopify"]`
- **AND** the project has models `shopify`, `datev`, and `hrworks`
- **THEN** only the `shopify` model summary is returned

#### Scenario: Access denied for out-of-scope model via get_semantic_model
- **WHEN** `get_semantic_model` is called for model `datev`
- **AND** the token's scopes are `["shopify"]`
- **THEN** an error content response with `isError: true` is returned indicating access denied

#### Scenario: Non-existent model
- **WHEN** `get_semantic_model` or `get_datasets` is called with a non-existent model name
- **THEN** an error content response with `isError: true` is returned

#### Scenario: Read-only token blocks write operations
- **WHEN** a tool that performs write operations is called
- **AND** the token's permission is `"read"`
- **THEN** an error content response is returned indicating insufficient permissions
