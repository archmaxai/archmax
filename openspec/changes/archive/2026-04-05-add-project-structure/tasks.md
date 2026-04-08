## 1. Shared infrastructure

- [x] 1.1 Create soft-delete Mongoose plugin (`packages/core/src/infra/soft-delete-plugin.ts`) — adds `deleted`, `deletedAt` fields and query middleware
- [x] 1.2 Add `duckdb` or `@duckdb/node-api` dependency to `@semlayer/core`
- [x] 1.3 Update `packages/core/src/models/index.ts` barrel exports for all new models

## 2. Project model and API

- [x] 2.1 Create `Project` Mongoose model (`packages/core/src/models/Project.ts`) with soft-delete plugin
- [x] 2.2 Create `/api/projects` CRUD routes (`apps/api/src/routes/projects.ts`) with Zod validation
- [x] 2.3 Mount project routes in `apps/api/src/app.ts`

## 3. Connection model and API

- [x] 3.1 Create `Connection` Mongoose model (`packages/core/src/models/Connection.ts`) replacing `DataSource`, with `connectionConfig` object, project ref, and soft-delete plugin
- [x] 3.2 Create `/api/projects/:projectId/connections` CRUD routes (`apps/api/src/routes/connections.ts`)
- [x] 3.3 Add cascade soft-delete on project deletion (soft-delete all child connections)
- [x] 3.4 Remove old `DataSource` model and `/api/data-sources` routes

## 4. DuckDB federation service

- [x] 4.1 Create DuckDB service (`packages/core/src/services/duckdb.ts`) — lazy instance management per project
- [x] 4.2 Implement `attachConnection()` — attach a connection to DuckDB as a named schema using appropriate extensions (postgres_scanner, mysql_scanner, etc.)
- [x] 4.3 Implement `detachConnection()` — remove a schema from DuckDB
- [x] 4.4 Implement `getProjectInstance()` — get or create DuckDB instance for a project with all active connections attached

## 5. OSI-aligned semantic models

- [x] 5.1 Restructure `SemanticModel` Mongoose model — replace `dataSource` ref with `connection` ref, add `aiContext`, remove `tags`/`relationships`/`metrics` subdocs, apply soft-delete plugin
- [x] 5.2 Create `Dataset` Mongoose model (`packages/core/src/models/Dataset.ts`) — `semanticModel` ref, `source`, `primaryKey`, `uniqueKeys`, `aiContext`
- [x] 5.3 Create `Field` Mongoose model (`packages/core/src/models/Field.ts`) — `dataset` ref, `expression[]` with dialect support, `dimension`, `aiContext`
- [x] 5.4 Create `Relationship` Mongoose model (`packages/core/src/models/Relationship.ts`) — `semanticModel` ref, `from`/`to` dataset names, `fromColumns`/`toColumns`
- [x] 5.5 Create `Metric` Mongoose model (`packages/core/src/models/Metric.ts`) — `semanticModel` ref, `expression[]` with dialect support
- [x] 5.6 Create semantic model CRUD routes scoped under connections (`/api/projects/:projectId/connections/:connectionId/semantic-models`)
- [x] 5.7 Create dataset/field/relationship/metric CRUD routes nested under semantic models
- [x] 5.8 Add cascade soft-delete from connection → semantic models → datasets/fields/relationships/metrics

## 6. MCP server updates

- [x] 6.1 Update MCP tools to use new model hierarchy (Project → Connection → SemanticModel → Dataset/Field)
- [x] 6.2 Add project-scoped tool variants (e.g. `list_projects`, `get_project_connections`)

## 7. Migration and cleanup

- [x] 7.1 Write migration script: create default project, convert DataSource → Connection, convert old SemanticModel → new OSI structure — Skipped: old DataSource model removed; fresh start with new schema
- [x] 7.2 Update `openspec/project.md` to reflect new architecture
- [x] 7.3 Update `.env.example` if new env vars are needed — No new env vars required
