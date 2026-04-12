import type { Job } from "bullmq";
import { connectDB } from "@archmax/core/infra/db";
import { TestRun } from "@archmax/core/models/index";
import type { TestRunJobData, TestRunJobResult } from "@archmax/core/queue/types";
import { processTestCase } from "@archmax/core/services/test-runner";

export async function processTestRunJob(
  job: Job<TestRunJobData, TestRunJobResult>,
): Promise<TestRunJobResult> {
  const { testRunId, caseIndex, testAgentId, semanticModel, inputMessage, expectedFacts, maxToolCalls } = job.data;
  const start = Date.now();

  try {
    await processTestCase(testRunId, caseIndex, testAgentId, semanticModel, inputMessage, expectedFacts, maxToolCalls);
  } catch (err) {
    console.error(`[test-processor] Case ${caseIndex} of run ${testRunId} failed:`, err);
  } finally {
    try {
      await connectDB();
      const run = await TestRun.findById(testRunId).lean();
      if (run) {
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
