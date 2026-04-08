import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { randomUUID } from "node:crypto";
import { connectDB } from "@semlayer/core/infra/db";
import { Conversation } from "@semlayer/core/models/index";
import { createSemlayerAgent } from "@semlayer/core/services/agent";
import { isRedisConfigured, publishCancelSignal } from "@semlayer/core/infra/redis";
import { enqueueAgentJob } from "@semlayer/core/queue/producer";
import {
  subscribeToStream,
  getBufferedStreamEvents,
  isStreamActive,
  type StreamEvent,
} from "@semlayer/core/streaming/stream-bridge";
import { generateTitle, truncateTitle } from "../services/title-agent";
import type { IMessage, IContentSegment, IToolCallRecord } from "@semlayer/core/models/Conversation";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

const chatSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().optional(),
});

const RESULT_TRUNCATE = 500;

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

const app = new Hono()
  .post("/chat", zValidator("json", chatSchema), async (c) => {
    await connectDB();
    const projectId = c.req.param("projectId")!;
    const { message, conversationId } = c.req.valid("json");

    let conv;
    let isNewConversation = false;
    if (conversationId) {
      conv = await Conversation.findOne({
        _id: conversationId,
        project: projectId,
      });
      if (!conv) {
        return c.json({ error: "Conversation not found" }, 404);
      }
    } else {
      isNewConversation = true;
      conv = new Conversation({
        project: projectId,
        title: truncateTitle(message),
        messages: [],
      });
    }

    conv.messages.push({
      role: "user",
      content: message,
      timestamp: new Date(),
    });
    await conv.save();

    // Worker queue path (Redis available)
    if (isRedisConfigured()) {
      const assistantMessageId = randomUUID();

      try {
        await enqueueAgentJob({
          projectId,
          conversationId: conv._id.toString(),
          assistantMessageId,
          message,
        });
      } catch (err) {
        console.error("[agent] Failed to enqueue job:", err);
        return c.json({ error: "Failed to enqueue agent job" }, 500);
      }

      if (isNewConversation) {
        generateTitle(message)
          .then((title) =>
            Conversation.updateOne({ _id: conv._id }, { title }),
          )
          .catch((err) =>
            console.error("[agent] Failed to save generated title:", err),
          );
      }

      return streamSSE(c, async (stream) => {
        await stream.writeSSE({
          event: "conversation",
          data: JSON.stringify({ conversationId: conv._id }),
        });

        let unsubscribe: (() => Promise<void>) | null = null;

        try {
          unsubscribe = await subscribeToStream(
            conv._id.toString(),
            (event: StreamEvent) => {
              stream
                .writeSSE({ event: event.event, data: event.data })
                .catch(() => {});

              if (event.event === "done") {
                unsubscribe?.().catch(() => {});
                unsubscribe = null;
              }
            },
          );

          // Keep the stream open until the client disconnects or we get a done event.
          // We poll to detect client disconnect since Hono's SSE doesn't expose onClose.
          while (unsubscribe) {
            await new Promise((r) => setTimeout(r, 1000));
          }
        } catch (err) {
          console.error("[agent] SSE bridge error:", err);
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({ error: "Stream bridge failed" }),
          });
          await stream.writeSSE({ event: "done", data: "{}" });
        } finally {
          if (unsubscribe) {
            await unsubscribe().catch(() => {});
          }
        }
      });
    }

    // In-process fallback (no Redis)
    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: "conversation",
        data: JSON.stringify({ conversationId: conv._id }),
      });

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

      try {
        const events = agent.streamEvents(
          { messages: inputMessages },
          { version: "v2" },
        );

        for await (const event of events) {
          if (event.event === "on_chat_model_stream") {
            const chunk = event.data?.chunk;
            if (!chunk) continue;

            const content = chunk.content;
            if (typeof content === "string" && content) {
              fullResponse += content;
              textBuffer += content;
              await stream.writeSSE({
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
                  await stream.writeSSE({
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
            await stream.writeSSE({
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
            await stream.writeSSE({
              event: "tool_call_end",
              data: JSON.stringify({
                id: event.run_id,
                name: event.name,
                result: truncatedResult,
              }),
            });
          }
        }
      } catch (err) {
        console.error("[agent] Error during streaming:", err);
        if (!fullResponse) {
          fullResponse =
            "The agent encountered an error processing your request.";
        }
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            error: err instanceof Error ? err.message : "Unknown error",
          }),
        });
      }

      flushText();

      conv.messages.push({
        role: "assistant",
        content: fullResponse,
        toolCalls: collectedToolCalls.length ? collectedToolCalls : undefined,
        segments: orderedSegments.length ? orderedSegments : undefined,
        timestamp: new Date(),
      });
      await conv.save();

      if (isNewConversation) {
        generateTitle(message)
          .then((title) =>
            Conversation.updateOne({ _id: conv._id }, { title }),
          )
          .catch((err) =>
            console.error("[agent] Failed to save generated title:", err),
          );
      }

      await stream.writeSSE({ event: "done", data: "{}" });
    });
  })
  .post("/cancel/:conversationId", async (c) => {
    const projectId = c.req.param("projectId")!;
    const conversationId = c.req.param("conversationId");

    if (!isRedisConfigured()) {
      return c.json({ ok: true, message: "No worker queue configured" });
    }

    await connectDB();
    const conv = await Conversation.findOne({ _id: conversationId, project: projectId }).select("_id").lean();
    if (!conv) return c.json({ error: "Conversation not found" }, 404);

    await publishCancelSignal(conversationId);
    return c.json({ ok: true });
  })
  .get("/stream-status/:conversationId", async (c) => {
    const conversationId = c.req.param("conversationId");
    const active = await isStreamActive(conversationId);
    return c.json({ isStreaming: active });
  })
  .get("/subscribe/:conversationId", async (c) => {
    const conversationId = c.req.param("conversationId");

    const active = await isStreamActive(conversationId);
    if (!active) {
      return c.json({ error: "No active stream" }, 404);
    }

    return streamSSE(c, async (stream) => {
      let cursor = 0;
      let done = false;

      while (!done) {
        const { events, nextIndex } = await getBufferedStreamEvents(
          conversationId,
          cursor,
        );
        cursor = nextIndex;

        for (const event of events) {
          await stream.writeSSE({ event: event.event, data: event.data });
          if (event.event === "done") {
            done = true;
            break;
          }
        }

        if (!done) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    });
  });

export default app;
