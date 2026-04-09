import { describe, it, expect, vi } from "vitest";
import { truncateToolOutput, processAgentStream, createStreamCollector, RESULT_TRUNCATE } from "./agent-stream";
import type { StreamEmitter } from "./agent-stream";

async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) yield item;
}

function createEmitSpy(): { emit: StreamEmitter; calls: Array<{ event: string; data: string }> } {
  const calls: Array<{ event: string; data: string }> = [];
  const emit: StreamEmitter = async (event, data) => {
    calls.push({ event, data });
  };
  return { emit, calls };
}

describe("truncateToolOutput", () => {
  it("leaves short strings untouched", () => {
    expect(truncateToolOutput("short")).toBe("short");
  });

  it("truncates at the limit and appends ellipsis", () => {
    const long = "x".repeat(600);
    const result = truncateToolOutput(long);
    expect(result.length).toBe(RESULT_TRUNCATE + 1); // 500 chars + "…"
    expect(result.endsWith("…")).toBe(true);
    expect(result.startsWith("x".repeat(RESULT_TRUNCATE))).toBe(true);
  });

  it("respects custom max parameter", () => {
    const result = truncateToolOutput("abcdef", 3);
    expect(result).toBe("abc…");
  });

  it("does not truncate at exact boundary", () => {
    const exact = "x".repeat(RESULT_TRUNCATE);
    expect(truncateToolOutput(exact)).toBe(exact);
  });
});

