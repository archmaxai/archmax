## MODIFIED Requirements

### Requirement: Semantic Model YAML Structure

A semantic model SHALL be stored as a YAML root file at `<SEMLAYER_DATA_DIR>/<projectId>/src/<modelName>.yaml` containing: `name` (string, required), `description` (string), `ai_context` (string or object with optional `instructions`, `synonyms`, `examples`), `relationships` (array), `metrics` (array), and `custom_extensions` (optional array of `{ vendor_name, data }` objects). Datasets SHALL NOT be stored in the root file when a per-dataset directory exists.

#### Scenario: Root file contains model-level data

- **WHEN** a semantic model is written to disk
- **THEN** the root YAML file is stored at `<SEMLAYER_DATA_DIR>/<projectId>/src/<modelName>.yaml`
- **AND** the file contains name, description, ai_context, relationships, metrics, and custom_extensions
- **AND** datasets are stored as individual files in a `src/<modelName>/` subdirectory

#### Scenario: AI context as structured object

- **WHEN** a model is saved with `ai_context: { instructions: "Use for retail analytics", synonyms: ["sales model"] }`
- **THEN** the AI context is persisted in the YAML file as a structured object

### Requirement: Dataset Files

Each dataset SHALL be stored as a separate YAML file at `<SEMLAYER_DATA_DIR>/<projectId>/src/<modelName>/<datasetName>.yaml` containing: `name` (string, required), `source` (string, e.g. `<connection>.<schema>.<table>`), `primary_key` (string array), `unique_keys` (array of string arrays), `description`, `ai_context`, `fields` (array of inline field objects), and `custom_extensions` (optional array of `{ vendor_name, data }` objects).

#### Scenario: Dataset with composite primary key

- **WHEN** a dataset file is written with `primary_key: ["item_sk", "ticket_number"]`
- **THEN** the composite primary key is stored in the dataset YAML at `src/<modelName>/<datasetName>.yaml`

#### Scenario: Dataset source reference

- **WHEN** a dataset is saved with `source: "tpcds.public.store_sales"`
- **THEN** the fully-qualified `<connection>.<schema>.<table>` reference is stored under `src/`

#### Scenario: Dataset with custom extensions

- **WHEN** a dataset is saved with `custom_extensions: [{ vendor_name: COMMON, data: '{"graph_x": 100}' }]`
- **THEN** the custom extensions are stored alongside the other dataset properties in the YAML file under `src/`

### Requirement: SemanticModelFileService

The system SHALL provide a `SemanticModelFileService` class that manages all YAML file I/O for semantic models. Source files live under `<SEMLAYER_DATA_DIR>/<projectId>/src/`. It SHALL expose: `list(projectId)` — read all models in a project, `get(projectId, name)` — assemble a full model from root + dataset files, `getDataset(projectId, modelName, datasetName)` — read a single dataset file, `write(projectId, model)` — split and write root + dataset files with atomic writes (temp file + rename), `delete(projectId, name)` — remove root file and dataset directory, `exists(projectId, name)`. The service SHALL check for the `src/` subdirectory first and fall back to the legacy root-level layout for backward compatibility during migration.

#### Scenario: List models reads YAML files from src directory

- **WHEN** `list("proj1")` is called
- **THEN** all `.yaml` files in `<SEMLAYER_DATA_DIR>/proj1/src/` are read, parsed, and returned as assembled models

#### Scenario: Get assembles from split files

- **WHEN** `get("proj1", "sales")` is called and a `src/sales/` subdirectory exists
- **THEN** the root file `src/sales.yaml` is read for model-level data
- **AND** each `.yaml` in `src/sales/` is read as a dataset
- **AND** the full assembled model is returned

#### Scenario: Get falls back to single-file format

- **WHEN** `get("proj1", "legacy")` is called and no `src/legacy/` subdirectory exists
- **THEN** the root file `src/legacy.yaml` is parsed as a complete model including inline datasets

#### Scenario: Legacy layout fallback

- **WHEN** `list("proj1")` is called and `<SEMLAYER_DATA_DIR>/proj1/src/` does not exist
- **AND** YAML files exist directly under `<SEMLAYER_DATA_DIR>/proj1/`
- **THEN** the service reads from the legacy root-level location

#### Scenario: Write splits model into files under src

