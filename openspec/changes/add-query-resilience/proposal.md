# Change: Add query resilience and concurrency control

## Why
When federated database queries time out, the DuckDB query continued running in the background, holding resources and causing the application to become unresponsive. Several code paths had no timeout at all, and there was no limit on concurrent queries per project.

## What Changes
- Centralized `withQueryTimeout` helper that uses DuckDB `connection.interrupt()` for actual cancellation and always cleans up timers
- Per-project query concurrency semaphore (`MAX_CONCURRENT_QUERIES`, default 10) with queue timeout
- Timeout enforcement on all query paths: MCP tools, agent tools, data browser, connection tests, ATTACH operations, and scoped view creation
- Configurable via `QUERY_TIMEOUT_MS` (existing) and `MAX_CONCURRENT_QUERIES` (new)

## Impact
- Affected specs: mcp-server, data-connections
- Affected code: `packages/core/src/services/duckdb.ts`, `mcp-tools.ts`, `agent-tools.ts`, `apps/api/src/routes/data-browser.ts`, `apps/api/src/routes/connections.ts`
