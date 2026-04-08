## 1. API — Data Browser Route

- [x] 1.1 Create `apps/api/src/routes/data-browser.ts` with the three endpoints: list databases, list tables, paginated table data
- [x] 1.2 Implement database name validation against DuckDB catalog (SQL injection prevention)
- [x] 1.3 Mount the route in `apps/api/src/app.ts` under `/api/projects/:projectId/data-browser`
- [x] 1.4 Export route types in `AppType` for typed frontend client

## 2. Frontend — Sidebar Navigation

- [x] 2.1 Add "Data Browser" nav item (with `Table2` icon) to `navItems` in `app-sidebar.tsx`, positioned after "Semantic Models"

## 3. Frontend — Data Browser Page

- [x] 3.1 Create route file `apps/frontend/src/routes/_auth/$projectId/data.tsx`
- [x] 3.2 Implement database list panel (left side) with expandable sections showing tables
- [x] 3.3 Implement data table view (right side) with column headers, row data, and pagination controls
- [x] 3.4 Wire up TanStack Query hooks to the data browser API endpoints
- [x] 3.5 Add empty state for projects with no connections
- [x] 3.6 Add loading and error states