- **WHEN** `write("proj1", model)` is called
- **THEN** the root file is written to `src/` without datasets
- **AND** each dataset is written as a separate file in `src/<modelName>/`
- **AND** stale dataset files no longer in the model are deleted

#### Scenario: Delete removes root and dataset directory

- **WHEN** `delete("proj1", "sales")` is called
- **THEN** `src/sales.yaml` is deleted
- **AND** the `src/sales/` directory is recursively removed

### Requirement: AGENTS.md Auto-Generation

After every `write()` or `delete()` operation, the file service SHALL regenerate an `AGENTS.md` file in the project root directory (`<SEMLAYER_DATA_DIR>/<projectId>/AGENTS.md`) summarizing all semantic models, their datasets, and metrics for AI assistant discovery.

#### Scenario: AGENTS.md regenerated after write

- **WHEN** a semantic model is written
- **THEN** `<SEMLAYER_DATA_DIR>/<projectId>/AGENTS.md` is regenerated at the project root
- **AND** it lists all models with their datasets and metrics

## ADDED Requirements

### Requirement: Source Directory Layout Migration

The system SHALL provide a migration script at `apps/api/src/scripts/migrate-src-layout.ts` that moves semantic model files from the legacy root-level layout (`<projectId>/<model>.yaml`) to the new `src/` subdirectory (`<projectId>/src/<model>.yaml`). The migration SHALL preserve the `uploads/` directory if it exists. The migration SHALL run automatically on app startup for any project directory that lacks a `src/` subdirectory but contains YAML files at the root level.

#### Scenario: Migration moves files to src subdirectory

- **WHEN** the migration detects YAML files at `<SEMLAYER_DATA_DIR>/<projectId>/model.yaml`
- **AND** no `<SEMLAYER_DATA_DIR>/<projectId>/src/` directory exists
- **THEN** `model.yaml` is moved to `<SEMLAYER_DATA_DIR>/<projectId>/src/model.yaml`
- **AND** the `model/` dataset directory (if present) is moved to `<SEMLAYER_DATA_DIR>/<projectId>/src/model/`
- **AND** `AGENTS.md` remains at `<SEMLAYER_DATA_DIR>/<projectId>/AGENTS.md` (project root)

#### Scenario: Migration preserves uploads directory

- **WHEN** the migration runs on a project with an existing `uploads/` directory
- **THEN** the `uploads/` directory remains at `<SEMLAYER_DATA_DIR>/<projectId>/uploads/` (not moved)

#### Scenario: Migration is idempotent

- **WHEN** the migration runs on a project that already has a `src/` subdirectory
- **THEN** no files are moved and no errors occur

### Requirement: Build Assembly

The system SHALL provide a `PublishService` with an `assemble(projectId, targetDir?)` method that reads all source models from `src/`, inlines their datasets, and writes fully-assembled single-file YAMLs to the target directory. When `targetDir` is omitted, the default is `build/`. The target directory SHALL contain only assembled YAML files — no `AGENTS.md` (that lives at the project root). Stale files in the target for models that no longer exist in source SHALL be removed during assembly. The same assembly logic SHALL be used for both persistent publishing (to `build/`) and temporary on-the-fly assembly (to a temp directory for MCP testing).

#### Scenario: Assemble creates single-file YAMLs in build directory

- **WHEN** `assemble("proj1")` is called for a project with models `shopify` and `datev` in `src/`
- **THEN** `<SEMLAYER_DATA_DIR>/proj1/build/shopify.yaml` contains the fully assembled model with inline datasets
- **AND** `<SEMLAYER_DATA_DIR>/proj1/build/datev.yaml` contains the fully assembled model with inline datasets

#### Scenario: Assemble to a custom target directory

- **WHEN** `assemble("proj1", "/tmp/proj1-test-build")` is called
- **THEN** the assembled YAMLs are written to `/tmp/proj1-test-build/` instead of `build/`
- **AND** the same assembly and cleanup logic is used as for the default `build/` target

#### Scenario: Stale build files are removed

- **WHEN** `assemble("proj1")` is called and `build/old_model.yaml` exists but `src/old_model.yaml` does not
- **THEN** `build/old_model.yaml` is deleted

#### Scenario: Build directory is created if missing

- **WHEN** `assemble("proj1")` is called for the first time
- **THEN** the target directory is created if it does not exist
