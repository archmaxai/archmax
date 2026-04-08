import { describe, it, expect } from "vitest";
import { parseSSEChunk } from "../../lib/sse";
import {
  shouldSyncMessages,
  appendToken,
  appendToolCallStart,
  updateToolCall,
  normalizeMessage,
  type ContentSegment,
  type ToolCallInfo,
} from "../../lib/chat-types";

describe("parseSSEChunk", () => {
  it("parses a single event", () => {
    const chunk = 'event: text\ndata: {"content":"hello"}\n\n';
    const events = parseSSEChunk(chunk);
    expect(events).toEqual([
      { event: "text", data: '{"content":"hello"}' },
    ]);
  });

  it("parses multiple events in one chunk", () => {
    const chunk =
      'event: conversation\ndata: {"conversationId":"abc"}\n\n' +
      'event: text\ndata: {"content":"hi"}\n\n';
    const events = parseSSEChunk(chunk);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({ event: "conversation", data: '{"conversationId":"abc"}' });
    expect(events[1]).toEqual({ event: "text", data: '{"content":"hi"}' });
  });

  it("uses 'message' as default event name when no event line", () => {
    const chunk = 'data: {"content":"hello"}\n\n';
    const events = parseSSEChunk(chunk);
    expect(events).toEqual([
      { event: "message", data: '{"content":"hello"}' },
    ]);
  });

  it("returns empty array for incomplete chunk (no double newline)", () => {
    const chunk = 'event: text\ndata: {"content":"partial"}';
    const events = parseSSEChunk(chunk);
    expect(events).toEqual([]);
  });

  it("handles error events", () => {
    const chunk = 'event: error\ndata: {"error":"something went wrong"}\n\n';
    const events = parseSSEChunk(chunk);
    expect(events).toEqual([
      { event: "error", data: '{"error":"something went wrong"}' },
    ]);
  });

  it("handles done event with empty data", () => {
    const chunk = "event: done\ndata: {}\n\n";
    const events = parseSSEChunk(chunk);
    expect(events).toEqual([
      { event: "done", data: "{}" },
    ]);
  });

  it("handles tool_call events", () => {
    const chunk = 'event: tool_call\ndata: {"name":"executeQuery","args":"{\\"sql\\":\\"SELECT 1\\"}"}\n\n';
    const events = parseSSEChunk(chunk);
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("tool_call");
    const parsed = JSON.parse(events[0].data);
    expect(parsed.name).toBe("executeQuery");
  });

  it("resets event name between messages", () => {
    const chunk =
      'event: conversation\ndata: {"id":"1"}\n\n' +
      'data: {"content":"no event line"}\n\n';
    const events = parseSSEChunk(chunk);
    expect(events[0].event).toBe("conversation");
    expect(events[1].event).toBe("message");
  });

  it("ignores empty data lines", () => {
    const chunk = "event: text\n\n";
    const events = parseSSEChunk(chunk);
    expect(events).toEqual([]);
  });

  it("parses tool_call_start and tool_call_end events", () => {
    const chunk =
      'event: tool_call_start\ndata: {"id":"tc1","name":"executeQuery","args":"SELECT 1"}\n\n' +
      'event: tool_call_end\ndata: {"id":"tc1","name":"executeQuery","result":"1 row"}\n\n';
    const events = parseSSEChunk(chunk);
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe("tool_call_start");
    expect(events[1].event).toBe("tool_call_end");
    expect(JSON.parse(events[0].data).id).toBe("tc1");
    expect(JSON.parse(events[1].data).result).toBe("1 row");
  });

  it("parses token events", () => {
    const chunk = 'event: token\ndata: {"content":"Hello"}\n\n';
    const events = parseSSEChunk(chunk);
    expect(events).toEqual([
      { event: "token", data: '{"content":"Hello"}' },
    ]);
  });
});

describe("shouldSyncMessages", () => {
  it("syncs when navigating to a new conversation (null → null)", () => {
    expect(shouldSyncMessages(null, null, false)).toBe(true);
  });

  it("syncs when navigating from one existing conv to another", () => {
    expect(shouldSyncMessages("abc", "def", false)).toBe(true);
  });

  it("syncs when navigating from existing conv to new", () => {
    expect(shouldSyncMessages("abc", null, false)).toBe(true);
  });

  it("syncs when navigating from new to existing conv (not streaming)", () => {
    expect(shouldSyncMessages(null, "abc", false)).toBe(true);
  });

  it("skips sync on creation-navigation (null → id while streaming)", () => {
    expect(shouldSyncMessages(null, "abc", true)).toBe(false);
  });

  it("syncs when navigating between existing convs even while streaming", () => {
    expect(shouldSyncMessages("abc", "def", true)).toBe(true);
  });

  it("syncs when staying on same conversation (prop identity change)", () => {
    expect(shouldSyncMessages("abc", "abc", false)).toBe(true);
  });

  it("syncs when going to new while streaming (stop + new chat)", () => {
    expect(shouldSyncMessages("abc", null, true)).toBe(true);
  });
});

