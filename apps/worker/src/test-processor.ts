import type { Job } from "bullmq";
import Redis from "ioredis";
import { connectDB } from "@archmax/core/infra/db";
import { getRedis, isTestRunCancelFlagSet, clearTestRunCancelFlag } from "@archmax/core/infra/redis";
import { TestRun } from "@archmax/core/models/index";
import { TEST_RUN_CANCEL_CHANNEL_PREFIX } from "@archmax/core/queue/constants";
import type { TestRunJobData, TestRunJobResult } from "@archmax/core/queue/types";
import { processTestCase } from "@archmax/core/services/test-runner";

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
      const run = await TestRun.findById(testRunId).lean();
      if (run && run.status !== "cancelled") {
        const allDone = run.cases.every((c) => c.status !== "pending" && c.status !== "running");
        if (allDone) {
          await TestRun.updateOne({ _id: testRunId }, { status: "completed", completedAt: new Date() });
        }
      }
    } catch (finalizeErr) {
      console.error(`[test-processor] Failed to finalize run ${testRunId}:`, finalizeErr);
    }
  }

  return { testRunId, caseIndex, elapsedMs: Date.now() - start };
}
