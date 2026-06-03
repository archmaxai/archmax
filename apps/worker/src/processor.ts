import { UnrecoverableError, type Job } from "bullmq";
import Redis from "ioredis";
import { connectDB } from "@archmax/core/infra/db";
import { Conversation } from "@archmax/core/models/index";
import { createSemlayerAgent } from "@archmax/core/services/agent";
import { createPlaygroundAgent, getTestAgentRecursionLimit } from "@archmax/core/services/playground-agent";
import { processAgentStream, createStreamCollector } from "@archmax/core/services/agent-stream";
import {
  getRedis,
  isCancelFlagSet,
  clearCancelFlag,
} from "@archmax/core/infra/redis";
import { JOB_CANCEL_CHANNEL_PREFIX } from "@archmax/core/queue/constants";
import { publishStreamEvent, clearStreamBuffer } from "@archmax/core/streaming/stream-bridge";
import type { AgentJobData, AgentJobResult } from "@archmax/core/queue/types";
import type { IToolCallRecord, IContentSegment } from "@archmax/core/models/Conversation";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

async function publishDone(
  conversationId: string,
  errorCode?: string,
): Promise<void> {
  try {
    if (errorCode) {
      await publishStreamEvent(conversationId, {
        event: "error",
        data: JSON.stringify({ error: errorCode }),
      });
    }
    await publishStreamEvent(conversationId, {
      event: "done",
      data: "{}",
    });
  } catch (err) {
    console.error("[worker] Failed to publish done event:", err);
  }
}

async function saveAssistantMessage(
  conversationId: string,
  content: string,
  toolCalls?: IToolCallRecord[],
  segments?: IContentSegment[],
  error?: string,
): Promise<void> {
  try {
    await connectDB();
    const msg: Record<string, unknown> = {
      role: "assistant",
      content,
      timestamp: new Date(),
    };
    if (toolCalls?.length) {
      msg.toolCalls = toolCalls;
    }
    if (segments?.length) {
      msg.segments = segments;
    }
    if (error) {
      msg.error = error;
    }
    await Conversation.updateOne(
      { _id: conversationId },
      { $push: { messages: msg } },
    );
  } catch (err) {
    console.error("[worker] Failed to save assistant message:", err);
  }
}

/**
 * Finalize a conversation whose worker process was killed mid-run.
 *
 * A native DuckDB/extension assertion (e.g. the mysql_scanner crash) aborts
 * the whole worker process, so `processAgentJob`'s own `catch` never runs:
 * no assistant message is appended and no terminal SSE event is published, so
 * the client stays stuck in "executing" indefinitely. BullMQ only notices once
 * the job stalls past `maxStalledCount` and moves it to `failed`. The (now
 * restarted) worker's `failed` handler calls this so the chat receives a
 * terminal `error` + `done` event and the run is recorded as failed.
 *
 * Safe to call for the crash case only: a job that failed *normally* was
 * already finalized inside `processAgentJob` before it re-threw, so callers
 * must gate this on the stalled-failure reason to avoid a duplicate message.
 */
export async function finalizeStalledConversation(
  conversationId: string,
): Promise<void> {
  await saveAssistantMessage(
    conversationId,
    "The agent stopped unexpectedly — the worker process was terminated mid-run. Please try again.",
    undefined,
    undefined,
    "internal_error",
  );
  await publishDone(conversationId, "internal_error");
  await clearStreamBuffer(conversationId);
}

