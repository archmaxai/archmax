## Context
The app has no landing page after login. Users are immediately redirected to connections. For new users with empty projects, there is no guidance on what to do first. For returning users, there is no quick overview of project health.

## Goals / Non-Goals
- Goals:
  - Single API call for all dashboard data (avoid N+1 frontend queries)
  - Progressive onboarding: guide new users through connections → models → MCP
  - Feature toggle for empty-state testing without destroying real data
  - Card layout matching existing design conventions (rounded-xl cards, CI color palette)
- Non-Goals:
  - Analytics charts or time-series visualizations (future iteration)
  - Cross-project aggregation (dashboard is project-scoped)
  - Real-time updates / WebSocket push

## Decisions
- **Single stats endpoint**: A new `GET /api/projects/:projectId/dashboard-stats` endpoint aggregates all counts server-side. This avoids multiple parallel frontend fetches and keeps the page snappy with a single `useQuery`.
- **MCP log stats window**: MCP call/error counts cover the last 7 days by default. The API accepts an optional `days` query parameter (1–90).
- **Dataset counting**: The stats endpoint uses `SemanticModelFileService.list()` to read models, then sums dataset counts. Acceptable for the expected scale; cached counts can be introduced later if needed.
- **Feature toggle**: A `dev-empty-dashboard` key in localStorage, toggleable via `?devEmpty=true` / `?devEmpty=false` on the dashboard URL. When active, the UI overrides stats to zero client-side (the actual API response is untouched).
- **Route placement**: The dashboard lives at `_auth/$projectId/index.tsx`, making `/$projectId` resolve to it. The auth index (`_auth/index.tsx`) redirects to `/$projectId` instead of `/$projectId/connections`.
- **Sidebar Home item**: Added as the first leaf nav item (Home icon) pointing to `/$projectId`. Uses exact-match active detection to avoid highlighting on every sub-route.

## Risks / Trade-offs
- Dashboard stats endpoint reads semantic model files from disk for dataset counting — acceptable for small-to-medium projects; if performance becomes an issue, a file-count heuristic or caching can be added.
- Feature toggle is client-side only — does not affect API responses, just UI rendering.
- Changing the default redirect from `/connections` to `/` means existing bookmarks to `/$projectId` will now land on the dashboard instead of showing a 404 or blank page (net positive).

## Open Questions
- None currently.
