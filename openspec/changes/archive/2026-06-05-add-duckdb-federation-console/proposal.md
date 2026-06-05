# Change: DuckDB federation console

## Why

Operators can federate queries across connections via DuckDB, but today they must use external tools or MCP to run ad-hoc SQL or install extensions. A first-class console under **Data Federation** makes it possible to explore attached catalogs, try cross-connection queries, and install community extensions without leaving the admin UI.

## What Changes

- Add a **Console** sub-item under the **Data Federation** sidebar group, routed at `/$projectId/connections/console`.
- Add authenticated API endpoints to execute SQL against the project's federated DuckDB instance and to install/load extensions.
- Add a **Setup commands** panel on the console page that shows copyable `INSTALL` / `LOAD` / `ATTACH` examples for the current project (with credentials redacted in `ATTACH` strings).
- Document the console in the data-federation guide.

## Impact

- Affected specs: `duckdb-console` (new), `frontend-shell`, `documentation-site`
- Affected code (implementation stage): `apps/frontend` (route + console UI), `apps/api` (new Hono routes), `packages/core/src/services/duckdb.ts` (shared helpers for extension install / setup-command templates), `apps/docs` (guide update)
