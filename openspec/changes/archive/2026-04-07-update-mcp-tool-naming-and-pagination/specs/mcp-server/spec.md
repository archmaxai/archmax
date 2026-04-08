## MODIFIED Requirements

### Requirement: Semantic Layer Tools

The MCP server SHALL expose the following tools for AI agent consumption. All tools operate within the scope of the project identified by the URL slug — `projectId` is no longer a tool parameter. Tools that return semantic model data SHALL filter results based on the authenticated token's `scopes` array. All digest tools (`get_semantic_model`, `get_dataset`) SHALL return plain markdown text, not JSON. The markdown format is optimized for LLM consumption and is not intended to be machine-parsed back into structured data.

- `list_connections` — List all active connections for the project
- `list_semantic_models` — List semantic models the token has access to (filtered by scopes)
- `get_semantic_model` — Get an overview of a semantic model with datasets, relationships, and metrics. Supports scoped pagination for large models (required: `modelName`; optional: `scope` enum `"datasets"` | `"relationships"` | `"metrics"`, `page` default 1). **BREAKING**: Renamed from `get_semantic_model_overview`.
- `get_dataset` — Get a dataset with all its fields as a compact markdown list with types, examples, enums, synonyms, and instructions. Paginated at 50 fields per page (required: `modelName`, `datasetName`; optional: `page` default 1). **BREAKING**: Renamed from `get_dataset_fields`, page size increased from 25 to 50.

#### Scenario: Get model overview without scope

- **WHEN** `get_semantic_model` is called with `modelName` and no `scope`
- **THEN** a compact markdown overview is returned containing: model name, description, ai_context instructions, a dataset summary table (name, source, field count, description), relationship join paths, and a metrics table (name, expression, description)
- **AND** each section that exceeds 50 items is truncated to the first 50 with a hint to use scoped pagination for more

#### Scenario: Get model datasets with scoped pagination

- **WHEN** `get_semantic_model` is called with `scope: "datasets"` and `page: 2` for a model with 80 datasets
- **THEN** datasets 51–80 are returned in the dataset summary table format
- **AND** the model header (name, description) is included for context
- **AND** pagination metadata indicates page 2 of 2

#### Scenario: Get model relationships with scoped pagination

- **WHEN** `get_semantic_model` is called with `scope: "relationships"` and `page: 1` for a model with 120 relationships
- **THEN** the first 50 relationship join paths are returned
- **AND** a hint indicates 70 more relationships on the next page

#### Scenario: Get model metrics with scoped pagination

- **WHEN** `get_semantic_model` is called with `scope: "metrics"` for a model with 10 metrics
- **THEN** all 10 metrics are returned in a single page
- **AND** no pagination hint is shown

#### Scenario: Get dataset returns paginated markdown

- **WHEN** `get_dataset` is called with a valid `modelName` and `datasetName`
- **THEN** a compact markdown field list is returned for the requested page (50 fields per page)
- **AND** each field entry includes: name, data type, description, example data, and (when present) enum values, computed expression, synonyms, and instructions
- **AND** if more fields exist beyond the current page, a hint indicates the next page number

#### Scenario: Dataset pagination at 50 fields per page

- **WHEN** `get_dataset` is called with `page: 2` for a dataset with 80 fields
- **THEN** fields 51–80 are returned
- **AND** no "next page" hint is included since this is the last page

#### Scenario: List semantic models filtered by token scope

- **WHEN** `list_semantic_models` is called with a token scoped to `["shopify"]`
- **AND** the project has models `shopify`, `datev`, and `hrworks`
- **THEN** only the `shopify` model summary is returned

#### Scenario: Access denied for out-of-scope model

- **WHEN** `get_semantic_model` is called for model `datev`
- **AND** the token's scopes are `["shopify"]`
- **THEN** an error content response with `isError: true` is returned indicating access denied

#### Scenario: Get dataset respects token scope

- **WHEN** `get_dataset` is called for a dataset in an accessible model
- **THEN** the dataset digest is returned normally

#### Scenario: Model not found

- **WHEN** `get_semantic_model` or `get_dataset` is called with a non-existent model name
- **THEN** an error content response with `isError: true` is returned

#### Scenario: Dataset not found

- **WHEN** `get_dataset` is called with a valid model but non-existent dataset name
- **THEN** an error content response with `isError: true` is returned

#### Scenario: Read-only token blocks write operations

- **WHEN** a tool that performs write operations is called
- **AND** the token's permission is `"read"`
- **THEN** an error content response is returned indicating insufficient permissions
