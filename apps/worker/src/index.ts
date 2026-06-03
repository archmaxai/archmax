import "./env";

import { Worker } from "bullmq";
import { connectDB } from "@archmax/core/infra/db";
import { runMigrations } from "@archmax/core/infra/migrations/runner";
import { closeRedis } from "@archmax/core/infra/redis";
import { getQueueConnectionOptions } from "@archmax/core/queue/connection";
import {
  AGENT_RUNS_QUEUE,
  TEST_RUNS_QUEUE,
  DEFAULT_WORKER_CONCURRENCY,
} from "@archmax/core/queue/constants";
import type { AgentJobData, AgentJobResult, TestRunJobData, TestRunJobResult } from "@archmax/core/queue/types";
import { validateEnvOrSleep } from "@archmax/core/config/env";
import { processAgentJob, finalizeStalledConversation } from "./processor";
import { processTestRunJob, finalizeStalledTestCase } from "./test-processor";

const workerEnv = await validateEnvOrSleep();

const CONCURRENCY = Math.max(
  1,
  Number(workerEnv.WORKER_CONCURRENCY ?? DEFAULT_WORKER_CONCURRENCY) ||
    DEFAULT_WORKER_CONCURRENCY,
);

async function main() {
  console.log("[worker] Starting agent worker...");

  await connectDB();
  console.log("[worker] MongoDB connected");

  await runMigrations();

  const connection = getQueueConnectionOptions();

  const agentWorker = new Worker<AgentJobData, AgentJobResult>(
    AGENT_RUNS_QUEUE,
    processAgentJob,
    {
      connection,
      concurrency: CONCURRENCY,
      stalledInterval: 60_000,
      // A stalled job is re-run (recovered) `maxStalledCount` times before
      // BullMQ fails it. A native DuckDB/extension crash that kills the worker
      // mid-query surfaces as a stall, so each recovery re-runs the SAME
      // crashing query and aborts the (now supervised, auto-restarting) worker
      // again. Keeping this at 1 still tolerates a single genuine stall (e.g. a
      // deploy/restart mid-job) while capping a deterministically-crashing
      // query at two executions instead of three.
      maxStalledCount: 1,
    },
  );

  agentWorker.on("active", (job) => {
    console.log(
      `[worker] Job ${job.id} started (project=${job.data.projectId}, conv=${job.data.conversationId})`,
    );
  });

  agentWorker.on("completed", (job) => {
    if (job) {
      console.log(
        `[worker] Job ${job.id} completed in ${job.returnvalue?.elapsedMs ?? "?"}ms`,
      );
    }
  });

  agentWorker.on("failed", (job, err) => {
    console.error(
      `[worker] Job ${job?.id ?? "unknown"} failed:`,
      err.message,
    );
    // A "stalled" failure means the worker process was killed mid-run (a native
    // DuckDB/extension crash aborts the process; JS cannot catch it), so
    // `processAgentJob` never finalized the conversation and the client SSE
    // stream is still hanging in "executing". Other failures were already
    // finalized inside the processor before it re-threw, so we must NOT
    // re-finalize them or we'd append a duplicate error message.
    if (job && /stalled/i.test(err.message)) {
      finalizeStalledConversation(job.data.conversationId).catch((e) => {
        console.error(
          `[worker] Failed to finalize stalled conv ${job.data.conversationId}:`,
          e,
        );
      });
    }
  });

  agentWorker.on("stalled", (jobId) => {
    console.warn(`[worker] Job ${jobId} stalled`);
  });

  agentWorker.on("error", (err) => {
    console.error("[worker] Worker error:", err);
  });

  const testWorker = new Worker<TestRunJobData, TestRunJobResult>(
    TEST_RUNS_QUEUE,
    processTestRunJob,
    {
      connection,
      concurrency: CONCURRENCY,
      stalledInterval: 60_000,
      // See the agent worker above: cap a crashing test case at two executions.
      maxStalledCount: 1,
    },
  );

  testWorker.on("active", (job) => {
    console.log(`[worker] Test job ${job.id} started (run=${job.data.testRunId}, case=${job.data.caseIndex})`);
  });

  testWorker.on("completed", (job) => {
    if (job) {
      console.log(`[worker] Test job ${job.id} completed in ${job.returnvalue?.elapsedMs ?? "?"}ms`);
    }
  });

  testWorker.on("failed", (job, err) => {
    console.error(`[worker] Test job ${job?.id ?? "unknown"} failed:`, err.message);
    // A stalled failure means the worker was killed mid-run, so
    // `processTestRunJob`'s `finally` never marked the case terminal — it would
    // stay "running" forever and block the whole run from completing. Other
    // failures are already finalized inside the processor.
    if (job && /stalled/i.test(err.message)) {
      finalizeStalledTestCase(job.data.testRunId, job.data.caseIndex).catch((e) => {
        console.error(
          `[worker] Failed to finalize stalled test case ${job.data.testRunId}/${job.data.caseIndex}:`,
          e,
        );
      });
    }
  });

  testWorker.on("error", (err) => {
    console.error("[worker] Test worker error:", err);
  });

  console.log(
    `[worker] Listening on queues "${AGENT_RUNS_QUEUE}" and "${TEST_RUNS_QUEUE}" (concurrency: ${CONCURRENCY})`,
  );

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received, shutting down...`);
    try {
      await Promise.all([agentWorker.close(), testWorker.close()]);
      console.log("[worker] Workers closed");
    } catch (err) {
      console.error("[worker] Error closing workers:", err);
    }
    try {
      await closeRedis();
    } catch {}
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[worker] Fatal error:", err);
  process.exit(1);
});
