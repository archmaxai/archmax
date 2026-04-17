# Change: Add Home Dashboard Page

## Why
The application currently auto-redirects authenticated users to the connections page, offering no overview of the project's state. A home dashboard provides an at-a-glance summary of data connections, semantic models, and MCP access — and guides new users through the setup flow (connections → models → MCP tokens).

## What Changes
- New project-scoped dashboard page at `/$projectId` showing metric cards for connections, semantic models (with improvement request and dataset counts), and MCP tokens (with access/error stats)
- New API endpoint `GET /api/projects/:projectId/dashboard-stats` returning aggregate counts in a single call
- Onboarding flow for empty/new projects: step-by-step guidance toward first connection, first model, first MCP token
- Dev feature toggle (localStorage + query param) to simulate empty state for UI testing
- Sidebar navigation updated with a "Home" item at the top
- Default project redirect changed from `/$projectId/connections` to `/$projectId`

## Impact
- Affected specs: `frontend-shell` (navigation, project selector redirect), new `home-dashboard`
- Affected code: `apps/frontend/src/routes/_auth/index.tsx`, `apps/frontend/src/routes/_auth/$projectId/index.tsx` (new), `apps/frontend/src/components/layout/app-sidebar.tsx`, `apps/api/src/routes/dashboard.ts` (new), `apps/api/src/app.ts`