describe("processAgentStream", () => {
  it("collects text-only stream into fullResponse and one text segment", async () => {
    const events = [
      { event: "on_chat_model_stream", data: { chunk: { content: "Hello " } } },
      { event: "on_chat_model_stream", data: { chunk: { content: "world" } } },
    ];
    const { emit, calls } = createEmitSpy();

    const result = await processAgentStream(toAsyncIterable(events), emit);

    expect(result.fullResponse).toBe("Hello world");
    expect(result.segments).toEqual([{ type: "text", content: "Hello world" }]);
    expect(result.toolCalls).toEqual([]);
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.event === "token")).toBe(true);
  });

  it("handles array-style content blocks (Anthropic format)", async () => {
    const events = [
      {
        event: "on_chat_model_stream",
        data: { chunk: { content: [{ type: "text", text: "chunk1" }, { type: "text", text: "chunk2" }] } },
      },
    ];
    const { emit } = createEmitSpy();

    const result = await processAgentStream(toAsyncIterable(events), emit);

    expect(result.fullResponse).toBe("chunk1chunk2");
    expect(result.segments).toEqual([{ type: "text", content: "chunk1chunk2" }]);
  });

  it("skips array blocks that are not text type", async () => {
    const events = [
      {
        event: "on_chat_model_stream",
        data: { chunk: { content: [{ type: "image", url: "http://example.com" }, { type: "text", text: "only text" }] } },
      },
    ];
    const { emit } = createEmitSpy();

    const result = await processAgentStream(toAsyncIterable(events), emit);
    expect(result.fullResponse).toBe("only text");
  });

  it("skips events with no chunk data", async () => {
    const events = [
      { event: "on_chat_model_stream", data: {} },
      { event: "on_chat_model_stream", data: { chunk: { content: "ok" } } },
    ];
    const { emit } = createEmitSpy();

    const result = await processAgentStream(toAsyncIterable(events), emit);
    expect(result.fullResponse).toBe("ok");
  });

  it("produces correct segment ordering with interleaved text and tool calls", async () => {
    const events = [
      { event: "on_chat_model_stream", data: { chunk: { content: "before " } } },
      { event: "on_tool_start", data: { input: { sql: "SELECT 1" } }, run_id: "t1", name: "execute_query" },
      { event: "on_tool_end", data: { output: "result-row" }, run_id: "t1", name: "execute_query" },
      { event: "on_chat_model_stream", data: { chunk: { content: "after" } } },
    ];
    const { emit, calls } = createEmitSpy();

    const result = await processAgentStream(toAsyncIterable(events), emit);

    expect(result.segments).toHaveLength(3);
    expect(result.segments[0]).toEqual({ type: "text", content: "before " });
    expect(result.segments[1].type).toBe("tool_call");
    expect(result.segments[1].toolCall?.name).toBe("execute_query");
    expect(result.segments[2]).toEqual({ type: "text", content: "after" });

    expect(result.fullResponse).toBe("before after");

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].id).toBe("t1");
    expect(result.toolCalls[0].result).toBe("result-row");
    expect(result.toolCalls[0].status).toBe("completed");
  });

  it("emits correct SSE event types", async () => {
    const events = [
      { event: "on_chat_model_stream", data: { chunk: { content: "hi" } } },
      { event: "on_tool_start", data: { input: "args" }, run_id: "r1", name: "tool" },
      { event: "on_tool_end", data: { output: "done" }, run_id: "r1", name: "tool" },
    ];
    const { emit, calls } = createEmitSpy();

    await processAgentStream(toAsyncIterable(events), emit);

    expect(calls.map((c) => c.event)).toEqual(["token", "tool_call_start", "tool_call_end"]);
  });

  it("handles on_tool_end with object output containing content field", async () => {
    const events = [
      { event: "on_tool_start", data: { input: {} }, run_id: "r1", name: "query" },
      { event: "on_tool_end", data: { output: { content: "extracted content" } }, run_id: "r1", name: "query" },
    ];
    const { emit } = createEmitSpy();

    const result = await processAgentStream(toAsyncIterable(events), emit);
    expect(result.toolCalls[0].result).toBe("extracted content");
  });

  it("JSON-stringifies non-string, non-content object output", async () => {
    const events = [
      { event: "on_tool_start", data: { input: {} }, run_id: "r1", name: "query" },
      { event: "on_tool_end", data: { output: { rows: [1, 2] } }, run_id: "r1", name: "query" },
    ];
    const { emit } = createEmitSpy();

    const result = await processAgentStream(toAsyncIterable(events), emit);
    expect(result.toolCalls[0].result).toBe(JSON.stringify({ rows: [1, 2] }));
  });

  it("truncates long tool call args", async () => {
    const longArgs = JSON.stringify({ sql: "x".repeat(600) });
    const events = [
      { event: "on_tool_start", data: { input: longArgs }, run_id: "r1", name: "execute_query" },
    ];
    const { emit } = createEmitSpy();

    const result = await processAgentStream(toAsyncIterable(events), emit);
    expect(result.toolCalls[0].args.length).toBeLessThanOrEqual(RESULT_TRUNCATE + 1);
  });

  it("returns empty result for empty event stream", async () => {
    const { emit } = createEmitSpy();
    const result = await processAgentStream(toAsyncIterable([]), emit);
    expect(result.fullResponse).toBe("");
    expect(result.toolCalls).toEqual([]);
    expect(result.segments).toEqual([]);
  });

  it("populates collector with partial results when iterator throws mid-stream", async () => {
    async function* throwingStream() {
      yield { event: "on_chat_model_stream", data: { chunk: { content: "partial " } } };
      yield { event: "on_tool_start", data: { input: { sql: "SELECT 1" } }, run_id: "t1", name: "execute_query" };
      yield { event: "on_tool_end", data: { output: "row1" }, run_id: "t1", name: "execute_query" };
      yield { event: "on_chat_model_stream", data: { chunk: { content: "more text" } } };
      throw new Error("LLM provider error");
    }

    const { emit } = createEmitSpy();
    const collector = createStreamCollector();

    await expect(
      processAgentStream(throwingStream(), emit, collector),
    ).rejects.toThrow("LLM provider error");

    expect(collector.fullResponse).toBe("partial more text");
    expect(collector.segments).toHaveLength(3);
    expect(collector.segments[0]).toEqual({ type: "text", content: "partial " });
    expect(collector.segments[1].type).toBe("tool_call");
    expect(collector.segments[2]).toEqual({ type: "text", content: "more text" });
    expect(collector.toolCalls).toHaveLength(1);
    expect(collector.toolCalls[0].result).toBe("row1");
  });

  it("flushes pending text buffer when iterator throws", async () => {
    async function* throwAfterText() {
      yield { event: "on_chat_model_stream", data: { chunk: { content: "buffered" } } };
      throw new Error("crash");
    }

    const { emit } = createEmitSpy();
    const collector = createStreamCollector();

    await expect(
      processAgentStream(throwAfterText(), emit, collector),
    ).rejects.toThrow("crash");

    expect(collector.fullResponse).toBe("buffered");
    expect(collector.segments).toEqual([{ type: "text", content: "buffered" }]);
  });

  it("collector is empty when iterator throws before any events", async () => {
    async function* immediateThrow() {
      throw new Error("immediate");
    }

    const { emit } = createEmitSpy();
    const collector = createStreamCollector();

    await expect(
      processAgentStream(immediateThrow() as any, emit, collector),
    ).rejects.toThrow("immediate");

    expect(collector.fullResponse).toBe("");
    expect(collector.segments).toEqual([]);
    expect(collector.toolCalls).toEqual([]);
  });

  it("returns the same collector object on success", async () => {
    const events = [
      { event: "on_chat_model_stream", data: { chunk: { content: "ok" } } },
    ];
    const { emit } = createEmitSpy();
    const collector = createStreamCollector();

    const result = await processAgentStream(toAsyncIterable(events), emit, collector);
    expect(result).toBe(collector);
    expect(result.fullResponse).toBe("ok");
  });
});