describe("appendToken", () => {
  it("creates a text segment when segments are empty", () => {
    const result = appendToken([], "Hello");
    expect(result).toEqual([{ type: "text", content: "Hello" }]);
  });

  it("appends to the last text segment", () => {
    const segments: ContentSegment[] = [{ type: "text", content: "Hello " }];
    const result = appendToken(segments, "world");
    expect(result).toEqual([{ type: "text", content: "Hello world" }]);
  });

  it("creates a new text segment after a tool_call", () => {
    const tc: ToolCallInfo = { id: "1", name: "ls", args: "{}", status: "running" };
    const segments: ContentSegment[] = [
      { type: "text", content: "Before" },
      { type: "tool_call", toolCall: tc },
    ];
    const result = appendToken(segments, "After");
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ type: "text", content: "Before" });
    expect(result[1]).toEqual({ type: "tool_call", toolCall: tc });
    expect(result[2]).toEqual({ type: "text", content: "After" });
  });

  it("does not mutate the original array", () => {
    const segments: ContentSegment[] = [{ type: "text", content: "Hello" }];
    const result = appendToken(segments, " world");
    expect(segments[0]).toEqual({ type: "text", content: "Hello" });
    expect(result[0]).toEqual({ type: "text", content: "Hello world" });
  });
});

describe("appendToolCallStart", () => {
  it("appends a tool_call segment to empty segments", () => {
    const tc: ToolCallInfo = { id: "tc1", name: "executeQuery", args: '{"sql":"SELECT 1"}', status: "running" };
    const result = appendToolCallStart([], tc);
    expect(result).toEqual([{ type: "tool_call", toolCall: tc }]);
  });

  it("appends after existing text segment", () => {
    const segments: ContentSegment[] = [{ type: "text", content: "Let me query..." }];
    const tc: ToolCallInfo = { id: "tc1", name: "executeQuery", args: "{}", status: "running" };
    const result = appendToolCallStart(segments, tc);
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("text");
    expect(result[1]).toEqual({ type: "tool_call", toolCall: tc });
  });

  it("does not mutate the original array", () => {
    const segments: ContentSegment[] = [];
    const tc: ToolCallInfo = { id: "tc1", name: "ls", args: "{}", status: "running" };
    appendToolCallStart(segments, tc);
    expect(segments).toHaveLength(0);
  });
});

describe("updateToolCall", () => {
  it("updates the matching tool call by id", () => {
    const segments: ContentSegment[] = [
      { type: "text", content: "Before" },
      { type: "tool_call", toolCall: { id: "tc1", name: "executeQuery", args: "{}", status: "running" } },
      { type: "text", content: "After" },
    ];
    const result = updateToolCall(segments, "tc1", { status: "completed", result: "42 rows" });
    expect(result).toHaveLength(3);
    const updated = result[1] as Extract<ContentSegment, { type: "tool_call" }>;
    expect(updated.toolCall.status).toBe("completed");
    expect(updated.toolCall.result).toBe("42 rows");
    expect(updated.toolCall.name).toBe("executeQuery");
  });

  it("leaves non-matching segments unchanged", () => {
    const tc1: ToolCallInfo = { id: "tc1", name: "ls", args: "{}", status: "running" };
    const tc2: ToolCallInfo = { id: "tc2", name: "read_file", args: "{}", status: "running" };
    const segments: ContentSegment[] = [
      { type: "tool_call", toolCall: tc1 },
      { type: "tool_call", toolCall: tc2 },
    ];
    const result = updateToolCall(segments, "tc2", { status: "completed" });
    const first = result[0] as Extract<ContentSegment, { type: "tool_call" }>;
    const second = result[1] as Extract<ContentSegment, { type: "tool_call" }>;
    expect(first.toolCall.status).toBe("running");
    expect(second.toolCall.status).toBe("completed");
  });

  it("returns segments unchanged if id not found", () => {
    const segments: ContentSegment[] = [
      { type: "tool_call", toolCall: { id: "tc1", name: "ls", args: "{}", status: "running" } },
    ];
    const result = updateToolCall(segments, "nonexistent", { status: "completed" });
    const tc = result[0] as Extract<ContentSegment, { type: "tool_call" }>;
    expect(tc.toolCall.status).toBe("running");
  });

  it("does not mutate the original segments", () => {
    const original: ToolCallInfo = { id: "tc1", name: "ls", args: "{}", status: "running" };
    const segments: ContentSegment[] = [{ type: "tool_call", toolCall: original }];
    updateToolCall(segments, "tc1", { status: "completed" });
    expect(original.status).toBe("running");
  });
});

