import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { randomUUID } from "node:crypto";
import { connectDB } from "@archmax/core/infra/db";
import { Conversation } from "@archmax/core/models/index";
import { createSemlayerAgent } from "@archmax/core/services/agent";
import { processAgentStream } from "@archmax/core/services/agent-stream";
import { isRedisConfigured, publishCancelSignal } from "@archmax/core/infra/redis";
import { enqueueAgentJob } from "@archmax/core/queue/producer";
import {
  subscribeToStream,
  getBufferedStreamEvents,
  isStreamActive,
  type StreamEvent,
} from "@archmax/core/streaming/stream-bridge";
import { generateTitle, truncateTitle } from "../services/title-agent";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

const chatSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().optional(),
});

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

      let result;
      try {
        const events = agent.streamEvents(
          { messages: inputMessages },
          { version: "v2" },
        );
        result = await processAgentStream(
          events,
          (event, data) => stream.writeSSE({ event, data }),
        );
      } catch (err) {
        console.error("[agent] Error during streaming:", err);
        result = result ?? { fullResponse: "The agent encountered an error processing your request.", toolCalls: [], segments: [] };
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            error: err instanceof Error ? err.message : "Unknown error",
          }),
        });
      }

      conv.messages.push({
        role: "assistant",
        content: result.fullResponse,
        toolCalls: result.toolCalls.length ? result.toolCalls : undefined,
        segments: result.segments.length ? result.segments : undefined,
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
    const projectId = c.req.param("projectId")!;
    const conversationId = c.req.param("conversationId");

    await connectDB();
    const conv = await Conversation.findOne({ _id: conversationId, project: projectId }).select("_id").lean();
    if (!conv) return c.json({ error: "Conversation not found" }, 404);

    const active = await isStreamActive(conversationId);
    return c.json({ isStreaming: active });
  })
  .get("/subscribe/:conversationId", async (c) => {
    const projectId = c.req.param("projectId")!;
    const conversationId = c.req.param("conversationId");

    await connectDB();
    const conv = await Conversation.findOne({ _id: conversationId, project: projectId }).select("_id").lean();
    if (!conv) return c.json({ error: "Conversation not found" }, 404);

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
