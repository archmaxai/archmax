import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { connectDB } from "@semlayer/core/infra/db";
import { Conversation, TestAgent } from "@semlayer/core/models/index";
import { createPlaygroundAgent, getTestAgentRecursionLimit } from "@semlayer/core/services/playground-agent";
import { generateTitle, truncateTitle } from "../services/title-agent";
import type { IToolCallRecord, IContentSegment } from "@semlayer/core/models/Conversation";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

const chatSchema = z.object({
  message: z.string().min(1),
  conversationId: z.string().optional(),
  testAgentId: z.string().min(1),
});

const RESULT_TRUNCATE = 500;

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

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
          { version: "v2", recursionLimit: getTestAgentRecursionLimit() },
        );

        for await (const event of events) {
          if (event.event === "on_chat_model_stream") {
            const chunk = event.data?.chunk;
            if (!chunk) continue;
            const content = chunk.content;
            if (typeof content === "string" && content) {
              fullResponse += content;
              textBuffer += content;
              await stream.writeSSE({ event: "token", data: JSON.stringify({ content }) });
            } else if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === "text" && typeof block.text === "string" && block.text) {
                  fullResponse += block.text;
                  textBuffer += block.text;
                  await stream.writeSSE({ event: "token", data: JSON.stringify({ content: block.text }) });
                }
              }
            }
          } else if (event.event === "on_tool_start") {
            flushText();
            const inputData = event.data?.input;
            const args = typeof inputData === "string" ? inputData : JSON.stringify(inputData ?? {});
            const tc: IToolCallRecord = {
              id: event.run_id,
              name: event.name,
              args: truncate(args, RESULT_TRUNCATE),
            };
            collectedToolCalls.push(tc);
            orderedSegments.push({ type: "tool_call", toolCall: tc });
            await stream.writeSSE({
              event: "tool_call_start",
              data: JSON.stringify({ id: event.run_id, name: event.name, args: tc.args }),
            });
          } else if (event.event === "on_tool_end") {
            const output = event.data?.output;
            const result = typeof output === "string"
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
              data: JSON.stringify({ id: event.run_id, name: event.name, result: truncatedResult }),
            });
          }
        }
      } catch (err) {
        console.error("[playground] Error during streaming:", err);
        const isRecursionError = err instanceof Error && /recursion limit/i.test(err.message);
        const errorMessage = isRecursionError
          ? `The agent exceeded the maximum number of iterations (${getTestAgentRecursionLimit()}). This usually means the model is stuck in a loop — try simplifying your question, adjusting the system prompt, or increasing TEST_AGENT_MAX_ITERATIONS.`
          : err instanceof Error ? err.message : "Unknown error";
        if (!fullResponse) {
          fullResponse = "The agent encountered an error processing your request.";
        }
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ error: errorMessage }),
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
          .then((title) => Conversation.updateOne({ _id: conv._id }, { title }))
          .catch((err) => console.error("[playground] Failed to save generated title:", err));
      }

      await stream.writeSSE({ event: "done", data: "{}" });
    });
  })
  .get("/conversations", async (c) => {
    await connectDB();
    const projectId = c.req.param("projectId")!;
    const testAgentId = c.req.query("testAgentId");
    if (!testAgentId) return c.json({ error: "testAgentId query param required" }, 400);

    const agentExists = await TestAgent.findOne({ _id: testAgentId, project: projectId }).lean();
    if (!agentExists) return c.json({ error: "Test agent not found" }, 404);

    const conversations = await Conversation.find({
      project: projectId,
      testAgent: testAgentId,
    })
      .select("title createdAt updatedAt")
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
    return c.json(conv);
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
