import type { Job } from "bullmq";
import Redis from "ioredis";
import { connectDB } from "@archmax/core/infra/db";
import { getRedis, isTestRunCancelFlagSet, clearTestRunCancelFlag } from "@archmax/core/infra/redis";
import { TestRun } from "@archmax/core/models/index";
import { TEST_RUN_CANCEL_CHANNEL_PREFIX } from "@archmax/core/queue/constants";
import type { TestRunJobData, TestRunJobResult } from "@archmax/core/queue/types";
import { processTestCase } from "@archmax/core/services/test-runner";

/**
 * Re-check whether every case of a run has reached a terminal state and, if so,
 * flip the run to `completed`. Mirrors the `finally` block in
 * `processTestRunJob` so both the happy path and the stalled-recovery path
 * converge on the same finalisation.
 */
async function maybeCompleteRun(testRunId: string): Promise<void> {
  const run = await TestRun.findById(testRunId).lean();
  if (run && run.status !== "cancelled") {
    const allDone = run.cases.every(
      (c) => c.status !== "pending" && c.status !== "running",
    );
    if (allDone) {
      await TestRun.updateOne(
        { _id: testRunId },
        { status: "completed", completedAt: new Date() },
      );
    }
  }
}

/**
 * Finalize a single test case whose worker process was killed mid-run.
 *
 * Like the chat path, a native DuckDB/extension assertion aborts the worker
 * process, so `processTestRunJob`'s `finally` never runs and the case stays
 * stuck in `running` — which also blocks the run from ever reaching
 * `completed`. Called from the test worker's `failed` handler when the failure
 * reason is a stall. Only a `pending`/`running` case is touched, so a case that
 * already recorded a real result (e.g. on an earlier attempt) is left intact.
 */
export async function finalizeStalledTestCase(
  testRunId: string,
  caseIndex: number,
): Promise<void> {
  await connectDB();
  const run = await TestRun.findById(testRunId).lean();
  const current = run?.cases?.[caseIndex]?.status;
  if (current === "pending" || current === "running") {
    await TestRun.updateOne(
      { _id: testRunId },
      {
        $set: {
          [`cases.${caseIndex}.status`]: "error",
          [`cases.${caseIndex}.errorMessage`]:
            "The test worker was terminated mid-run (likely a database engine crash). This case did not complete.",
        },
      },
    );
  }
  await maybeCompleteRun(testRunId);
}

export async function processTestRunJob(
  job: Job<TestRunJobData, TestRunJobResult>,
): Promise<TestRunJobResult> {
  const { testRunId, caseIndex, testAgentId, semanticModel, inputMessage, expectedFacts, maxToolCalls } = job.data;
  const start = Date.now();

  const wasCancelled = await isTestRunCancelFlagSet(testRunId);
  if (wasCancelled) {
    await connectDB();
    await TestRun.updateOne(
      { _id: testRunId },
      { $set: { [`cases.${caseIndex}.status`]: "cancelled" } },
    );
    return { testRunId, caseIndex, elapsedMs: Date.now() - start };
  }

  const abortController = new AbortController();
  let cancelSubscriber: Redis | null = null;

  const cleanup = () => {
    if (cancelSubscriber) {
      const sub = cancelSubscriber;
      cancelSubscriber = null;
      sub.unsubscribe().catch(() => {});
      sub.quit().catch(() => {});
    }
  };

  try {
    const redis = getRedis();
    if (redis) {
      cancelSubscriber = redis.duplicate();
      const channel = `${TEST_RUN_CANCEL_CHANNEL_PREFIX}${testRunId}`;
      try {
        await cancelSubscriber.subscribe(channel);
        cancelSubscriber.on("message", () => {
          console.log(`[test-processor] Cancel signal for run ${testRunId}, case ${caseIndex}`);
          clearTestRunCancelFlag(testRunId);
          abortController.abort(new Error("Test run cancelled"));
        });
      } catch (err) {
        console.warn("[test-processor] Failed to subscribe to cancel channel:", err);
        cancelSubscriber.quit().catch(() => {});
        cancelSubscriber = null;
      }
    }

    await processTestCase(testRunId, caseIndex, testAgentId, semanticModel, inputMessage, expectedFacts, maxToolCalls, abortController.signal);
  } catch (err) {
    console.error(`[test-processor] Case ${caseIndex} of run ${testRunId} failed:`, err);
  } finally {
    cleanup();

    try {
      await connectDB();
      await maybeCompleteRun(testRunId);
    } catch (finalizeErr) {
      console.error(`[test-processor] Failed to finalize run ${testRunId}:`, finalizeErr);
    }
  }

  return { testRunId, caseIndex, elapsedMs: Date.now() - start };
}
