## MODIFIED Requirements

### Requirement: Semantic Layer Tools

The MCP server SHALL expose the following tools for AI agent consumption:

- `list_projects` — List all projects with their titles and descriptions
- `get_project_connections` — List all active connections for a project (required: `projectId`)
- `list_semantic_models` — List all semantic models for a project by reading YAML files from disk (required: `projectId`)
- `get_semantic_model` — Get a full semantic model with datasets, fields, relationships, and metrics by reading a YAML file (required: `projectId`, `modelName`). Pagination uses the project's configured `mcpPageSize` (default `50`).
- `describe_dataset` — Get a dataset with all its fields from a semantic model YAML file (required: `projectId`, `modelName`, `datasetName`). Field pagination uses the project's configured `mcpPageSize` (default `50`).

All paginated MCP tools SHALL use the project's `mcpPageSize` setting to determine items per page. When the project has no explicit `mcpPageSize`, the default of `50` SHALL be used.

#### Scenario: List semantic models reads from disk
- **WHEN** `list_semantic_models` is called with a valid `projectId`
- **THEN** the project's YAML files are read from `<SEMLAYER_DATA_DIR>/<projectId>/` and a summary of each model (name, description) is returned

#### Scenario: Get semantic model reads YAML file
- **WHEN** `get_semantic_model` is called with a valid `projectId` and `modelName`
- **THEN** the corresponding YAML file is parsed and the full model (datasets, fields, relationships, metrics) is returned

#### Scenario: Describe dataset from YAML
- **WHEN** `describe_dataset` is called with a valid `projectId`, `modelName`, and `datasetName`
- **THEN** the dataset and its inline fields are extracted from the YAML file and returned

#### Scenario: Model not found
- **WHEN** `get_semantic_model` or `describe_dataset` is called with a non-existent model name
- **THEN** an error content response with `isError: true` is returned

#### Scenario: Dataset not found
- **WHEN** `describe_dataset` is called with a valid model but non-existent dataset name
- **THEN** an error content response with `isError: true` is returned

#### Scenario: Project-specific page size applied
- **WHEN** a project has `mcpPageSize: 25` and `get_semantic_model` is called with `scope: "datasets"` on a model with 40 datasets
- **THEN** the first page returns 25 datasets with a pagination hint for the remaining 15

#### Scenario: Default page size when not configured
- **WHEN** a project has no `mcpPageSize` set and `get_dataset` is called on a dataset with 80 fields
- **THEN** the first page returns 50 fields (the default) with a pagination hint for the remaining 30
