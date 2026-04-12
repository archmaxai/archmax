# Change: Add end-to-end tests for the MCP layer

## Why

The MCP server is the primary integration surface for external AI agents. It has bearer-token auth, scope filtering, tool execution, and DuckDB query federation, yet none of this is covered by end-to-end tests. A single misconfiguration in auth, token lifecycle, or scope enforcement could silently expose data or break agent workflows. E2E coverage gives confidence that the full stack (nginx, Hono API, MCP transport, DuckDB, external databases) works together as specified.

## What Changes

- Add a semantic model YAML fixture (`apps/e2e/fixtures/semantic-models/e2e_federation.yaml`) that references the existing e2e database tables (Postgres `e2e_products`, MySQL `e2e_orders`, MSSQL `e2e_customers`)
- Mount the fixture directory into the Docker container and add a volume for `ARCHMAX_DATA_DIR` so the app can write published models
- Add a new Playwright test file `apps/e2e/tests/mcp.spec.ts` that:
  1. Logs in and ensures a project with connections exists (reuses the E2E Federation project)
  2. Creates a semantic model via the REST API (`POST /api/projects/:id/semantic-models`)
  3. Publishes it (`POST /api/projects/:id/publish`)
  4. Tests MCP auth: no token (401), invalid token (401)
  5. Creates an MCP token through the UI (MCP Access page: fill name, select scopes, submit, extract raw token from the reveal dialog)
  6. Tests MCP auth with the UI-created token (success)
  7. Tests all MCP tools (`list_semantic_models`, `get_semantic_model`, `get_datasets`, `execute_query`, `request_improvement`) via JSON-RPC over HTTP to `/mcp/:slug/mcp`
  8. Deletes the token via the UI (click revoke button, confirm in dialog)
  9. Verifies MCP auth fails after token deletion (401)
- Update `docker-compose.ci.yml` to mount the semantic model fixture and provide a writable data volume

## Impact

- Affected specs: `mcp-server`, `mcp-token-management`, `test-infrastructure`
- Affected code: `apps/e2e/`, `docker-compose.ci.yml`, `apps/e2e/fixtures/`
