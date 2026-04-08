## Context

The testing suite (`add-testing-suite`) is nearly fully implemented. Run history is currently a section on the Test Cases page, and run details are shown in a dialog. This proposal promotes both to dedicated pages, adds tagging and tool-call-limit features, and improves the batch execution UX.

## Goals / Non-Goals

- Goals:
  - Dedicated paginated Test Runs list page and Test Run detail page
  - Tag-based organization and filtering for test cases
  - Tool call limits enforced during test execution
  - Batch run dialog with built-in filters (agent, model, tags)
  - Auto-navigate to run detail page after starting a batch

- Non-Goals:
  - Changing the test execution engine or judge logic
  - Reworking the playground page
  - Adding test scheduling / cron-based execution

## Decisions

### Pagination strategy

- **Test Runs list** (`GET /test-runs`): Server-side pagination returning `{ items, total, page, limit }` (consistent with Test Cases list)
- **Test Run detail** (`GET /test-runs/:runId`): Returns full document including all embedded cases. The frontend paginates the `cases` array client-side. Rationale: embedded case arrays are typically 10–100 items; server-side slicing of embedded arrays adds complexity with minimal benefit at this scale.

### Tag storage

Tags are stored as a flat `string[]` on the TestCase document, lowercase-trimmed on write. No separate Tag collection—tags are derived from existing test cases (aggregated on the frontend or via a distinct query). This keeps the model simple and avoids a separate CRUD surface.

### Max tool calls enforcement

The `maxToolCalls` field is optional on TestCase. When set, the test runner counts tool call invocations during execution. If the count exceeds `maxToolCalls`, the runner aborts the agent loop and marks the case result as `error` with a descriptive message. The limit is stored on both the TestCase and snapshotted into the TestRun case result for auditability.

### Batch run filter flow

The "Run Batch" dialog opens with its own agent/model/tag filter controls. It queries test cases matching the filters and shows a count. On confirm, it sends the matching case IDs to `POST /test-runs`. After success, `useNavigate` redirects to `/$projectId/testing/runs/:newRunId`.

### Test Cases API filtering

The `GET /test-cases` endpoint gains optional query params: `agentId`, `semanticModel`, `tags` (comma-separated). This enables both the page filters and the batch dialog to filter server-side. The current client-side filtering is replaced with server-side filtering for consistency with pagination.

## Risks / Trade-offs

- **Client-side pagination on detail page**: If a run has hundreds of cases, the full document could be large. Mitigation: monitor payload sizes; if needed, add server-side `$slice` later.
- **Tag normalization**: Lowercase-trim only; no tag taxonomy. Users may create near-duplicate tags. Acceptable for initial version.
- **maxToolCalls race condition**: The tool call count check happens between tool calls; a rapid burst could slightly exceed the limit. Acceptable—the limit is a safety guardrail, not a hard budget.

## Open Questions

- None at this time.
