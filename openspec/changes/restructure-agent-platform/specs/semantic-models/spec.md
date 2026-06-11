## REMOVED Requirements

### Requirement: Build Assembly

**Reason**: The disk build step is removed. `PublishService.assemble()` materialized fully-inlined single-file YAMLs under `build/` solely so production MCP could serve a last-published snapshot. MCP now reads the current `data_models/` directly (in-memory assembly + markdown digests), so no `build/` artifact is needed. See `mcp-server` and `semantic-model-publishing` deltas.
**Migration**: A startup cleanup (see "Build Directory Cleanup" below) removes any existing `build/` directory. `PublishService.assemble()`/`cleanStaleFiles()` are deleted; in-memory assembly continues via `SemanticModelFileService.get()`/`getRawYaml()`.

## RENAMED Requirements

- FROM: `### Requirement: Improvements UI in Semantic Models Sidebar`
- TO: `### Requirement: Improvements & Testing Panel`

- FROM: `### Requirement: Source Directory Layout Migration`
- TO: `### Requirement: Data Models Directory Layout Migration`

## MODIFIED Requirements

### Requirement: Improvements & Testing Panel

The Builder page side panel SHALL include an **Improvements & Testing** accordion section (formerly "Improvement Requests") below the Build section. The section SHALL display two kinds of entries:

1. **Improvement requests** — all improvement suggestions for the project. Each item SHALL show a lightbulb icon, the truncated title, and a checkmark overlay if the improvement has been implemented. Clicking an improvement SHALL navigate to its detail view in the main content area. Each improvement row SHALL show a trash icon on hover that soft-deletes the improvement when clicked, matching the conversation row delete pattern.
2. **Failing tests** — the project's currently failing test cases, sourced from `GET /api/projects/:projectId/test-cases/latest-results` (entries with `latestStatus` of `failed` or `error`). Each item SHALL show a distinct test/alert icon and the truncated test case title. Clicking a failing-test entry SHALL navigate to the latest run's detail page (`/$projectId/testing/runs/:runId`). Each failing-test row SHALL additionally offer a refine affordance (wand icon on hover) that opens `/$projectId/models/chat/new` with a `prefill` prompt built from the same `latest-results` payload — the case `inputMessage` and its `unmetFacts` — so the builder can improve the model without a second request.

The section header SHALL display a pending-count badge equal to the number of pending improvements plus the number of failing tests.

#### Scenario: Panel shows pending improvements

- **WHEN** the user views the Builder page and there are 3 pending improvements
- **THEN** the "Improvements & Testing" section shows 3 improvement items with lightbulb icons and no checkmarks

#### Scenario: Panel shows implemented improvements

- **WHEN** an improvement has status `implemented`
- **THEN** it appears in the panel with a checkmark icon overlay

#### Scenario: Panel shows failing tests

- **WHEN** two test cases have a latest run result of `failed` or `error`
- **THEN** the section lists both as failing-test entries with a test/alert icon
- **AND** the section header badge counts them together with pending improvements

#### Scenario: Failing test navigates to run detail

- **WHEN** the user clicks a failing-test entry
- **THEN** the browser navigates to the test run detail page of the latest run containing that case

#### Scenario: Refine a failing test from the panel

- **WHEN** the user activates the refine affordance on a failing-test entry
- **THEN** the Build chat opens at `/$projectId/models/chat/new` with a `prefill` prompt built from the entry's `inputMessage` and `unmetFacts` (falling back to the error message when an `error`-status case has no `unmetFacts`)

#### Scenario: Empty state

- **WHEN** there are no improvements and no failing tests for the project
- **THEN** the section shows a message indicating that improvement requests are submitted by MCP clients and failing tests appear after test runs

#### Scenario: Delete improvement from panel

- **WHEN** the user hovers over an improvement row and clicks the trash icon
- **THEN** the improvement is soft-deleted via the API and removed from the list
- **AND** if the deleted improvement was the active detail view, the user is navigated away

### Requirement: Semantic Model YAML Structure

A semantic model SHALL be stored as a YAML root file at `<ARCHMAX_DATA_DIR>/projects/<projectId>/data_models/<modelName>.yaml` containing: `name` (string, required), `description` (string), `ai_context` (string or object with optional `instructions`, `synonyms`, `examples`), `relationships` (array), `metrics` (array), and `custom_extensions` (optional array of `{ vendor_name, data }` objects). Datasets SHALL NOT be stored in the root file when a per-dataset directory exists.

#### Scenario: Root file contains model-level data

- **WHEN** a semantic model is written to disk
- **THEN** the root YAML file is stored at `<ARCHMAX_DATA_DIR>/projects/<projectId>/data_models/<modelName>.yaml`
- **AND** the file contains name, description, ai_context, relationships, metrics, and custom_extensions
- **AND** datasets are stored as individual files in a `data_models/<modelName>/` subdirectory

