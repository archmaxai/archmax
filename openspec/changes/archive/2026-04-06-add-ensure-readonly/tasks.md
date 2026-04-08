## 1. Project Model & API
- [x] 1.1 Add `ensureReadonly` field (boolean, default `true`) to `Project` schema in `packages/core/src/models/Project.ts`
- [x] 1.2 Add `ensureReadonly` to Zod create/update schemas in `apps/api/src/routes/projects.ts`
- [x] 1.3 Verify existing project documents get `true` via Mongoose default on read

## 2. DuckDB Federation
- [x] 2.1 Update `getProjectInstance` signature in `packages/core/src/services/duckdb.ts` to accept `ensureReadonly` flag
- [x] 2.2 Conditionally append `READ_ONLY` to the DuckDB ATTACH statement based on the flag
- [x] 2.3 Add `destroyProjectInstance` call when `ensureReadonly` is toggled (in the project update route)
- [x] 2.4 Update all callers of `getProjectInstance` to pass the flag

## 3. Agent executeQuery Tool
- [x] 3.1 Update `makeExecuteQueryTool` in `apps/api/src/services/agent.ts` to accept `ensureReadonly` parameter
- [x] 3.2 Conditionally skip `validateReadOnlySQL` when `ensureReadonly` is `false`
- [x] 3.3 Update tool description text to reflect the project's mode
- [x] 3.4 Load the project's `ensureReadonly` value in `createSemlayerAgent`

## 4. Frontend Settings Page
- [x] 4.1 Add an "Ensure Read-Only Queries" toggle to `apps/frontend/src/routes/_auth/$projectId/settings.tsx`
- [x] 4.2 Wire toggle to PUT `/api/projects/:id` with `{ ensureReadonly }` payload
- [x] 4.3 Show current value from project data loaded via TanStack Query

## 5. Tests
- [x] 5.1 Add test cases for `validateReadOnlySQL` bypass when `ensureReadonly` is `false`
- [x] 5.2 Add API integration test verifying the field persists and is returned
