# Change: Add project-based structure with DuckDB federation and OSI semantic models

## Why

The current data model treats data sources and semantic models as flat, top-level entities. The app needs a "project" abstraction to group related connections, a DuckDB federation layer so all connections are jointly queryable, and OSI-aligned semantic models that map tables as datasets with fields, relationships, and metrics per the [OSI Core Metadata Spec](https://github.com/open-semantic-interchange/OSI/blob/main/core-spec/osi-schema.json).

## What Changes

- **New `Project` model** — top-level organizational unit with a title; all other entities belong to a project
- **`Connection` replaces `DataSource`** — data connections live under a project, support any DuckDB-compatible type (postgres, mysql, mssql, sqlite, etc.), and each is attached into a project-scoped DuckDB instance for federated querying
- **`SemanticModel` restructured to OSI spec** — each connection owns one or more semantic models; OSI concepts (Dataset, Field, Relationship, Metric) become first-class Mongoose models with their own date/soft-delete fields
- **Soft delete across all models** — every model gets `createdAt`, `updatedAt`, `deleted` (boolean), and `deletedAt` fields; queries default to excluding soft-deleted records
- **DuckDB federation layer** — a service that manages a DuckDB instance per project, attaching all active connections as named schemas so cross-connection queries are possible
- **BREAKING**: `DataSource` model and `/api/data-sources` routes are replaced by `Connection` under `/api/projects/:projectId/connections`

## Impact

- Affected specs: `data-sources` (replaced), `semantic-models` (restructured), `hono-api` (new routes), `mcp-server` (updated tools)
- Affected code: `packages/core/src/models/*`, `apps/api/src/routes/*`, `apps/api/src/mcp/*`, new `packages/core/src/services/duckdb.ts`
- New dependency: `duckdb` (Node.js bindings) or `@duckdb/node-api`
