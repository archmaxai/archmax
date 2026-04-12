# Change: Add CSV as a DuckDB data source

## Why

Users need to query uploaded CSV files alongside their database connections using DuckDB's federation layer. Currently, CSVs can be uploaded and read as text by the agent, but they cannot be queried with SQL or joined with database tables — a key gap for analytical workflows.

## What Changes

- Add `csv` to the `CONNECTION_TYPES` enum, making it a first-class connection type alongside postgres, mysql, mssql, sqlite, and duckdb
- Extend `connectionConfig` with CSV-specific fields: `filename` (referencing a file in the project's `uploads/` directory) and optional parsing options (`delimiter`, `header`, `quote`, `escape`, `skip`)
- Extend the DuckDB service to materialize CSV data into DuckDB tables at attach time — creating a named schema (the connection's slug) with a table derived from the filename
- Extend the connection test endpoint to verify CSV files are loadable
- Add E2E tests covering CSV connection creation, testing, and querying through the data browser
- Add unit/integration tests for CSV attach logic and API routes

## Impact

- Affected specs: `data-connections` (new connection type + DuckDB attach logic), `test-infrastructure` (new E2E tests)
- Affected code:
  - `packages/core/src/models/Connection.ts` — add `csv` to `CONNECTION_TYPES`
  - `packages/core/src/services/duckdb.ts` — CSV attach logic (materialized tables)
  - `apps/api/src/routes/connections.ts` — CSV-specific config validation, file existence check on create
  - `apps/frontend/` — connection dialog CSV type support, file picker for uploads
  - `apps/e2e/tests/` — new CSV data federation E2E test
  - `packages/core/src/services/duckdb.test.ts` — unit tests for CSV attach
