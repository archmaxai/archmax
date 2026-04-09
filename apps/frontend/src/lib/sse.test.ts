import { describe, it, expect } from "vitest";
import { parseSSEChunk } from "./sse";

describe("parseSSEChunk", () => {
  it("parses a single event with explicit event type", () => {
    const chunk = "event:token\ndata:{\"content\":\"hi\"}\n\n";
    const events = parseSSEChunk(chunk);
    expect(events).toEqual([{ event: "token", data: '{"content":"hi"}' }]);
  });

  it("parses multiple events in one chunk", () => {
    const chunk =
      "event:token\ndata:{\"content\":\"a\"}\n\n" +
      "event:tool_call_start\ndata:{\"id\":\"1\"}\n\n";
    const events = parseSSEChunk(chunk);
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe("token");
    expect(events[1].event).toBe("tool_call_start");
  });

  it("uses 'message' as default event type when no event: line", () => {
    const chunk = "data:hello\n\n";
    const events = parseSSEChunk(chunk);
    expect(events).toEqual([{ event: "message", data: "hello" }]);
  });

  it("returns empty array for incomplete chunk (no trailing blank line)", () => {
    const chunk = "event:token\ndata:partial";
    const events = parseSSEChunk(chunk);
    expect(events).toEqual([]);
  });

  it("handles data with colons in the value", () => {
    const chunk = 'data:{"key":"val","url":"http://x"}\n\n';
    const events = parseSSEChunk(chunk);
    expect(events).toEqual([
      { event: "message", data: '{"key":"val","url":"http://x"}' },
    ]);
  });

  it("resets event type to 'message' between events", () => {
    const chunk =
      "event:custom\ndata:first\n\n" +
      "data:second\n\n";
    const events = parseSSEChunk(chunk);
    expect(events[0].event).toBe("custom");
    expect(events[1].event).toBe("message");
  });

  it("returns empty array for empty string", () => {
    expect(parseSSEChunk("")).toEqual([]);
  });
});
