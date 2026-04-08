import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { randomUUID } from "node:crypto";
import { connectDB } from "@archsem/core/infra/db";
import { Conversation, TestAgent } from "@archsem/core/models/index";
import { isRedisConfigured, publishCancelSignal } from "@archsem/core/infra/redis";
import { enqueueAgentJob } from "@archsem/core/queue/producer";
import {
  subscribeToStream,
  getBufferedStreamEvents,
  isStreamActive,
  type StreamEvent,
} from "@archsem/core/streaming/stream-bridge";
import { createPlaygroundAgent, getTestAgentRecursionLimit } from "@archsem/core/services/playground-agent";
import { processAgentStream } from "@archsem/core/services/agent-stream";
import { generateTitle, truncateTitle } from "../services/title-agent";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

const chatSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().optional(),
  testAgentId: z.string().min(1),
});

const app = new Hono()
  .post("/chat", zValidator("json", chatSchema), async (c) => {
    await connectDB();
    const projectId = c.req.param("projectId")!;
    const { message, conversationId, testAgentId } = c.req.valid("json");

    const agentOwnerCheck = await TestAgent.findOne({ _id: testAgentId, project: projectId }).lean();
    if (!agentOwnerCheck) return c.json({ error: "Test agent not found" }, 404);

    let conv;
    let isNewConversation = false;
    if (conversationId) {
      conv = await Conversation.findOne({
        _id: conversationId,
        project: projectId,
        testAgent: testAgentId,
      });
      if (!conv) return c.json({ error: "Conversation not found" }, 404);
    } else {
      isNewConversation = true;
      conv = new Conversation({
        project: projectId,
        testAgent: testAgentId,
        title: truncateTitle(message),
        messages: [],
      });
    }

    conv.messages.push({ role: "user", content: message, timestamp: new Date() });
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
          testAgentId,
        });
      } catch (err) {
        console.error("[playground] Failed to enqueue job:", err);
        return c.json({ error: "Failed to enqueue agent job" }, 500);
      }

      if (isNewConversation) {
        generateTitle(message)
          .then((title) => Conversation.updateOne({ _id: conv._id }, { title }))
          .catch((err) => console.error("[playground] Failed to save generated title:", err));
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

          while (unsubscribe) {
            await new Promise((r) => setTimeout(r, 1000));
          }
        } catch (err) {
          console.error("[playground] SSE bridge error:", err);
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

      const agent = await createPlaygroundAgent(testAgentId);

      const inputMessages = conv.messages
        .filter((m: { role: string }) => m.role === "user" || m.role === "assistant")
        .map((m: { role: string; content: string }) =>
          m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content),
        );

      let result;
      try {
        const events = agent.streamEvents(
          { messages: inputMessages },
          { version: "v2", recursionLimit: getTestAgentRecursionLimit() },
        );
        result = await processAgentStream(
          events,
          (event, data) => stream.writeSSE({ event, data }),
        );
      } catch (err) {
        console.error("[playground] Error during streaming:", err);
        const isRecursionError = err instanceof Error && /recursion limit/i.test(err.message);
        const errorMessage = isRecursionError
          ? `The agent exceeded the maximum number of iterations (${getTestAgentRecursionLimit()}). This usually means the model is stuck in a loop — try simplifying your question, adjusting the system prompt, or increasing TEST_AGENT_MAX_ITERATIONS.`
          : err instanceof Error ? err.message : "Unknown error";
        result = result ?? { fullResponse: "The agent encountered an error processing your request.", toolCalls: [], segments: [] };
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ error: errorMessage }),
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
          .then((title) => Conversation.updateOne({ _id: conv._id }, { title }))
          .catch((err) => console.error("[playground] Failed to save generated title:", err));
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
    const conv = await Conversation.findOne({
      _id: conversationId,
      project: projectId,
      testAgent: { $ne: null },
    }).select("_id").lean();
    if (!conv) return c.json({ error: "Conversation not found" }, 404);

    await publishCancelSignal(conversationId);
    return c.json({ ok: true });
  })
  .get("/stream-status/:conversationId", async (c) => {
    const projectId = c.req.param("projectId")!;
    const conversationId = c.req.param("conversationId");

    await connectDB();
    const conv = await Conversation.findOne({
      _id: conversationId,
      project: projectId,
      testAgent: { $ne: null },
    }).select("_id").lean();
    if (!conv) return c.json({ error: "Conversation not found" }, 404);

    const active = await isStreamActive(conversationId);
    return c.json({ isStreaming: active });
  })
  .get("/subscribe/:conversationId", async (c) => {
    const projectId = c.req.param("projectId")!;
    const conversationId = c.req.param("conversationId");

    await connectDB();
    const conv = await Conversation.findOne({
      _id: conversationId,
      project: projectId,
      testAgent: { $ne: null },
    }).select("_id").lean();
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
  })
  .get("/conversations", async (c) => {
    await connectDB();
    const projectId = c.req.param("projectId")!;
    const testAgentId = c.req.query("testAgentId");

    const filter: Record<string, unknown> = {
      project: projectId,
      testAgent: testAgentId ?? { $ne: null },
    };

    if (testAgentId) {
      const agentExists = await TestAgent.findOne({ _id: testAgentId, project: projectId }).lean();
      if (!agentExists) return c.json({ error: "Test agent not found" }, 404);
    }

    const conversations = await Conversation.find(filter)
      .select("title testAgent createdAt updatedAt")
      .sort({ updatedAt: -1 })
      .lean();

    return c.json(conversations);
  })
  .get("/conversations/:conversationId", async (c) => {
    await connectDB();
    const conv = await Conversation.findOne({
      _id: c.req.param("conversationId"),
      project: c.req.param("projectId")!,
      testAgent: { $ne: null },
    }).lean();
    if (!conv) return c.json({ error: "Conversation not found" }, 404);
    const streaming = await isStreamActive(conv._id.toString());
    return c.json({ ...conv, isStreaming: streaming });
  })
  .delete("/conversations/:conversationId", async (c) => {
    await connectDB();
    const conv = await Conversation.findOne({
      _id: c.req.param("conversationId"),
      project: c.req.param("projectId")!,
      testAgent: { $ne: null },
    });
    if (!conv) return c.json({ error: "Conversation not found" }, 404);
    await conv.softDelete();
    return c.json({ ok: true });
  });

export default app;
