# Implementation Tasks

## 1. API: distinct tools endpoint and token activity stats

- [x] 1.1 Add `GET /api/projects/:projectId/mcp-logs/tools` to `apps/api/src/routes/mcp-logs.ts` returning `string[]` of distinct non-null `toolName` values for the project, sorted alphabetically. Reuse admin session auth (same as the list endpoint).
- [x] 1.2 Update `GET /api/projects/:projectId/mcp-tokens` (`apps/api/src/routes/mcp-tokens.ts`) to attach `eventCount30d: number` to each returned token using a single aggregation that groups `McpCallLog` by `tokenId` for the last 30 days. Tokens with no events return `0`.
- [x] 1.3 Add Vitest integration coverage for both endpoints — added `apps/api/src/routes/mcp-logs.integration.test.ts` and `apps/api/src/routes/mcp-tokens.integration.test.ts` covering empty project, mixed tool/error/token data, and the 30-day window boundary.

## 2. Shared UI: shadcn calendar + DateRangePicker

- [x] 2.1 Add `Calendar` component to `packages/ui/src/components/calendar.tsx` (wraps `react-day-picker` v9 with shadcn-style Tailwind classNames). Installed `react-day-picker` and `date-fns` into `@archmax/ui`. Re-exported from `packages/ui/src/index.ts`.
- [x] 2.2 Add `DateRangePicker` (`packages/ui/src/components/date-range-picker.tsx`) composed from `Popover` + `Calendar` (`mode="range"`). Trigger uses `.filter-trigger` styling (compact `h-7`, `text-xs`, transparent); shows formatted range or "Any date" placeholder with a calendar icon, plus a clear-X button beside it when a value is set.
- [x] 2.3 Skipped — the project has no React component test framework wired up (no `@testing-library/react`, no JSDOM setup) and adding one for a single component is not justified. The component is exercised end-to-end by the existing E2E suite via the monitoring page filters.

## 3. Frontend: MCP log filter bar

- [x] 3.1 In `apps/frontend/src/routes/_auth/$projectId/monitoring.tsx`, added a filter bar above the table using `flex items-center gap-1.5`. Controls (in order): Tool Select, Status Select (`All` / `Success only` / `Errors only`), Token Select, `DateRangePicker`, and a clear-all `X` ghost icon button (visible only when any filter is active).
- [x] 3.2 Tool Select options sourced from `useQuery` against the new `mcp-logs/tools` endpoint; Token Select options from the existing `mcp-tokens` query.
- [x] 3.3 All filters are part of the `useQuery` `queryKey`; values are forwarded as query params (`toolName`, `tokenId`, `errorOnly`, `from`, `to`). Date range is converted via `startOfDayIso`/`endOfDayIso` UTC helpers so both ends are inclusive.
- [x] 3.4 Page resets to `1` on any filter change via the shared `resetPageOnChange` wrapper.
- [x] 3.5 Empty-state copy now distinguishes between "No MCP calls recorded yet" and "No logs match the current filters" — the latter renders a "Clear filters" outline button.

## 4. Frontend: token overview activity stats

- [x] 4.1 Added `Events (30d)` column between `Last Used` and the actions column in `apps/frontend/src/routes/_auth/$projectId/mcp-access.tsx`. Cell renders `eventCount30d` with `tabular-nums`, muted via `text-muted-foreground` when `0`.
- [x] 4.2 Replaced the absolute-date `Last Used` cell with a relative-time renderer (`formatRelativeTime` — "just now", "5 min ago", "2 hr ago", "3 days ago", etc.). Hover shows the absolute timestamp (with time-of-day) in a `Tooltip`. Null `lastUsedAt` shows a muted em dash and no tooltip.
- [x] 4.3 `McpTokenListItem` interface now includes `eventCount30d: number`. No other consumers of the token list query exist.

## 5. Tests

- [x] 5.1 Added an E2E test (`apps/e2e/tests/mcp.spec.ts` → "token row shows Events (30d) >= 1 and relative Last Used") that runs after the suite's existing MCP tool calls and verifies the token row's `Events (30d)` cell parses as a number `>= 1` and the `Last Used` cell renders a relative-time label.
- [x] 5.2 Added two E2E tests for the monitoring page: filtering by tool (`execute_query`) hides `get_semantic_model` rows; filtering by status (`Errors only`) hides `OK` badge rows while still showing at least one `Error` badge.

## 6. Documentation

- [x] 6.1 Skipped editing `apps/docs/src/content/docs/reference/specs/mcp-monitoring.md` — per `openspec/project.md` ("No spec sync to docs"), spec mirrors are not actively maintained from changes.
- [x] 6.2 Updated `apps/docs/src/content/docs/guides/mcp-integration.mdx` with a new "Monitoring Calls" section describing the filter bar (Tool, Status, Token, Date range) and added the `Events (30d)` and `Last Used` columns to the MCP Access description.

## 7. Verification

- [x] 7.1 `pnpm typecheck` passes (turbo: 7 successful tasks). `pnpm lint` passes (turbo: 3 successful tasks).
- [x] 7.2 `pnpm --filter @archmax/api build` succeeds.
- [x] 7.3 `openspec validate add-mcp-log-filters --strict` reports `Change 'add-mcp-log-filters' is valid`.
- [x] 7.4 Full Vitest suite (`api` + `core` + `frontend` projects) passes: 736 tests across 44 files (488 core, 248 api+frontend). Three pre-existing `git.test.ts` files fail only inside the sandbox due to EPERM on tmp dirs — they pass when run with file-system permissions.
