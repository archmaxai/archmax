# Change: Add MCP call monitoring log

## Why
MCP tool calls are only logged to stdout, making it impossible for admins to audit agent activity, debug failures, or understand usage patterns. A persistent, queryable call log visible in the admin UI gives operators visibility into how AI agents interact with their semantic layer.

## What Changes
- Add `McpCallLog` Mongoose model in `@semlayer/core` to persist full MCP call data: input arguments, full output content (the text the agent receives), tool name, duration, success/error, token reference, client IP
- Instrument the MCP route (`semlayer-route.ts`) to write a log entry for every `tools/call` and `tools/list` request, capturing both request args and the full response content
- Add a read-only API route at `/api/projects/:projectId/mcp-logs` to query call logs with pagination and optional filters (tool name, token, date range, error-only)
- Replace the monitoring placeholder page with a real MCP call log table (Card > Table layout matching MCP Access page, but vertically condensed) — clicking a row opens a detail view with full input args (JSON) and full output content (markdown)

## Impact
- Affected specs: new `mcp-monitoring`, `frontend-shell` (add monitoring navigation scenario)
- Affected code:
  - `packages/core/src/models/McpCallLog.ts` (new) — Mongoose model
  - `packages/core/src/models/index.ts` — re-export new model
  - `apps/api/src/mcp/semlayer-route.ts` — add logging after each call
  - `apps/api/src/routes/mcp-logs.ts` (new) — read-only API route
  - `apps/api/src/app.ts` — mount new route
  - `apps/frontend/src/routes/_auth/$projectId/monitoring.tsx` — call log table UI