describe("normalizeMessage", () => {
  it("preserves segments if message already has them", () => {
    const msg = {
      role: "assistant" as const,
      segments: [{ type: "text" as const, content: "Hello" }],
    };
    const result = normalizeMessage(msg);
    expect(result.segments).toEqual(msg.segments);
    expect(result.role).toBe("assistant");
  });

  it("converts legacy message with content string to segments", () => {
    const legacy = { role: "assistant", content: "Hello world" } as any;
    const result = normalizeMessage(legacy);
    expect(result.segments).toEqual([{ type: "text", content: "Hello world" }]);
    expect(result.role).toBe("assistant");
  });

  it("converts legacy message with toolCalls to segments", () => {
    const tc: ToolCallInfo = { id: "tc1", name: "ls", args: "{}", status: "completed" };
    const legacy = { role: "assistant", content: "Result:", toolCalls: [tc] } as any;
    const result = normalizeMessage(legacy);
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toEqual({ type: "tool_call", toolCall: tc });
    expect(result.segments[1]).toEqual({ type: "text", content: "Result:" });
  });

  it("converts legacy message with empty content to empty segments", () => {
    const legacy = { role: "assistant", content: "" } as any;
    const result = normalizeMessage(legacy);
    expect(result.segments).toEqual([]);
  });

  it("preserves isStreaming flag", () => {
    const legacy = { role: "assistant", content: "...", isStreaming: true } as any;
    const result = normalizeMessage(legacy);
    expect(result.isStreaming).toBe(true);
  });

  it("uses persisted segments to preserve inline ordering", () => {
    const persisted = {
      role: "assistant",
      content: "Before tool callAfter tool call",
      segments: [
        { type: "text", content: "Before tool call" },
        { type: "tool_call", toolCall: { id: "tc1", name: "ls", args: "{}", status: "completed", result: "files" } },
        { type: "text", content: "After tool call" },
      ],
    } as any;
    const result = normalizeMessage(persisted);
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0]).toEqual({ type: "text", content: "Before tool call" });
    expect(result.segments[1].type).toBe("tool_call");
    expect((result.segments[1] as any).toolCall.name).toBe("ls");
    expect(result.segments[2]).toEqual({ type: "text", content: "After tool call" });
  });

  it("defaults tool call status to completed for persisted segments", () => {
    const persisted = {
      role: "assistant",
      content: "text",
      segments: [
        { type: "tool_call", toolCall: { id: "tc1", name: "ls", args: "{}" } },
        { type: "text", content: "text" },
      ],
    } as any;
    const result = normalizeMessage(persisted);
    const tc = result.segments[0] as Extract<ContentSegment, { type: "tool_call" }>;
    expect(tc.toolCall.status).toBe("completed");
  });
});

describe("segment helpers integration: simulated SSE flow", () => {
  it("reconstructs interleaved text and tool calls from SSE event sequence", () => {
    let segments: ContentSegment[] = [];

    segments = appendToken(segments, "Let me check ");
    segments = appendToken(segments, "the database.");

    const tc: ToolCallInfo = { id: "tc1", name: "executeQuery", args: '{"sql":"SELECT 1"}', status: "running" };
    segments = appendToolCallStart(segments, tc);

    segments = updateToolCall(segments, "tc1", { status: "completed", result: '{"rows":[]}' });

    segments = appendToken(segments, "The query returned ");
    segments = appendToken(segments, "no results.");

    expect(segments).toHaveLength(3);
    expect(segments[0]).toEqual({ type: "text", content: "Let me check the database." });
    expect(segments[1].type).toBe("tool_call");
    const toolSeg = segments[1] as Extract<ContentSegment, { type: "tool_call" }>;
    expect(toolSeg.toolCall.status).toBe("completed");
    expect(segments[2]).toEqual({ type: "text", content: "The query returned no results." });
  });

  it("handles multiple tool calls interleaved with text", () => {
    let segments: ContentSegment[] = [];

    segments = appendToken(segments, "Listing files...");
    segments = appendToolCallStart(segments, { id: "t1", name: "ls", args: "{}", status: "running" });
    segments = updateToolCall(segments, "t1", { status: "completed", result: "a.yaml\nb.yaml" });
    segments = appendToken(segments, "Now reading...");
    segments = appendToolCallStart(segments, { id: "t2", name: "read_file", args: '{"path":"a.yaml"}', status: "running" });
    segments = updateToolCall(segments, "t2", { status: "completed", result: "content" });
    segments = appendToken(segments, "Done!");

    expect(segments).toHaveLength(5);
    expect(segments.map((s) => s.type)).toEqual(["text", "tool_call", "text", "tool_call", "text"]);
  });
});
