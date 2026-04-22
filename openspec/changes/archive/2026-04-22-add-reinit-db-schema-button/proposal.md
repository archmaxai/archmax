# Change: Add project-level button to re-initialize DuckDB and re-explore connection schemas

## Why

When an upstream database's schema changes (new tables, renamed columns, altered types), the project's cached DuckDB instance keeps serving the stale schema it read at ATTACH time. Today the only way to pick up the new schema is to restart the API process. Users need a way to force a refresh from the Data Sources page so the data browser, semantic-model agent, and MCP tools see the current state of the underlying databases.

## What Changes

- Add a "Re-explore schemas" button next to "New Connection" in the Data Sources page header.
- Add a backend endpoint `POST /api/projects/:projectId/connections/reinit` that:
  - Disposes the cached project DuckDB instance (closes it and removes it from the per-project cache).
  - Rebuilds the instance by re-attaching every active connection.
  - Runs a schema probe (`SHOW ALL TABLES`) against the rebuilt instance and returns the visible table count so the UI can surface a meaningful success message.
- Show a toast with the refreshed table count on success (e.g. "Schemas refreshed — 42 tables visible") and `err.message` on failure.
- Disable the button and show a spinner while the refresh is in flight.
- Document the new control in the data federation guide.

## Impact

- Affected specs: `connection-management-ui`, `data-connections`
- Affected code:
  - `apps/frontend/src/routes/_auth/$projectId/connections/index.tsx` — header button + mutation
  - `apps/api/src/routes/connections.ts` — new reinit endpoint
  - `packages/core/src/services/duckdb.ts` — export a helper that disposes the cached project instance
  - `apps/docs/src/content/docs/guides/data-federation.mdx` — document the refresh control
