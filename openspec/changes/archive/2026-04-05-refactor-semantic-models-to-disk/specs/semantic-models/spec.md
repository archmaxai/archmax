## REMOVED Requirements

### Requirement: Semantic Model Schema
**Reason**: Replaced by file-based YAML storage. Semantic models are no longer stored in MongoDB as Mongoose documents.
**Migration**: Any existing MongoDB semantic model data should be exported to YAML files in the project directory.

### Requirement: Relationships
**Reason**: Relationships are now embedded inline within semantic model YAML files, not stored as separate MongoDB documents.

### Requirement: Metrics
**Reason**: Metrics are now embedded inline within semantic model YAML files, not stored as separate MongoDB documents.

### Requirement: Tagging
**Reason**: Tags were already removed by OSI alignment in `add-project-structure`. Not reintroduced in file-based storage.

## ADDED Requirements

### Requirement: Semantic Model File Storage
The system SHALL store semantic models as YAML files on disk in a per-project directory. The base directory is configured via the `SEMLAYER_DATA_DIR` environment variable, defaulting to `./data/projects` relative to the workspace root. Each project's semantic models are stored in `<SEMLAYER_DATA_DIR>/<projectId>/`. Semantic models are project-scoped and not tied to a specific connection.

#### Scenario: List semantic models for a project
- **WHEN** the system lists semantic models for a project
- **THEN** all `*.yaml` files in `<SEMLAYER_DATA_DIR>/<projectId>/` are enumerated and parsed

#### Scenario: Read a semantic model
- **WHEN** the system reads a semantic model by name
- **THEN** the file `<SEMLAYER_DATA_DIR>/<projectId>/<name>.yaml` is parsed and returned as a structured object

#### Scenario: Write a semantic model
- **WHEN** the system creates or updates a semantic model
- **THEN** the model is serialized to YAML and written atomically (temp file + rename) to `<SEMLAYER_DATA_DIR>/<projectId>/<name>.yaml`

#### Scenario: Delete a semantic model
- **WHEN** the system deletes a semantic model
- **THEN** the file `<SEMLAYER_DATA_DIR>/<projectId>/<name>.yaml` is removed from disk

#### Scenario: Project directory does not exist
- **WHEN** a write targets a project whose directory does not yet exist
- **THEN** the directory is created automatically before writing

### Requirement: Semantic Model YAML Schema
Each semantic model YAML file SHALL be a self-contained document following the OSI Core Metadata Spec structure. The top-level fields SHALL be: `name` (string, required), `description` (string), `aiContext` (object with optional `instructions`, `synonyms`, `examples`), `datasets` (array), `relationships` (array), and `metrics` (array). Datasets SHALL contain: `name`, `source`, `primaryKey`, `uniqueKeys`, `description`, `aiContext`, and `fields` (array). Fields SHALL contain: `name`, `expression` (array of `{ dialect, expression }`), optional `dimension` (`{ is_time }`), optional `label`, `description`, `aiContext`. Relationships SHALL contain: `name`, `from`, `to`, `fromColumns`, `toColumns`, optional `aiContext`. Metrics SHALL contain: `name`, `expression` (array of `{ dialect, expression }`), `description`, optional `aiContext`.

#### Scenario: Valid YAML with datasets and fields
- **WHEN** a YAML file contains a model with datasets that have inline field arrays
- **THEN** the parser returns a structured object with datasets containing nested field arrays

#### Scenario: Valid YAML with relationships and metrics
- **WHEN** a YAML file contains relationships with column mappings and metrics with dialect expressions
- **THEN** all entities are parsed and validated correctly

#### Scenario: Invalid YAML
- **WHEN** a YAML file fails Zod schema validation
- **THEN** a descriptive error is returned indicating which field(s) are invalid

### Requirement: Semantic Model CRUD API
The API SHALL expose CRUD endpoints for semantic models at `/api/projects/:projectId/semantic-models`. Operations read and write YAML files via the `SemanticModelFileService` rather than MongoDB.

#### Scenario: List semantic models
- **WHEN** a GET request is made to `/api/projects/:projectId/semantic-models`
- **THEN** all semantic models from the project's YAML files are returned

#### Scenario: Get a semantic model
- **WHEN** a GET request is made to `/api/projects/:projectId/semantic-models/:name`
- **THEN** the named YAML file is parsed and returned

#### Scenario: Create a semantic model
- **WHEN** a POST request is made with a valid semantic model body
- **THEN** a new YAML file is written to the project directory and the model is returned with status 201

#### Scenario: Update a semantic model
- **WHEN** a PUT request is made to `/api/projects/:projectId/semantic-models/:name`
- **THEN** the YAML file is overwritten with the updated content

#### Scenario: Delete a semantic model
- **WHEN** a DELETE request is made to `/api/projects/:projectId/semantic-models/:name`
- **THEN** the YAML file is removed from disk and `{ ok: true }` is returned

#### Scenario: Semantic model not found
- **WHEN** a GET/PUT/DELETE targets a name with no corresponding YAML file
- **THEN** a 404 error is returned

#### Scenario: Duplicate name
- **WHEN** a POST request uses a name that already has a corresponding YAML file
- **THEN** a 409 conflict error is returned

### Requirement: Project AGENTS.md
Each project directory SHALL contain an `AGENTS.md` file that summarizes the project's semantic models for AI assistant consumption. The file SHALL be auto-generated when semantic models are created, updated, or deleted via the API.

#### Scenario: AGENTS.md is regenerated on model change
- **WHEN** a semantic model YAML file is created, updated, or deleted via the API
- **THEN** the `AGENTS.md` file in the project directory is regenerated to reflect the current models

#### Scenario: AGENTS.md content
- **WHEN** `AGENTS.md` is generated for a project with semantic models
- **THEN** it contains a summary of each model including its name, description, dataset names, and metric names