#### Scenario: AI context as structured object

- **WHEN** a model is saved with `ai_context: { instructions: "Use for retail analytics", synonyms: ["sales model"] }`
- **THEN** the AI context is persisted in the YAML file as a structured object

### Requirement: Dataset Files

Each dataset SHALL be stored as a separate YAML file at `<ARCHMAX_DATA_DIR>/projects/<projectId>/data_models/<modelName>/<datasetName>.yaml` containing: `name` (string, required), `source` (string, e.g. `<connection>.<schema>.<table>`), `primary_key` (string array), `unique_keys` (array of string arrays), `description`, `ai_context`, `fields` (array of inline field objects), and `custom_extensions` (optional array of `{ vendor_name, data }` objects).

#### Scenario: Dataset with composite primary key

- **WHEN** a dataset file is written with `primary_key: ["item_sk", "ticket_number"]`
- **THEN** the composite primary key is stored in the dataset YAML at `data_models/<modelName>/<datasetName>.yaml`

#### Scenario: Dataset source reference

- **WHEN** a dataset is saved with `source: "tpcds.public.store_sales"`
- **THEN** the fully-qualified `<connection>.<schema>.<table>` reference is stored under `data_models/`

#### Scenario: Dataset with custom extensions

- **WHEN** a dataset is saved with `custom_extensions: [{ vendor_name: COMMON, data: '{"graph_x": 100}' }]`
- **THEN** the custom extensions are stored alongside the other dataset properties in the YAML file under `data_models/`

### Requirement: SemanticModelFileService

The system SHALL provide a `SemanticModelFileService` class that manages all YAML file I/O for semantic models. Source files live under `<ARCHMAX_DATA_DIR>/projects/<projectId>/data_models/`. It SHALL expose: `list(projectId)` — read all models in a project, `get(projectId, name)` — assemble a full model from root + dataset files, `getDataset(projectId, modelName, datasetName)` — read a single dataset file, `write(projectId, model)` — split and write root + dataset files with atomic writes (temp file + rename), `delete(projectId, name)` — remove root file and dataset directory, `exists(projectId, name)`. The service SHALL check for the `data_models/` subdirectory first and fall back to the legacy `src/` subdirectory and then the legacy root-level layout for backward compatibility during migration.

#### Scenario: List models reads YAML files from data_models directory

- **WHEN** `list("proj1")` is called
- **THEN** all `.yaml` files in `<ARCHMAX_DATA_DIR>/proj1/data_models/` are read, parsed, and returned as assembled models

#### Scenario: Get assembles from split files

- **WHEN** `get("proj1", "sales")` is called and a `data_models/sales/` subdirectory exists
- **THEN** the root file `data_models/sales.yaml` is read for model-level data
- **AND** each `.yaml` in `data_models/sales/` is read as a dataset
- **AND** the full assembled model is returned

#### Scenario: Get falls back to single-file format

- **WHEN** `get("proj1", "legacy")` is called and no `data_models/legacy/` subdirectory exists
- **THEN** the root file `data_models/legacy.yaml` is parsed as a complete model including inline datasets

#### Scenario: Legacy layout fallback

- **WHEN** `list("proj1")` is called and `<ARCHMAX_DATA_DIR>/proj1/data_models/` does not exist
- **AND** YAML files exist under a legacy `src/` subdirectory or directly under `<ARCHMAX_DATA_DIR>/proj1/`
- **THEN** the service reads from the legacy location

#### Scenario: Write splits model into files under data_models

- **WHEN** `write("proj1", model)` is called
- **THEN** the root file is written to `data_models/` without datasets
- **AND** each dataset is written as a separate file in `data_models/<modelName>/`
- **AND** stale dataset files no longer in the model are deleted

#### Scenario: Delete removes root and dataset directory

- **WHEN** `delete("proj1", "sales")` is called
- **THEN** `data_models/sales.yaml` is deleted
- **AND** the `data_models/sales/` directory is recursively removed

### Requirement: Data Models Directory Layout Migration

The system SHALL provide a migration script at `apps/api/src/scripts/migrate-data-models-layout.ts` that moves semantic model files into the `data_models/` subdirectory (`<projectId>/data_models/<model>.yaml`) from either the legacy `src/` subdirectory (`<projectId>/src/<model>.yaml`) or the legacy root-level layout (`<projectId>/<model>.yaml`). The migration SHALL preserve the `uploads/` directory and any agent-scaffold directories (`commands/`, `agents/`, `skills/`, `hooks/`, `scripts/`) and `.mcp.json` if they exist. The migration SHALL run automatically on app startup for any project directory that lacks a `data_models/` subdirectory but contains YAML model files under `src/` or at the root level.

