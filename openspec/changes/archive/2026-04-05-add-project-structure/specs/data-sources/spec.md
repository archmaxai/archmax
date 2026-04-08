## REMOVED Requirements

### Requirement: Data Source CRUD

**Reason:** Replaced by Connection CRUD under `/api/projects/:projectId/connections`. The new Connection model is project-scoped and DuckDB-aware.

**Migration:** Existing DataSource documents are migrated to Connection documents within a default project. The `/api/data-sources` routes are removed.

### Requirement: Data Source Schema

**Reason:** Replaced by the Connection model which uses structured `connectionConfig` instead of a flat `connectionString`, supports additional types (sqlite, duckdb, motherduck), and includes soft-delete fields.

**Migration:** Existing `connectionString` values are parsed into structured `connectionConfig` objects.

### Requirement: Table Descriptions

**Reason:** Replaced by the OSI Dataset and Field models in the `semantic-models` capability. Table descriptions with columns are now modeled as Datasets with Fields following the OSI spec.

**Migration:** Existing `tables[].columns[]` are migrated to Dataset + Field documents linked to a SemanticModel.

### Requirement: Zod Validation

**Reason:** Zod validation is retained in principle but the schemas change to match the new Connection model structure. This requirement is superseded by validation requirements in the `data-connections` capability.

**Migration:** New Zod schemas are created for Connection CRUD.
