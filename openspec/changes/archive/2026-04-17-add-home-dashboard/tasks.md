## 1. API — Dashboard Stats Endpoint
- [x] 1.1 Create `apps/api/src/routes/dashboard.ts` with `GET /` endpoint returning `{ connections, semanticModels, mcpAccess }` aggregate stats
- [x] 1.2 Wire the dashboard route into `apps/api/src/app.ts` under project-scoped routes
- [x] 1.3 Add unit/integration tests for the dashboard stats endpoint

## 2. Frontend — Dashboard Page
- [x] 2.1 Create `apps/frontend/src/routes/_auth/$projectId/index.tsx` with the dashboard page component
- [x] 2.2 Implement metric cards: Connections count, Semantic Models count (with open improvements badge and total datasets sub-stat), MCP Tokens count (with 7-day calls and error count sub-stats)
- [x] 2.3 Each card links to its respective detail page (connections, models, mcp-access)
- [x] 2.4 Add loading skeletons while stats are being fetched

## 3. Frontend — Onboarding Flow
- [x] 3.1 Implement progressive onboarding stepper: step 1 (create connection), step 2 (create model), step 3 (try MCP)
- [x] 3.2 Each step links to the appropriate page; completed steps show a checkmark
- [x] 3.3 Show the full dashboard when all three steps are satisfied

## 4. Frontend — Dev Feature Toggle
- [x] 4.1 Read `devEmpty` query param on mount and sync to localStorage (`dev-empty-dashboard`)
- [x] 4.2 When toggle is active, override stats to all-zero so onboarding flow renders

## 5. Navigation Updates
- [x] 5.1 Add "Home" leaf nav item at the top of `navItems` in `app-sidebar.tsx` with exact-match active detection
- [x] 5.2 Update `_auth/index.tsx` to redirect to `/$projectId` instead of `/$projectId/connections`
- [x] 5.3 Update project selector switch-project redirect to `/$projectId` instead of `/$projectId/connections`

## 6. Documentation
- [x] 6.1 No docs changes needed — no user-facing docs reference the post-login landing behavior
