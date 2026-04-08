# Change: Move semantic model storage from MongoDB to YAML files on disk

## Why

Semantic models should be git-friendly, human-readable, and decoupled from the database. Storing them as YAML files per project enables version control, easy manual editing, and simplifies the architecture. This also makes semantic models project-scoped rather than connection-scoped, reflecting the fact that a semantic model describes a logical domain that can span multiple connections.

## What Changes

- **BREAKING**: Remove `SemanticModel`, `Dataset`, `Field`, `Relationship`, and `Metric` Mongoose models
- **BREAKING**: Semantic models are no longer connection-scoped — they become direct children of a project
- **BREAKING**: Semantic model API routes change from deeply nested MongoDB CRUD to flat file-based CRUD at `/api/projects/:projectId/semantic-models`
- Replace MongoDB storage with YAML files in a configurable data directory (`SEMLAYER_DATA_DIR`), one folder per project
- Each project folder contains an `AGENTS.md` (auto-generated) and one `*.yaml` file per semantic model
- Each YAML file is self-contained: model metadata, datasets with inline fields, relationships, and metrics
- MCP tools read semantic models from YAML files using `projectId` + `modelName` instead of MongoDB ObjectIds
- Add `SEMLAYER_DATA_DIR` env var (defaults to `./data/projects` in the workspace root)

**Note:** This change supersedes the semantic model Mongoose model deltas (SemanticModel, Dataset, Field, Relationship, Metric) from `add-project-structure`. The cascade soft-delete from Connection → SemanticModel should also be removed from the connection delete route, since semantic models are no longer connection-scoped.

## Impact

- Affected specs: `semantic-models`, `mcp-server`
- Affected code:
  - Remove: `packages/core/src/models/SemanticModel.ts`, `Dataset.ts`, `Field.ts`, `Relationship.ts`, `Metric.ts`
  - Rewrite: `apps/api/src/routes/semantic-models.ts`
  - Update: `apps/api/src/mcp/semlayer-server.ts`, `packages/core/src/models/index.ts`, `packages/core/src/config/env.ts`
  - New: `packages/core/src/services/semantic-model-files.ts`, `packages/core/src/services/semantic-model-schema.ts`
