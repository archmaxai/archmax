## MODIFIED Requirements

### Requirement: Semantic Layer Tools

The MCP server SHALL expose the following tools for AI agent consumption:

- `list_projects` — List all projects with their titles and descriptions
- `get_project_connections` — List all active connections for a project (required: `projectId`)
- `list_semantic_models` — List all semantic models for a project by reading YAML files from disk (required: `projectId`)
- `get_semantic_model` — Get a full semantic model with datasets, fields, relationships, and metrics by reading a YAML file (required: `projectId`, `modelName`)
- `describe_dataset` — Get a dataset with all its fields from a semantic model YAML file (required: `projectId`, `modelName`, `datasetName`)

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
