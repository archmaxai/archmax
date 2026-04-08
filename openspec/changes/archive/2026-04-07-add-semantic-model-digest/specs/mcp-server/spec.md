## MODIFIED Requirements

### Requirement: Semantic Layer Tools

The MCP server SHALL expose the following tools for AI agent consumption:

- `list_projects` — List all projects with their titles and descriptions
- `get_project_connections` — List all active connections for a project (required: `projectId`)
- `list_semantic_models` — List all semantic models for a project by reading YAML files from disk (required: `projectId`)
- `get_semantic_model_overview` — Get a compact markdown overview of a semantic model: model description, dataset summary table, relationship join paths, and metrics table (required: `projectId`, `modelName`)
- `get_dataset_fields` — Get all fields for a dataset as a compact markdown list with types, examples, enums, synonyms, and instructions. Paginated at 25 fields per page (required: `projectId`, `modelName`, `datasetName`; optional: `page`, default 1)

All digest tools (`get_semantic_model_overview`, `get_dataset_fields`) SHALL return plain markdown text, not JSON. The markdown format is optimized for LLM consumption and is not intended to be machine-parsed back into structured data.

#### Scenario: List semantic models reads from disk
- **WHEN** `list_semantic_models` is called with a valid `projectId`
- **THEN** the project's YAML files are read from `<SEMLAYER_DATA_DIR>/<projectId>/` and a summary of each model (name, description) is returned

#### Scenario: Get model overview returns markdown digest
- **WHEN** `get_semantic_model_overview` is called with a valid `projectId` and `modelName`
- **THEN** the corresponding YAML files are parsed and a compact markdown overview is returned
- **AND** the overview includes: model name, description, ai_context instructions, a dataset summary table (name, source, field count, description), relationship join paths, and a metrics table (name, expression, description)

#### Scenario: Get dataset fields returns paginated markdown
- **WHEN** `get_dataset_fields` is called with a valid `projectId`, `modelName`, and `datasetName`
- **THEN** a compact markdown field list is returned for the requested page
- **AND** each field entry includes: name, data type, description, example data, and (when present) enum values, computed expression, synonyms, and instructions
- **AND** if more fields exist beyond the current page, a hint indicates the next page number

#### Scenario: Dataset fields pagination
- **WHEN** `get_dataset_fields` is called with `page: 2` for a dataset with 40 fields (25 per page)
- **THEN** fields 26–40 are returned
- **AND** no "next page" hint is included since this is the last page

#### Scenario: Model not found
- **WHEN** `get_semantic_model_overview` or `get_dataset_fields` is called with a non-existent model name
- **THEN** an error content response with `isError: true` is returned

#### Scenario: Dataset not found
- **WHEN** `get_dataset_fields` is called with a valid model but non-existent dataset name
- **THEN** an error content response with `isError: true` is returned
