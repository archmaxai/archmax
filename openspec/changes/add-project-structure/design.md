## Context

The app is a semantic layer tool backed by MongoDB (Mongoose). Current models (`DataSource`, `SemanticModel`) are flat and use a proprietary table/column schema. The user wants to:

1. Introduce **projects** as the organizational boundary
2. Replace data sources with **connections** that feed into DuckDB
3. Align semantic models with the **OSI Core Metadata Spec v0.1.1**
4. Add **soft delete** and standard date fields to every model

Stakeholders: single admin user (no multi-tenancy).

## Goals / Non-Goals

**Goals:**
- Project-scoped resource hierarchy: Project → Connection → SemanticModel → (Dataset, Field, Relationship, Metric)
- Every model carries `createdAt`, `updatedAt`, `deleted`, `deletedAt`
- DuckDB federation: each project's connections are attached into a DuckDB instance for cross-connection queries
- OSI-aligned semantic model structure matching the published JSON schema

**Non-Goals:**
- UI implementation (deferred)
- Multi-user / multi-tenancy
- Real-time sync or CDC from external databases
- Full OSI export/import (only internal representation aligned to OSI)

## Decisions

### 1. Separate Mongoose models per OSI concept

**Decision:** Dataset, Field, Relationship, and Metric are separate Mongoose collections (not subdocuments).

**Rationale:** The user specified "each model has the usual date fields and a deleted flag", implying first-class models. Separate collections also allow granular soft-delete, independent pagination, and field-level audit trails.

**Alternatives considered:**
- Subdocuments within SemanticModel (simpler, but no individual timestamps/soft-delete, limited to 16MB doc size for large schemas)
- Mixed approach (datasets as docs, fields as subdocs) — adds inconsistency

### 2. DuckDB per project (lazy, in-process)

**Decision:** One DuckDB instance per project, created lazily when a project's connections are first queried. Connections are attached via DuckDB extensions (`postgres_scanner`, `mysql_scanner`, etc.).

**Rationale:** In-process DuckDB keeps the stack simple (no external service). Per-project scoping prevents cross-project data leakage. Lazy init avoids resource waste for projects that aren't actively queried.

**Alternatives considered:**
- Single shared DuckDB instance with schema-per-project — simpler resource-wise but harder to isolate and clean up
- External DuckDB server — unnecessary for single-user tool

### 3. Connection types follow DuckDB extension ecosystem

**Decision:** `ConnectionType` enum includes `postgres`, `mysql`, `mssql`, `sqlite`, `duckdb`, `motherduck`, and an `other` escape hatch. MSSQL uses DuckDB's ODBC or community extensions.

**Rationale:** DuckDB has official extensions for postgres and mysql. MSSQL support is available via ODBC or community connectors. Keeping the type open-ended matches "essentially everything that DuckDB allows for."

### 4. Soft-delete via Mongoose middleware

**Decision:** A shared Mongoose plugin adds `deleted: Boolean` (default `false`) and `deletedAt: Date` to every schema. Query middleware automatically appends `{ deleted: { $ne: true } }` to find/findOne/count operations. A `softDelete()` instance method sets the flags.

**Rationale:** Centralizes the pattern, prevents accidental inclusion of deleted records, and keeps individual model code clean.

### 5. OSI expression dialect support

**Decision:** Expressions (on Field and Metric) store an array of `{ dialect, expression }` objects following the OSI `Expression` schema. Only `ANSI_SQL` is required initially; other dialects can be added per connection type.

**Rationale:** Direct mapping to OSI spec. ANSI_SQL covers the common case; dialect-specific expressions allow DuckDB-native or vendor-specific SQL when needed.

## Data Model

```
Project
  ├── _id, title, description, createdAt, updatedAt, deleted, deletedAt
  │
  └── Connection (many)
        ├── _id, project (ref), name, type, connectionConfig, createdAt, updatedAt, deleted, deletedAt
        │
        └── SemanticModel (many)
              ├── _id, connection (ref), name, description, aiContext, createdAt, updatedAt, deleted, deletedAt
              │
              ├── Dataset (many)
              │     ├── _id, semanticModel (ref), name, source, primaryKey, uniqueKeys, description, aiContext, ...
              │     │
              │     └── Field (many)
              │           └── _id, dataset (ref), name, expression[], dimension, label, description, aiContext, ...
              │
              ├── Relationship (many)
              │     └── _id, semanticModel (ref), name, from, to, fromColumns[], toColumns[], aiContext, ...
              │
              └── Metric (many)
                    └── _id, semanticModel (ref), name, expression[], description, aiContext, ...
```

## Risks / Trade-offs

- **Many collections:** Seven models means more joins (Mongoose `.populate()`). Mitigated by: indexing foreign keys, most queries are scoped to a single semantic model, and MongoDB aggregation pipelines can join efficiently.
- **DuckDB in-process memory:** Large datasets attached via DuckDB consume Node.js process memory. Mitigated by: lazy init, connection pooling limits, and documenting memory requirements.
- **MSSQL via ODBC:** Less reliable than native DuckDB extensions. Mitigated by: marking MSSQL support as best-effort initially, testing with the community extension.

## Migration Plan

1. Create new models (Project, Connection, Dataset, Field, Relationship, Metric) alongside existing ones
2. Write a one-time migration script that converts existing `DataSource` → `Connection` and `SemanticModel` → new OSI-aligned structure within a default project
3. Remove old `DataSource` model and routes after migration is verified
4. Update MCP tools to use new model hierarchy

## Open Questions

- Should `connectionConfig` store the raw connection string or structured config (host/port/database/credentials)? Recommendation: structured config with an optional raw URI override.
- DuckDB Node.js binding choice: `duckdb` (older, stable) vs `@duckdb/node-api` (newer, official). Need to evaluate API maturity.
