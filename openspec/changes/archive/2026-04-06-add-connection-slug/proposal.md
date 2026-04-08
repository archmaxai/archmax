# Change: Add slug field to database connections for DuckDB schema alias

## Why
Currently the connection `name` is sanitized at runtime (`name.replace(/[^a-zA-Z0-9_]/g, "_")`) and used as the DuckDB schema alias. This couples the display name to the query identifier, meaning a rename silently breaks semantic model `source` references and agent SQL queries. A dedicated `slug` field gives users explicit control over the DuckDB prefix.

## What Changes
- **Connection Model**: Add a `slug` field (required, unique within project, valid DuckDB identifier pattern)
- **Connection API**: Accept `slug` on create/update; auto-generate from `name` on create when omitted
- **DuckDB service**: Use `conn.slug` instead of sanitized `conn.name` as the ATTACH alias
- **Agent service**: Use `conn.slug` for schema references in the system prompt
- **Connection management UI**: Show `slug` in create/edit forms and connection list

## Impact
- Affected specs: `data-connections`, `connection-management-ui`
- Affected code: `packages/core/src/models/Connection.ts`, `packages/core/src/services/duckdb.ts`, `apps/api/src/routes/connections.ts`, `apps/api/src/services/agent.ts`, `apps/frontend/src/routes/_auth/$projectId/connections.tsx`
- **BREAKING**: Existing connections in MongoDB will need a migration to populate the `slug` field from the sanitized `name`