#### Scenario: Migration moves files from src to data_models

- **WHEN** the migration detects a `<ARCHMAX_DATA_DIR>/projects/<projectId>/src/` directory with model files
- **AND** no `<ARCHMAX_DATA_DIR>/projects/<projectId>/data_models/` directory exists
- **THEN** `src/model.yaml` is moved to `<ARCHMAX_DATA_DIR>/projects/<projectId>/data_models/model.yaml`
- **AND** the `src/model/` dataset directory (if present) is moved to `<ARCHMAX_DATA_DIR>/projects/<projectId>/data_models/model/`
- **AND** `AGENTS.md` remains at `<ARCHMAX_DATA_DIR>/projects/<projectId>/AGENTS.md` (project root)

#### Scenario: Migration moves files from legacy root layout

- **WHEN** the migration detects YAML files at `<ARCHMAX_DATA_DIR>/projects/<projectId>/model.yaml`
- **AND** neither a `data_models/` nor a `src/` subdirectory exists
- **THEN** `model.yaml` is moved to `<ARCHMAX_DATA_DIR>/projects/<projectId>/data_models/model.yaml`
- **AND** the `model/` dataset directory (if present) is moved to `<ARCHMAX_DATA_DIR>/projects/<projectId>/data_models/model/`

#### Scenario: Migration preserves uploads and scaffold directories

- **WHEN** the migration runs on a project with an existing `uploads/` directory and scaffold directories (`skills/`, `hooks/`)
- **THEN** the `uploads/` directory remains at `<ARCHMAX_DATA_DIR>/projects/<projectId>/uploads/` (not moved)
- **AND** the scaffold directories remain at the project root (not moved)

#### Scenario: Migration is idempotent

- **WHEN** the migration runs on a project that already has a `data_models/` subdirectory
- **THEN** no files are moved and the project layout is unchanged

### Requirement: Git Directory Exclusion

All file listing operations SHALL exclude entries whose names start with `.` (dotfiles and dotdirs). This applies to: `SemanticModelFileService.list()` and `get()` directory traversals, `DocumentFileService.list()`, the agent filesystem `listFiles` operation, and the publish `collectFiles` helper. Specifically, the `.git/` directory and its contents SHALL never appear in model listings, document listings, agent file operations, or published content.

#### Scenario: Model listing excludes .git

- **WHEN** a project directory contains `data_models/sales.yaml`, `data_models/.git/`, and `data_models/.hidden.yaml`
- **THEN** `SemanticModelFileService.list()` returns only the `sales` model
- **AND** `.git` directory contents are not traversed

#### Scenario: Agent filesystem excludes dotfiles

- **WHEN** the agent lists files in the project directory
- **THEN** `.git/` and other dotfiles/dotdirs are not included in the listing

#### Scenario: Publish file collection excludes dotfiles

- **WHEN** the publish file collection (`collectFiles`) processes the project directory
- **THEN** `.git/` contents are not included in the committed snapshot

### Requirement: Merge Conflict Detection in YAML

The `SemanticModelFileService` SHALL detect Git merge conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) in YAML files. When listing models, files with conflict markers SHALL still appear in the model list with a `hasConflicts: true` flag, but their parsed content SHALL be marked as invalid. The `get()` method SHALL return the raw file content alongside the conflict flag so the frontend can display it.

#### Scenario: List models with a conflicted file

- **WHEN** `list()` is called and `data_models/sales.yaml` contains Git conflict markers
- **THEN** the model `sales` appears in the list with `hasConflicts: true`
- **AND** other valid models are returned normally

#### Scenario: Get a conflicted model

- **WHEN** `get("sales")` is called and the file contains conflict markers
- **THEN** the response includes `hasConflicts: true` and the raw YAML content
- **AND** parsed fields (datasets, relationships, metrics) are empty or absent

## ADDED Requirements

### Requirement: Build Directory Cleanup

On application startup, the system SHALL remove any `build/` directory found at the root of a project's data directory (`<ARCHMAX_DATA_DIR>/projects/<projectId>/build/`). The former build step that produced these directories is removed (see the REMOVED "Build Assembly" requirement); the directory contained only derived single-file YAMLs and holds no source of record. The cleanup SHALL be idempotent and SHALL run per existing project directory. Source files under `data_models/`, `uploads/`, and the agent-scaffold directories SHALL NOT be affected.

#### Scenario: Stale build directory removed on startup

- **WHEN** the app starts and a project directory contains a `build/` directory
- **THEN** the `build/` directory is recursively deleted
- **AND** `data_models/`, `uploads/`, and scaffold directories remain untouched

#### Scenario: Cleanup is idempotent

- **WHEN** the app starts and a project directory has no `build/` directory
- **THEN** no action is taken and no error is raised