export async function processAgentJob(
  job: Job<AgentJobData, AgentJobResult>,
  _token?: string,
  bullmqSignal?: AbortSignal,
): Promise<AgentJobResult> {
  const { projectId, conversationId, assistantMessageId, message } = job.data;
  const startMs = Date.now();
  console.log(
    `[worker] Job ${job.id} processing (project=${projectId}, conv=${conversationId})`,
  );

  const wasCancelledBeforeStart = await isCancelFlagSet(conversationId);
  if (wasCancelledBeforeStart) {
    console.log(
      `[worker] Job ${job.id} cancelled before start (conv=${conversationId})`,
    );
    await clearCancelFlag(conversationId);
    await publishDone(conversationId);
    throw new UnrecoverableError("Job cancelled before start");
  }

  const abortController = new AbortController();
  let cancelSubscriber: Redis | null = null;

  const collector = createStreamCollector();

  const cleanup = () => {
    if (cancelSubscriber) {
      const sub = cancelSubscriber;
      cancelSubscriber = null;
      sub.unsubscribe().catch(() => {});
      sub.quit().catch(() => {});
    }
  };

  try {
    if (bullmqSignal) {
      if (bullmqSignal.aborted) {
        abortController.abort(bullmqSignal.reason);
      } else {
        bullmqSignal.addEventListener(
          "abort",
          () => {
            console.log(
              `[worker] BullMQ abort signal for conv ${conversationId}`,
            );
            abortController.abort(
              bullmqSignal.reason ?? new Error("BullMQ cancelled"),
            );
          },
          { once: true },
        );
      }
    }

    const redis = getRedis();
    if (redis) {
      cancelSubscriber = redis.duplicate();
      const channel = `${JOB_CANCEL_CHANNEL_PREFIX}${conversationId}`;
      try {
        await cancelSubscriber.subscribe(channel);
        cancelSubscriber.on("message", () => {
          console.log(
            `[worker] Cancel signal received for conv ${conversationId} (running for ${Date.now() - startMs}ms)`,
          );
          clearCancelFlag(conversationId);
          abortController.abort(new Error("User cancelled"));
        });
      } catch (err) {
        console.warn(
          "[worker] Failed to subscribe to cancel channel:",
          err,
        );
        cancelSubscriber.quit().catch(() => {});
        cancelSubscriber = null;
      }
    }

    await connectDB();
    const conv = await Conversation.findById(conversationId);
    if (!conv) {
      throw new UnrecoverableError("Conversation not found");
    }

    const isPlayground = !!job.data.testAgentId;
    const agent = isPlayground
      ? await createPlaygroundAgent(job.data.testAgentId!)
      : await createSemlayerAgent(projectId);

    const inputMessages = conv.messages
      .filter(
        (m: { role: string }) =>
          m.role === "user" || m.role === "assistant",
      )
      .map((m: { role: string; content: string }) =>
        m.role === "user"
          ? new HumanMessage(m.content)
          : new AIMessage(m.content),
      );

    const streamOptions: Record<string, unknown> = {
      version: "v2",
      signal: abortController.signal,
    };
    if (isPlayground) {
      streamOptions.recursionLimit = getTestAgentRecursionLimit();
    }

    const events = agent.streamEvents(
      { messages: inputMessages },
      streamOptions,
    );

    await processAgentStream(
      events,
      (event, data) => publishStreamEvent(conversationId, { event, data }),
      collector,
      abortController.signal,
    );

    cleanup();

    await saveAssistantMessage(conversationId, collector.fullResponse, collector.toolCalls, collector.segments);
    await publishDone(conversationId);
    await clearStreamBuffer(conversationId);

    const elapsedMs = Date.now() - startMs;
    console.log(
      `[worker] Job ${job.id} completed in ${elapsedMs}ms (conv=${conversationId})`,
    );
    return { conversationId, assistantMessageId, elapsedMs };
  } catch (err) {
    cleanup();

    if (abortController.signal.aborted) {
      const reason = abortController.signal.reason;
      const isUserCancel =
        reason instanceof Error && reason.message === "User cancelled";
      console.log(
        `[worker] Job ${job.id} ${isUserCancel ? "cancelled by user" : "aborted"} after ${Date.now() - startMs}ms (conv=${conversationId})`,
      );

      await saveAssistantMessage(
        conversationId,
        "The agent was cancelled before completing a response.",
      );
      await publishDone(
        conversationId,
        isUserCancel ? undefined : "internal_error",
      );
      await clearStreamBuffer(conversationId);
      throw new UnrecoverableError(
        `Job ${isUserCancel ? "cancelled" : "aborted"}`,
      );
    }

    if (err instanceof UnrecoverableError) throw err;

    console.error(
      `[worker] Job ${job.id} failed after ${Date.now() - startMs}ms (conv=${conversationId}):`,
      err,
    );

    const errorMessage = err instanceof Error ? err.message : String(err);
    await saveAssistantMessage(
      conversationId,
      collector.fullResponse,
      collector.toolCalls.length ? collector.toolCalls : undefined,
      collector.segments.length ? collector.segments : undefined,
      errorMessage,
    );
    await publishDone(conversationId, "internal_error");
    await clearStreamBuffer(conversationId);
    throw new UnrecoverableError(errorMessage);
  }
}
