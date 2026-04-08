# Change: Enhance testing suite with dedicated runs page, tags, and tool call limits

## Why

The current testing UI embeds run history as a section on the Test Cases page and shows run details in a dialog, which doesn't scale well when reviewing many test results. Users need a dedicated runs page with pagination, filtering capabilities via tags, and the ability to limit agent tool calls per test case for cost and behavior control.

## What Changes

- **Test Run Detail Page**: Replace the `TestRunDetailDialog` with a dedicated page at `/$projectId/testing/runs/:runId` showing paginated case results with full agent responses, tool calls, and fact evaluations
- **Test Runs List Page**: Move run history from the Test Cases page into its own page at `/$projectId/testing/runs` with server-side pagination, accessible via a new "Test Runs" sidebar sub-item under Testing
- **Batch navigation**: After initiating a batch run, auto-navigate to the new run detail page
- **Batch filters**: The "Run Batch" dialog gains its own agent/model/tag filters to select which cases to run
- **Tags**: Add a `tags` field (array of strings) to the TestCase model, with UI support for creating/editing/filtering by tags
- **Max tool calls**: Add a `maxToolCalls` field (optional number) to the TestCase model; the test runner enforces this limit and marks the case as `error` if exceeded

## Impact

- Affected specs: `testing-suite`, `frontend-shell`
- Affected code:
  - `packages/core/src/models/TestCase.ts` — add `tags` and `maxToolCalls` fields
  - `packages/core/src/models/TestRun.ts` — add `maxToolCalls` to embedded case result
  - `apps/api/src/routes/test-cases.ts` — update schema, add tag/agent/model query filtering
  - `apps/api/src/routes/test-runs.ts` — add pagination to list endpoint
  - `packages/core/src/services/test-runner.ts` — enforce maxToolCalls
  - `apps/frontend/src/routes/_auth/$projectId/testing/cases.tsx` — remove run history section, add tags UI
  - `apps/frontend/src/routes/_auth/$projectId/testing/runs.tsx` — new runs list page
  - `apps/frontend/src/routes/_auth/$projectId/testing/runs.$runId.tsx` — new run detail page
  - `apps/frontend/src/components/layout/app-sidebar.tsx` — add Test Runs sub-item
- Depends on: `add-testing-suite` being archived first (this change modifies requirements introduced there)
