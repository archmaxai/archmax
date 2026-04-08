## MODIFIED Requirements

### Requirement: File-Based Storage

The system SHALL store semantic models as YAML files on disk in a per-project directory. The base directory is configured via the `SEMLAYER_DATA_DIR` environment variable, defaulting to `./data/projects` relative to the workspace root. Each project's semantic models are stored in `<SEMLAYER_DATA_DIR>/<projectId>/`. Semantic models are project-scoped and not tied to a specific connection. Each model SHALL be stored as a split layout: a root file `<name>.yaml` containing model-level fields (name, description, aiContext, relationships, metrics) and a subdirectory `<name>/` containing one `<datasetName>.yaml` file per dataset.

#### Scenario: List models with split layout

- **WHEN** the system lists semantic models for a project
- **THEN** all root `*.yaml` files in `<SEMLAYER_DATA_DIR>/<projectId>/` are enumerated and assembled with their dataset files from the corresponding `<name>/` subdirectories

#### Scenario: Read model assembles from split files

- **WHEN** the system reads a semantic model by name
- **THEN** the root file `<SEMLAYER_DATA_DIR>/<projectId>/<name>.yaml` is parsed, datasets are loaded from `<SEMLAYER_DATA_DIR>/<projectId>/<name>/<dataset>.yaml` files, and the assembled model is returned as a single `SemanticModel` object

#### Scenario: Write model splits into root and dataset files

- **WHEN** the system creates or updates a semantic model
- **THEN** the root file `<name>.yaml` is written with model-level fields (excluding datasets), each dataset is written to `<name>/<dataset.name>.yaml`, and any stale dataset files no longer in the model are removed

#### Scenario: Delete model removes root and dataset directory

- **WHEN** the system deletes a semantic model
- **THEN** both the root file `<name>.yaml` and the directory `<name>/` with all dataset files are removed from disk

#### Scenario: Backward-compatible read of legacy single-file models

- **WHEN** the system reads a model whose root file contains a non-empty `datasets` array and no `<name>/` subdirectory exists
- **THEN** the model is returned as-is from the single file (legacy format)

#### Scenario: Directory auto-creation

- **WHEN** a write targets a project or model directory that does not yet exist
- **THEN** the directories are created automatically before writing

## ADDED Requirements

### Requirement: Targeted Dataset Read

The system SHALL support reading a single dataset from a semantic model without loading the full model. The `SemanticModelFileService` SHALL expose a `getDataset(projectId, modelName, datasetName)` method that reads only `<SEMLAYER_DATA_DIR>/<projectId>/<modelName>/<datasetName>.yaml`.

#### Scenario: Read single dataset file

- **WHEN** `getDataset` is called with a valid project, model name, and dataset name
- **THEN** only the dataset file `<modelName>/<datasetName>.yaml` is read and returned without parsing the root file or other dataset files

#### Scenario: Dataset not found

- **WHEN** `getDataset` is called with a dataset name that has no corresponding file
- **THEN** `null` is returned

#### Scenario: MCP describe_dataset uses targeted read

- **WHEN** the MCP `describe_dataset` tool is called
- **THEN** it uses `getDataset` to read only the requested dataset file instead of loading and filtering the full model
