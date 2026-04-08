## 1. Data Model Updates

- [x] 1.1 Add `tags` (array of strings, default `[]`) and `maxToolCalls` (number, optional) fields to `TestCase` model in `packages/core/src/models/TestCase.ts`
- [x] 1.2 Add `maxToolCalls` (number, optional) to the `TestCaseResultSchema` in `packages/core/src/models/TestRun.ts` to snapshot the limit at execution time
- [x] 1.3 Export updated types from `packages/core/src/models/index.ts` if needed

## 2. API Updates

- [x] 2.1 Update `test-cases.ts` create/update schemas to accept `tags` (array of strings) and `maxToolCalls` (optional number)
- [x] 2.2 Add server-side query filtering to `GET /test-cases`: support `agentId`, `semanticModel`, `tags` (comma-separated) query params; build MongoDB filter accordingly
- [x] 2.3 Update `test-runs.ts` GET list endpoint to return paginated results `{ items, total, page, limit }` instead of a flat array
- [x] 2.4 Include `maxToolCalls` in the test run case snapshot when creating a TestRun

## 3. Test Runner — Max Tool Calls Enforcement

- [x] 3.1 Update `processTestCase` in `packages/core/src/services/test-runner.ts` to accept and enforce `maxToolCalls`; abort the agent loop and set status to `error` with message "Exceeded max tool calls (N)" when the limit is reached
- [x] 3.2 Pass `maxToolCalls` from TestCase data through the queue job data (`TestRunJobData`) and into the runner

## 4. Frontend — Sidebar Navigation

- [x] 4.1 Add "Test Runs" as a new sub-item under the Testing group in `app-sidebar.tsx` with path `testing/runs`

## 5. Frontend — Test Runs List Page

- [x] 5.1 Create `apps/frontend/src/routes/_auth/$projectId/testing/runs.tsx` with a paginated table of test runs (status, agent, case count, passed/failed/errors, date), server-side pagination controls
- [x] 5.2 Each row links to `/$projectId/testing/runs/:runId`

## 6. Frontend — Test Run Detail Page

- [x] 6.1 Create `apps/frontend/src/routes/_auth/$projectId/testing/runs.$runId.tsx` showing run metadata (agent, status, timestamps) and a client-side-paginated table/list of case results
- [x] 6.2 Each case result shows: status icon, title, semantic model, input message, agent response, tool calls, fact results with reasoning, duration, error message
- [x] 6.3 Auto-refresh (poll every 3s) while run status is `pending` or `running`
- [x] 6.4 Add a back link/button to return to the Test Runs list

## 7. Frontend — Test Cases Page Updates

- [x] 7.1 Remove the "Run History" section and `TestRunDetailDialog` from `cases.tsx`
- [x] 7.2 Add tags display (badges) to the test cases table
- [x] 7.3 Add tag filter to the filter bar (multi-select or comma input)
- [x] 7.4 Update `CaseFormDialog` to include tags input (chip/tag input) and maxToolCalls (optional number input)
- [x] 7.5 Update `RunBatchDialog` to include agent/model/tag filter controls with a live case count, and on success navigate to the new run detail page
- [x] 7.6 Move test case filtering to server-side query params (agentId, semanticModel, tags) instead of client-side filtering

## 8. Queue Types Update

- [x] 8.1 Add `maxToolCalls` (optional number) to `TestRunJobData` in `packages/core/src/queue/types.ts`
