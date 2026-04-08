import { Queue, type Job } from "bullmq";
import { getQueueConnectionOptions } from "./connection";
import {
  AGENT_RUNS_QUEUE,
  TEST_RUNS_QUEUE,
  COMPLETED_JOB_TTL_SECONDS,
  FAILED_JOB_TTL_SECONDS,
} from "./constants";
import type { AgentJobData, AgentJobResult, TestRunJobData, TestRunJobResult } from "./types";

let queue: Queue<AgentJobData, AgentJobResult> | null = null;
let testQueue: Queue<TestRunJobData, TestRunJobResult> | null = null;

function getQueue(): Queue<AgentJobData, AgentJobResult> {
  if (!queue) {
    queue = new Queue<AgentJobData, AgentJobResult>(AGENT_RUNS_QUEUE, {
      connection: getQueueConnectionOptions(),
      defaultJobOptions: {
        removeOnComplete: { age: COMPLETED_JOB_TTL_SECONDS },
        removeOnFail: { age: FAILED_JOB_TTL_SECONDS },
        attempts: 1,
      },
    });
  }
  return queue;
}

function getTestQueue(): Queue<TestRunJobData, TestRunJobResult> {
  if (!testQueue) {
    testQueue = new Queue<TestRunJobData, TestRunJobResult>(TEST_RUNS_QUEUE, {
      connection: getQueueConnectionOptions(),
      defaultJobOptions: {
        removeOnComplete: { age: COMPLETED_JOB_TTL_SECONDS },
        removeOnFail: { age: FAILED_JOB_TTL_SECONDS },
        attempts: 1,
      },
    });
  }
  return testQueue;
}

/**
 * Enqueue an agent execution job.
 * The job ID is the assistantMessageId (unique per turn) so multiple
 * messages in the same conversation can be processed sequentially.
 */
export async function enqueueAgentJob(
  data: AgentJobData,
): Promise<Job<AgentJobData, AgentJobResult>> {
  return getQueue().add("execute", data, {
    jobId: data.assistantMessageId,
  });
}

export async function enqueueTestRunJob(
  data: TestRunJobData,
): Promise<Job<TestRunJobData, TestRunJobResult>> {
  return getTestQueue().add("test-case", data, {
    jobId: `${data.testRunId}-${data.caseIndex}`,
  });
}

