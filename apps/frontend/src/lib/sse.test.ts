import { describe, it, expect, vi } from "vitest";
import { parseSSEChunk, consumeSSEStream } from "./sse";

function makeReader(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    read: vi.fn(async () => {
      if (i >= chunks.length) return { done: true, value: undefined } as ReadableStreamReadDoneResult;
      return { done: false, value: encoder.encode(chunks[i++]) } as ReadableStreamReadValueResult<Uint8Array>;
    }),
    cancel: vi.fn(),
    releaseLock: vi.fn(),
    closed: Promise.resolve(undefined),
  };
}

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

describe("consumeSSEStream", () => {
  it("returns receivedDone: true when stream includes a done event", async () => {
    const reader = makeReader([
      'event:token\ndata:{"content":"hi"}\n\n',
      'event:done\ndata:{}\n\n',
    ]);
    const events: Array<{ event: string; data: unknown }> = [];
    const result = await consumeSSEStream(reader, (event, parsed) => {
      events.push({ event, data: parsed });
    });

    expect(result.receivedDone).toBe(true);
    expect(events).toHaveLength(2);
    expect(events[0].event).toBe("token");
    expect(events[1].event).toBe("done");
  });

  it("returns receivedDone: false when stream ends without done event", async () => {
    const reader = makeReader([
      'event:token\ndata:{"content":"partial"}\n\n',
    ]);
    const events: string[] = [];
    const result = await consumeSSEStream(reader, (event) => {
      events.push(event);
    });

    expect(result.receivedDone).toBe(false);
    expect(events).toEqual(["token"]);
  });

  it("skips ping events and does not forward them to the callback", async () => {
    const reader = makeReader([
      'event:token\ndata:{"content":"a"}\n\n',
      'event:ping\ndata:{}\n\n',
      'event:token\ndata:{"content":"b"}\n\n',
      'event:done\ndata:{}\n\n',
    ]);
    const events: string[] = [];
    const result = await consumeSSEStream(reader, (event) => {
      events.push(event);
    });

    expect(events).toEqual(["token", "token", "done"]);
    expect(result.receivedDone).toBe(true);
  });

  it("handles chunks split across multiple reads", async () => {
    const reader = makeReader([
      'event:token\ndata:{"conte',
      'nt":"hello"}\n\nevent:done\ndata:{}\n\n',
    ]);
    const events: string[] = [];
    const result = await consumeSSEStream(reader, (event) => {
      events.push(event);
    });

    expect(events).toEqual(["token", "done"]);
    expect(result.receivedDone).toBe(true);
  });

  it("ignores malformed JSON data", async () => {
    const reader = makeReader([
      'event:token\ndata:not-json\n\n',
      'event:token\ndata:{"content":"ok"}\n\n',
      'event:done\ndata:{}\n\n',
    ]);
    const events: string[] = [];
    await consumeSSEStream(reader, (event) => events.push(event));

    expect(events).toEqual(["token", "done"]);
  });

  it("returns receivedDone: false for empty stream", async () => {
    const reader = makeReader([]);
    const events: string[] = [];
    const result = await consumeSSEStream(reader, (event) => events.push(event));

    expect(result.receivedDone).toBe(false);
    expect(events).toEqual([]);
  });
});
