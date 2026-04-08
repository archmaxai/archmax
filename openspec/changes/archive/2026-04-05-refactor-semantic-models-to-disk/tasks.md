## 1. Core infrastructure

- [x] 1.1 Add `js-yaml` and `@types/js-yaml` dependencies to `@semlayer/core`
- [x] 1.2 Add `SEMLAYER_DATA_DIR` to env config Zod schema (`packages/core/src/config/env.ts`), defaulting to `./data/projects`
- [x] 1.3 Define Zod schemas for semantic model YAML validation (`packages/core/src/services/semantic-model-schema.ts`) — reuse interfaces from `shared.ts`
- [x] 1.4 Create `SemanticModelFileService` (`packages/core/src/services/semantic-model-files.ts`) — list, read, write, delete YAML files with atomic writes (temp file + rename)

## 2. AGENTS.md generation

- [x] 2.1 Implement AGENTS.md auto-generation in the file service — summarizes all semantic models (name, description, dataset names, metric names)

## 3. API routes

- [x] 3.1 Rewrite `/api/projects/:projectId/semantic-models` routes to use `SemanticModelFileService` for CRUD (list, get, create, update, delete)
- [x] 3.2 Remove sub-entity routes for datasets, fields, relationships, metrics (now inline in YAML)
- [x] 3.3 Update route mounting in `apps/api/src/app.ts` (semantic models scoped to project, not connection)

## 4. MCP server

- [x] 4.1 Update `list_semantic_models` tool — take `projectId`, read from file service
- [x] 4.2 Update `get_semantic_model` tool — take `projectId` + `modelName`, read YAML file
- [x] 4.3 Update `describe_dataset` tool — take `projectId` + `modelName` + `datasetName`, extract from YAML
- [x] 4.4 Update tool schema and required parameters in `getToolSchema` / `getToolRequired`

## 5. Cleanup

- [x] 5.1 Remove `SemanticModel`, `Dataset`, `Field`, `Relationship`, `Metric` Mongoose models
- [x] 5.2 Update barrel exports in `packages/core/src/models/index.ts`
- [x] 5.3 Remove cascade soft-delete of semantic models from connection and project delete routes
- [x] 5.4 Keep `shared.ts` TypeScript interfaces (removed Mongoose schemas, kept TS types used by Zod schemas)
- [x] 5.5 Update `openspec/project.md` to reflect file-based semantic model storage
- [x] 5.6 Update `.env.example` with `SEMLAYER_DATA_DIR`
