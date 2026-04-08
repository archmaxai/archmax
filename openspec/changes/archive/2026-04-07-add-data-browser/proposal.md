# Change: Add Data Browser for Federated Data

## Why

Users need a way to visually browse the data available through their DuckDB-federated connections — seeing which databases (attached schemas) and tables exist, and previewing table data with pagination. Currently the only way to inspect federated data is through the agent chat, which requires writing or prompting for SQL queries.

## What Changes

- New API endpoints under `/api/projects/:projectId/data-browser/` to list databases, list tables within a database, and fetch paginated table data from DuckDB
- New "Data Browser" top-level navigation item in the sidebar
- New frontend route `/$projectId/data` with a database/table explorer and paginated data table
- Read-only — no data manipulation, DDL, or editing capabilities

## Impact

- Affected specs: `frontend-shell` (new nav item), new `data-browser` capability
- Affected code: `apps/api/src/routes/` (new route), `apps/frontend/src/routes/_auth/$projectId/` (new page), `apps/frontend/src/components/layout/app-sidebar.tsx` (nav item), `packages/core/src/services/duckdb.ts` (reused, no changes)
