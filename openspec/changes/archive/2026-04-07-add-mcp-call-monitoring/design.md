## Context
MCP calls are currently logged to stdout only (`console.log` in `semlayer-route.ts`). The monitoring page in the sidebar is a placeholder. Admins have no way to inspect agent activity, correlate errors, or understand usage trends through the UI.

## Goals / Non-Goals
- Goals:
  - Persist every MCP call with full input arguments and full output content
  - Expose call logs in the admin UI with filtering and pagination
  - Allow inspecting the full markdown output of any call by clicking the row
  - Keep write overhead minimal (fire-and-forget, no blocking the MCP response)
- Non-Goals:
  - Real-time streaming / WebSocket push of logs (polling or manual refresh is fine for v1)
  - Aggregated analytics dashboards (counts, charts, percentiles)
  - Log retention policies or automatic purging (manual DB cleanup for now)

## Decisions

### McpCallLog Mongoose model
- Decision: New `McpCallLog` collection in MongoDB with index on `(project, createdAt)` for efficient time-range queries.
- Fields: `project` (ObjectId), `tokenId` (ObjectId, nullable), `tokenName` (string, denormalized), `method` (string — `tools/list` | `tools/call`), `toolName` (string | null), `inputArgs` (mixed — the full JSON-RPC `arguments` object), `outputContent` (string — the full text content from the MCP response), `durationMs` (number), `isError` (boolean), `errorMessage` (string | null), `clientIp` (string), `createdAt` (Date, auto-indexed).
- Both `inputArgs` and `outputContent` are stored so the admin can replay exactly what the agent sent and received.
- Alternatives considered: Structured logging to file/stdout with a log aggregator — rejected because this is a single-user self-hosted tool; a simple Mongo collection is sufficient and queryable without extra infra.

### Fire-and-forget writes
- Decision: Log entries are written after the MCP response is sent, using a detached promise (`.catch(console.error)`) so logging never delays the agent.
- Alternatives considered: Middleware-based before/after hooks — adds complexity for a single route; inline post-response write is simpler.

### API route
- Decision: Read-only `GET /api/projects/:projectId/mcp-logs` behind the existing session auth middleware. Supports `?page=1&limit=50&toolName=...&tokenId=...&errorOnly=true&from=...&to=...`.
- Alternatives considered: GraphQL or dedicated search endpoint — overkill for a filtered list with pagination.

### Frontend table
- Decision: Use the same Card > Table pattern as the MCP Access (tokens) page, but with more vertically condensed rows (smaller vertical padding). Columns: timestamp, token name, method/tool, duration, status badge. Clicking a row navigates to or opens a detail view that renders the full `outputContent` as markdown. Uses TanStack Query with pagination and a manual refresh button.
- Alternatives considered: Inline expansion within the table — rejected because MCP output can be large (multi-page markdown); a dedicated detail panel gives more room.

### Detail view for log entries
- Decision: Clicking a table row opens a slide-over sheet (or full-width panel below the table) showing: the input arguments as formatted JSON, and the full output rendered as markdown. This lets the admin see exactly what the agent received.
- Rendering: Use a simple markdown renderer (or `<pre>` with monospace font for v1) to display the MCP text content. The output is already formatted text from the MCP tools (JSON or markdown digest).

## Risks / Trade-offs
- Unbounded collection growth (especially `outputContent` can be large) → Mitigation: Add a TTL index on `createdAt` (e.g. 30 days) so MongoDB auto-expires old logs. Make TTL configurable via env var in a follow-up.
- Denormalized `tokenName` becomes stale if token is renamed → Acceptable: log reflects the name at call time, which is the desired audit behavior.
- `inputArgs` / `outputContent` may contain sensitive data (e.g. connection names, schema info) → Mitigation: Logs are behind admin session auth; no public exposure.

## Open Questions
- Should `tools/list` calls be logged, or only `tools/call`? Proposal: log both, but the UI can default-filter to `tools/call` only since list calls are high-frequency noise.
