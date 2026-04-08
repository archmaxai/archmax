import { UnrecoverableError, type Job } from "bullmq";
import Redis from "ioredis";
import { connectDB } from "@semlayer/core/infra/db";
import { Conversation } from "@semlayer/core/models/index";
import { createSemlayerAgent } from "@semlayer/core/services/agent";
import {
  getRedis,
  isCancelFlagSet,
  clearCancelFlag,
} from "@semlayer/core/infra/redis";
import { JOB_CANCEL_CHANNEL_PREFIX } from "@semlayer/core/queue/constants";
import { publishStreamEvent, clearStreamBuffer } from "@semlayer/core/streaming/stream-bridge";
import type { AgentJobData, AgentJobResult } from "@semlayer/core/queue/types";
import type { IMessage, IContentSegment, IToolCallRecord } from "@semlayer/core/models/Conversation";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

const RESULT_TRUNCATE = 500;

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

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
    await Conversation.updateOne(
      { _id: conversationId },
      { $push: { messages: msg } },
    );
  } catch (err) {
    console.error("[worker] Failed to save assistant message:", err);
  }
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

    const agent = await createSemlayerAgent(projectId);

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

    let fullResponse = "";
    let textBuffer = "";
    const collectedToolCalls: IToolCallRecord[] = [];
    const orderedSegments: IContentSegment[] = [];

    const flushText = () => {
      if (textBuffer) {
        orderedSegments.push({ type: "text", content: textBuffer });
        textBuffer = "";
      }
    };

    const events = agent.streamEvents(
      { messages: inputMessages },
      { version: "v2", signal: abortController.signal },
    );

    for await (const event of events) {
      if (event.event === "on_chat_model_stream") {
        const chunk = event.data?.chunk;
        if (!chunk) continue;

        const content = chunk.content;
        if (typeof content === "string" && content) {
          fullResponse += content;
          textBuffer += content;
          await publishStreamEvent(conversationId, {
            event: "token",
            data: JSON.stringify({ content }),
          });
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (
              block.type === "text" &&
              typeof block.text === "string" &&
              block.text
            ) {
              fullResponse += block.text;
              textBuffer += block.text;
              await publishStreamEvent(conversationId, {
                event: "token",
                data: JSON.stringify({ content: block.text }),
              });
            }
          }
        }
      } else if (event.event === "on_tool_start") {
        flushText();
        const inputData = event.data?.input;
        const args =
          typeof inputData === "string"
            ? inputData
            : JSON.stringify(inputData ?? {});
        const truncatedArgs = truncate(args, RESULT_TRUNCATE);
        const tc: IToolCallRecord = {
          id: event.run_id,
          name: event.name,
          args: truncatedArgs,
        };
        collectedToolCalls.push(tc);
        orderedSegments.push({ type: "tool_call", toolCall: tc });
        await publishStreamEvent(conversationId, {
          event: "tool_call_start",
          data: JSON.stringify({
            id: event.run_id,
            name: event.name,
            args: truncatedArgs,
          }),
        });
      } else if (event.event === "on_tool_end") {
        const output = event.data?.output;
        const result =
          typeof output === "string"
            ? output
            : typeof output?.content === "string"
              ? output.content
              : JSON.stringify(output ?? {});
        const truncatedResult = truncate(result, RESULT_TRUNCATE);
        const existing = collectedToolCalls.find((tc) => tc.id === event.run_id);
        if (existing) {
          existing.result = truncatedResult;
          existing.status = "completed";
        }
        await publishStreamEvent(conversationId, {
          event: "tool_call_end",
          data: JSON.stringify({
            id: event.run_id,
            name: event.name,
            result: truncatedResult,
          }),
        });
      }
    }

    flushText();
    cleanup();

    await saveAssistantMessage(conversationId, fullResponse, collectedToolCalls, orderedSegments);
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

    await saveAssistantMessage(
      conversationId,
      "The agent encountered an error processing your request.",
    );
    await publishDone(conversationId, "internal_error");
    await clearStreamBuffer(conversationId);
    throw new UnrecoverableError(
      err instanceof Error ? err.message : String(err),
    );
  }
}
