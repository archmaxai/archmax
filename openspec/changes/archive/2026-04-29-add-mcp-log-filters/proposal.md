# Change: Filter MCP logs by tool, status, token, and date range; surface token activity stats

## Why

The MCP log table at `/:projectId/monitoring` currently returns the most recent calls with no way to narrow the view, which makes incident triage and per-token usage review tedious as soon as a project sees more than a single page of traffic. The token overview at `/:projectId/mcp-access` already records `lastUsedAt` per token but only renders it as a date with no time-of-day, and gives no signal of how active a token has been — admins cannot tell at a glance whether a token is dormant, hot, or just used yesterday.

## What Changes

- Add a filter bar above the MCP log table with: tool filter (Select populated with the distinct tool names seen in the project's logs), status filter (`All` / `Success` / `Error`), token filter (Select populated from the project's MCP tokens), and a date range picker with two date inputs (start / end) backed by shadcn `Calendar` + `Popover` (date-only granularity, inclusive on both ends).
- Wire the existing `GET /api/projects/:projectId/mcp-logs` query parameters (`toolName`, `tokenId`, `errorOnly`, `from`, `to`) to the new filter controls and reset pagination to page 1 whenever any filter changes.
- Add a `GET /api/projects/:projectId/mcp-logs/tools` endpoint that returns the distinct `toolName` values present in the project's `McpCallLog` collection (excluding `null` / `tools/list`) so the tool filter dropdown is populated from real data rather than hard-coded.
- Add the project's MCP tokens (`GET /api/projects/:projectId/mcp-tokens`) as the source for the token filter — no new endpoint needed there.
- Extend the MCP token list response (`GET /api/projects/:projectId/mcp-tokens`) so each token includes `eventCount30d` (count of `McpCallLog` entries for the token in the last 30 days, computed server-side). Continue to return `lastUsedAt` as today.
- Update the MCP Access page to (a) format the existing `Last Used` column as a relative time string (e.g. "5 min ago", "2 days ago", with an absolute tooltip on hover) including the time-of-day, and (b) add an `Events (30d)` column rendered as a tabular-nums number, with `0` shown muted.
- Install the shadcn `calendar` component (and the existing `popover`) so the date range picker can be built per the shadcn skill — using the date range pattern (Popover trigger button → Calendar with `mode="range"`).

## Impact

- Affected specs:
  - `mcp-monitoring` — MCP Call Log UI requirement (filter bar, paging reset) and MCP Call Log API requirement (new `tools` sub-endpoint, no breaking changes to existing query params).
  - `mcp-token-management` — MCP Access Management UI requirement (Events column + relative Last Used) and Token CRUD API requirement (token list now returns `eventCount30d`).
- Affected code:
  - `apps/api/src/routes/mcp-logs.ts` (new `tools` endpoint; existing list endpoint already supports the filters).
  - `apps/api/src/routes/mcp-tokens.ts` (aggregation pipeline to attach `eventCount30d` to each token in the list response).
  - `apps/frontend/src/routes/_auth/$projectId/monitoring.tsx` (filter bar, query state, date range picker).
  - `apps/frontend/src/routes/_auth/$projectId/mcp-access.tsx` (relative time + Events column).
  - `packages/ui/src/components/calendar.tsx` (new shadcn component) and a small `DateRangePicker` composed from `Popover` + `Calendar`.
  - `apps/docs/src/content/docs/reference/specs/mcp-monitoring.md` and the MCP Access docs page (user-facing change → docs sync).
