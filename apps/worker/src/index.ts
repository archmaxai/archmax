import "./env";

import { Worker } from "bullmq";
import { connectDB } from "@archsem/core/infra/db";
import { closeRedis } from "@archsem/core/infra/redis";
import { getQueueConnectionOptions } from "@archsem/core/queue/connection";
import {
  AGENT_RUNS_QUEUE,
  TEST_RUNS_QUEUE,
  DEFAULT_WORKER_CONCURRENCY,
} from "@archsem/core/queue/constants";
import type { AgentJobData, AgentJobResult, TestRunJobData, TestRunJobResult } from "@archsem/core/queue/types";
import { getEnv } from "@archsem/core/config/env";
import { processAgentJob } from "./processor";
import { processTestRunJob } from "./test-processor";

const CONCURRENCY = Math.max(
  1,
  Number(getEnv().WORKER_CONCURRENCY ?? DEFAULT_WORKER_CONCURRENCY) ||
    DEFAULT_WORKER_CONCURRENCY,
);

async function main() {
  console.log("[worker] Starting agent worker...");

  await connectDB();
  console.log("[worker] MongoDB connected");

  const connection = getQueueConnectionOptions();

  const agentWorker = new Worker<AgentJobData, AgentJobResult>(
    AGENT_RUNS_QUEUE,
    processAgentJob,
    {
      connection,
      concurrency: CONCURRENCY,
      stalledInterval: 60_000,
      maxStalledCount: 2,
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
      maxStalledCount: 2,
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
