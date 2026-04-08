## 1. McpCallLog Model
- [x] 1.1 Create `packages/core/src/models/McpCallLog.ts` — Mongoose schema with fields: `project`, `tokenId`, `tokenName`, `method`, `toolName`, `inputArgs` (Mixed), `outputContent` (String), `durationMs`, `isError`, `errorMessage`, `clientIp`, `createdAt`; add compound index on `(project, createdAt)` and TTL index on `createdAt`
- [x] 1.2 Re-export from `packages/core/src/models/index.ts`

## 2. MCP Route Instrumentation
- [x] 2.1 Import `McpCallLog` in `apps/api/src/mcp/semlayer-server.ts`
- [x] 2.2 After each `tools/call` response, fire-and-forget `McpCallLog.create()` with token metadata, tool name, full `inputArgs`, full `outputContent` (extract text from MCP result content array), duration, and error status
- [x] 2.3 After each `tools/list` response, fire-and-forget `McpCallLog.create()` with method `tools/list` and `outputContent` containing serialized tool list
- [x] 2.4 Ensure log write failures are caught and logged to stderr without affecting the MCP response

## 3. API Route
- [x] 3.1 Create `apps/api/src/routes/mcp-logs.ts` — `GET /` handler that queries `McpCallLog` by project with pagination (`page`, `limit`), optional filters (`toolName`, `tokenId`, `errorOnly`, `from`, `to`), sorted by `createdAt` descending; returns `{ data, total, page, limit }`
- [x] 3.2 Mount the route in `apps/api/src/app.ts` at `/api/projects/:projectId/mcp-logs` (behind session auth middleware)

## 4. Frontend Monitoring Page
- [x] 4.1 Add API query function in monitoring page using TanStack Query (key: `["mcp-logs", projectId, filters]`)
- [x] 4.2 Replace placeholder content in `apps/frontend/src/routes/_auth/$projectId/monitoring.tsx` with a Card > Table layout matching the MCP Access page style but with vertically condensed rows (reduced py on TableCell)
- [x] 4.3 Table columns: timestamp, token name, tool, duration, status badge
- [x] 4.4 Clicking a row opens a detail view (sheet or panel) showing: full input arguments as formatted JSON, and full output content rendered as markdown
- [x] 4.5 Add pagination controls (prev/next with page indicator)
- [x] 4.6 Add refresh button in the page header
- [x] 4.7 Add "Show list calls" toggle that includes `tools/list` entries (default off)
- [x] 4.8 Add empty state for when no logs exist (same pattern as MCP Access empty state)
