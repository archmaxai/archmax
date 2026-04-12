## 1. Model changes
- [x] 1.1 Add `cancelled` to `ITestRun.status` enum and Mongoose schema (`TestRun.ts`)
- [x] 1.2 Add `cancelled` to `ITestCaseResult.status` enum and Mongoose schema (`TestRun.ts`)

## 2. Cancel signaling infrastructure
- [x] 2.1 Add `publishTestRunCancelSignal(testRunId)` and `isTestRunCancelFlagSet(testRunId)` helpers in `packages/core/src/infra/redis.ts` (reuse existing pattern with a `test-run-cancel-flag:` prefix and `TEST_RUN_CANCEL_CHANNEL_PREFIX`)
- [x] 2.2 Add `TEST_RUN_CANCEL_CHANNEL_PREFIX` constant in `packages/core/src/queue/constants.ts`
- [x] 2.3 Add `removeTestRunJobs(testRunId, caseCount)` helper in `packages/core/src/queue/producer.ts` that removes queued (not-yet-started) BullMQ jobs by their `${testRunId}-${caseIndex}` ID pattern
- [x] 2.4 Add a module-level `cancelledTestRuns: Set<string>` in `packages/core/src/services/test-runner.ts` with `markTestRunCancelled(id)` / `isTestRunCancelled(id)` exports for the in-process (no Redis) path

## 3. API endpoint
- [x] 3.1 Add `POST /:runId/cancel` route in `apps/api/src/routes/test-runs.ts` that: validates the run exists and is `pending` or `running`, sets run status to `cancelled` and `completedAt`, marks all `pending` cases as `cancelled`, publishes cancel signal (Redis path) or marks in-process set (no-Redis path), removes queued BullMQ jobs (Redis path)

## 4. Worker integration
- [x] 4.1 Update `apps/worker/src/test-processor.ts` to check cancel flag before starting a case (early exit with `cancelled` status)
- [x] 4.2 Pass an `AbortSignal` from `test-processor` into `processTestCase` so in-flight LLM streams are aborted on cancel
- [x] 4.3 Subscribe to the test-run cancel channel in the worker so running cases are aborted mid-execution

## 5. Test runner changes
- [x] 5.1 Add optional `signal?: AbortSignal` parameter to `processTestCase` in `packages/core/src/services/test-runner.ts` and pass it to `agent.stream()`
- [x] 5.2 When abort fires mid-execution, write partial results and set case status to `cancelled`
- [x] 5.3 Update the in-process sequential loop in `apps/api/src/routes/test-runs.ts` to check `isTestRunCancelled()` between cases and skip remaining ones

## 6. Frontend
- [x] 6.1 Add "Cancel Run" button on the test run detail page header, visible when `status === "running" || status === "pending"`, calling `POST .../test-runs/:runId/cancel`
- [x] 6.2 Handle `cancelled` status in `runStatusBadge()` (grey badge) and `caseStatusIcon()` (ban/slash icon) on the detail page
- [x] 6.3 Handle `cancelled` status in the runs list page `statusIcon` helper
- [x] 6.4 Stop polling when status becomes `cancelled` (add to the refetchInterval condition)

## 7. Tests
- [x] 7.1 Add integration test for `POST /:runId/cancel` in `apps/api/src/routes/test-runs.integration.test.ts`
- [x] 7.2 Add unit test for cancel flag helpers in redis
- [x] 7.3 Update existing test-runner tests for the new `signal` parameter
