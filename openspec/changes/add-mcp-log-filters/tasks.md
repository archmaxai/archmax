# Implementation Tasks

## 1. API: distinct tools endpoint and token activity stats

- [ ] 1.1 Add `GET /api/projects/:projectId/mcp-logs/tools` to `apps/api/src/routes/mcp-logs.ts` returning `string[]` of distinct non-null `toolName` values for the project, sorted alphabetically. Reuse admin session auth (same as the list endpoint).
- [ ] 1.2 Update `GET /api/projects/:projectId/mcp-tokens` (`apps/api/src/routes/mcp-tokens.ts`) to attach `eventCount30d: number` to each returned token using a single aggregation that groups `McpCallLog` by `tokenId` for the last 30 days. Tokens with no events return `0`.
- [ ] 1.3 Add Vitest integration coverage for both endpoints in `apps/api/src/routes/mcp-logs.test.ts` and `apps/api/src/routes/mcp-tokens.test.ts` (or create them if they don't exist) covering: empty project, mixed tool/error/token data, 30-day window boundary.

## 2. Shared UI: shadcn calendar + DateRangePicker

- [ ] 2.1 Install the shadcn `calendar` component into `packages/ui` (per the shadcn skill — use the project's package runner; verify imports use `@archmax/ui` aliases). Re-export from `packages/ui/src/index.ts`.
- [ ] 2.2 Add a small `DateRangePicker` composed from the existing `Popover` and the new `Calendar` (`mode="range"`) in `packages/ui/src/components/date-range-picker.tsx`. Trigger is an outline `Button` styled to match `.filter-trigger` (compact `h-7`, `text-xs`, transparent) showing the formatted range or "Any date" placeholder, with a small calendar icon. Re-export from `packages/ui`.
- [ ] 2.3 Add a unit test for `DateRangePicker` covering: opens on click, applies the selected range to the controlled value, clears via an "X" button when a value is set.

## 3. Frontend: MCP log filter bar

- [ ] 3.1 In `apps/frontend/src/routes/_auth/$projectId/monitoring.tsx`, add a filter bar directly above the table using `flex items-center gap-1.5` per the project's Filter Controls convention. Controls (in this order): Tool Select, Status Select (`All` / `Success` / `Error`), Token Select, `DateRangePicker`, and a clear-all `X` button (visible only when any filter is active).
- [ ] 3.2 Source the Tool Select options from `useQuery` against the new `mcp-logs/tools` endpoint; source the Token Select options from the existing `mcp-tokens` query (filter out soft-deleted tokens implicitly via the API). Default option is `All tools` / `All tokens`.
- [ ] 3.3 Wire all filters into the `useQuery` `queryKey` and pass the values as query params (`toolName`, `tokenId`, `errorOnly`, `from`, `to`). Use ISO date strings (`from` = start-of-day UTC, `to` = end-of-day UTC) so the inclusive range matches user intent.
- [ ] 3.4 Reset `page` to `1` whenever any filter value changes.
- [ ] 3.5 Update the empty-state copy to differentiate between "no logs yet" and "no logs match the current filters" (the latter shows a "Clear filters" button).

## 4. Frontend: token overview activity stats

- [ ] 4.1 In `apps/frontend/src/routes/_auth/$projectId/mcp-access.tsx`, add an `Events (30d)` `TableHead` between the existing `Last Used` and the trailing actions column. Render `eventCount30d` from the API (tabular-nums, muted when `0`).
- [ ] 4.2 Replace the existing `Last Used` cell renderer with a relative-time format (e.g. "5 min ago", "2 days ago") that also shows the time-of-day; show the absolute timestamp in a `Tooltip` on hover. Use a small helper (e.g. `formatRelativeTime`) colocated in the route file or a shared util.
- [ ] 4.3 Make the `McpTokenListItem` interface include `eventCount30d: number` and update any other consumers of the token list query (none expected outside this page).

## 5. Tests

- [ ] 5.1 Add a Playwright/E2E test (or extend the existing MCP Access E2E) that creates a token, performs an MCP `tools/call`, and verifies the token row shows `Events (30d) >= 1` and a relative `Last Used` value.
- [ ] 5.2 Add a Playwright/E2E test for the monitoring page that records two calls (one success, one error, against different tools), then asserts that filtering by tool and by status narrows the table correctly.

## 6. Documentation

- [ ] 6.1 Update `apps/docs/src/content/docs/reference/specs/mcp-monitoring.md` to describe the new filter bar and date range picker.
- [ ] 6.2 Update the MCP Access documentation page (`apps/docs/src/content/docs/...mcp-access*` — locate the actual file during implementation) to mention the `Events (30d)` column and relative-time `Last Used` display.

## 7. Verification

- [ ] 7.1 Run `pnpm typecheck` and `pnpm lint` and ensure both pass.
- [ ] 7.2 Run `pnpm --filter @archmax/api build` to catch declaration emit issues.
- [ ] 7.3 Run `openspec validate add-mcp-log-filters --strict` and resolve any issues.
