# Change: Add cancel button for running test runs

## Why
When a test run is in progress (especially large batches with many cases or slow LLM calls), there is no way to stop it. The user must wait for all cases to complete, wasting time and API credits. A cancel button lets users abort a run early, marking remaining pending cases as `cancelled` and stopping any in-flight agent executions.

## What Changes
- Add `cancelled` status to the `TestRun` model (run-level) and `ITestCaseResult` (case-level)
- Add `POST /api/projects/:projectId/test-runs/:runId/cancel` API endpoint
- Implement cancel signaling: Redis pub/sub channel + cancel flag per test run (reusing the existing pattern from agent job cancellation), BullMQ job removal for queued jobs, and `AbortController` integration in `processTestCase`
- In-process (no Redis) fallback: cooperative cancellation via a module-level `Set` of cancelled run IDs checked between sequential case executions
- Add a "Cancel Run" button on the test run detail page, visible only when the run is `pending` or `running`
- Update the test run list page to display the `cancelled` status with appropriate styling
- Update the worker's `test-processor` to subscribe to cancel signals and abort in-flight cases

## Impact
- Affected specs: `testing-suite`
- Affected code: `packages/core/src/models/TestRun.ts`, `packages/core/src/services/test-runner.ts`, `packages/core/src/infra/redis.ts`, `packages/core/src/queue/producer.ts`, `apps/api/src/routes/test-runs.ts`, `apps/worker/src/test-processor.ts`, `apps/frontend/src/routes/_auth/$projectId/testing/runs/$runId.tsx`, `apps/frontend/src/routes/_auth/$projectId/testing/runs/index.tsx`
