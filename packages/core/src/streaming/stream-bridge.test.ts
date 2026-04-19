import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockClient = {
  llen: vi.fn(),
  lrange: vi.fn(),
  rpush: vi.fn(),
  publish: vi.fn(),
  expire: vi.fn(),
  del: vi.fn(),
  duplicate: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  quit: vi.fn(),
  on: vi.fn(),
};

vi.mock("../infra/redis", () => ({
  getRedis: vi.fn(() => mockClient),
}));

import { getRedis } from "../infra/redis";
import {
  isStreamActive,
  getBufferedStreamEvents,
  publishStreamEvent,
  clearStreamBuffer,
  subscribeToStream,
  bridgeRedisToSSE,
  streamBufferedToSSE,
  type SSEWriter,
} from "./stream-bridge";

const mockedGetRedis = vi.mocked(getRedis);

function createMockWriter(): SSEWriter & { calls: Array<{ event?: string; data: string }> } {
  const calls: Array<{ event?: string; data: string }> = [];
  return {
    calls,
    writeSSE: vi.fn(async (msg) => { calls.push(msg); }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetRedis.mockReturnValue(mockClient as any);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isStreamActive", () => {
  it("returns true when buffer has items", async () => {
    mockClient.llen.mockResolvedValue(3);
    expect(await isStreamActive("conv-1")).toBe(true);
    expect(mockClient.llen).toHaveBeenCalledWith("stream-buffer:conv-1");
  });

  it("returns false when buffer is empty", async () => {
    mockClient.llen.mockResolvedValue(0);
    expect(await isStreamActive("conv-1")).toBe(false);
  });

  it("returns false when redis is unavailable", async () => {
    mockedGetRedis.mockReturnValue(null);
    expect(await isStreamActive("conv-1")).toBe(false);
  });

  it("returns false when redis throws (closed connection)", async () => {
    mockClient.llen.mockRejectedValue(new Error("Connection is closed."));
    expect(await isStreamActive("conv-1")).toBe(false);
  });
});

describe("getBufferedStreamEvents", () => {
  it("returns parsed events and next index", async () => {
    const raw = [
      JSON.stringify({ event: "text", data: "hello" }),
      JSON.stringify({ event: "done", data: "" }),
    ];
    mockClient.lrange.mockResolvedValue(raw);

    const result = await getBufferedStreamEvents("conv-1", 0);
    expect(result).toEqual({
      events: [
        { event: "text", data: "hello" },
        { event: "done", data: "" },
      ],
      nextIndex: 2,
    });
    expect(mockClient.lrange).toHaveBeenCalledWith("stream-buffer:conv-1", 0, -1);
  });

  it("respects fromIndex for cursor-based reads", async () => {
    mockClient.lrange.mockResolvedValue([
      JSON.stringify({ event: "text", data: "world" }),
    ]);

    const result = await getBufferedStreamEvents("conv-1", 5);
    expect(result.nextIndex).toBe(6);
    expect(mockClient.lrange).toHaveBeenCalledWith("stream-buffer:conv-1", 5, -1);
  });

  it("returns empty when redis is unavailable", async () => {
    mockedGetRedis.mockReturnValue(null);
    const result = await getBufferedStreamEvents("conv-1", 3);
    expect(result).toEqual({ events: [], nextIndex: 3 });
  });

  it("returns empty when redis throws (closed connection)", async () => {
    mockClient.lrange.mockRejectedValue(new Error("Connection is closed."));
    const result = await getBufferedStreamEvents("conv-1", 2);
    expect(result).toEqual({ events: [], nextIndex: 2 });
  });
});

describe("publishStreamEvent", () => {
  it("publishes to channel and appends to buffer", async () => {
    mockClient.publish.mockResolvedValue(1);
    mockClient.rpush.mockResolvedValue(1);
    mockClient.expire.mockResolvedValue(1);

    await publishStreamEvent("conv-1", { event: "text", data: "hi" });

    const payload = JSON.stringify({ event: "text", data: "hi" });
    expect(mockClient.publish).toHaveBeenCalledWith("stream-events:conv-1", payload);
    expect(mockClient.rpush).toHaveBeenCalledWith("stream-buffer:conv-1", payload);
    expect(mockClient.expire).toHaveBeenCalledWith("stream-buffer:conv-1", 300);
  });

  it("no-ops when redis is unavailable", async () => {
    mockedGetRedis.mockReturnValue(null);
    await publishStreamEvent("conv-1", { event: "text", data: "hi" });
    expect(mockClient.publish).not.toHaveBeenCalled();
  });
});

describe("clearStreamBuffer", () => {
  it("deletes the buffer key", async () => {
    mockClient.del.mockResolvedValue(1);
    await clearStreamBuffer("conv-1");
    expect(mockClient.del).toHaveBeenCalledWith("stream-buffer:conv-1");
  });

  it("no-ops when redis is unavailable", async () => {
    mockedGetRedis.mockReturnValue(null);
    await clearStreamBuffer("conv-1");
    expect(mockClient.del).not.toHaveBeenCalled();
  });
});

describe("subscribeToStream", () => {
  it("throws when redis is unavailable", async () => {
    mockedGetRedis.mockReturnValue(null);
    await expect(subscribeToStream("conv-1", vi.fn())).rejects.toThrow(
      "Redis not available",
    );
  });

  it("subscribes and returns unsubscribe function", async () => {
    const mockSub = {
      on: vi.fn(),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
    };
    mockClient.duplicate.mockReturnValue(mockSub);

    const unsub = await subscribeToStream("conv-1", vi.fn());

    expect(mockSub.subscribe).toHaveBeenCalledWith("stream-events:conv-1");
    expect(typeof unsub).toBe("function");

    await unsub();
    expect(mockSub.unsubscribe).toHaveBeenCalledWith("stream-events:conv-1");
  });
});

describe("bridgeRedisToSSE", () => {
  it("forwards events from Redis pub/sub to the SSE writer and exits on done", async () => {
    let messageHandler: (ch: string, msg: string) => void = () => {};
    const mockSub = {
      on: vi.fn((event: string, handler: (ch: string, msg: string) => void) => {
        if (event === "message") messageHandler = handler;
      }),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
    };
    mockClient.duplicate.mockReturnValue(mockSub);

    const writer = createMockWriter();
    vi.useFakeTimers();

    const bridgePromise = bridgeRedisToSSE(writer, "conv-1", "[test]");

    // Simulate events arriving via Redis pub/sub
    await vi.advanceTimersByTimeAsync(0);
    messageHandler("stream-events:conv-1", JSON.stringify({ event: "token", data: '{"content":"hi"}' }));
    messageHandler("stream-events:conv-1", JSON.stringify({ event: "done", data: "{}" }));

    await vi.advanceTimersByTimeAsync(15_000);
    await bridgePromise;

    const eventNames = writer.calls.map((c) => c.event);
    expect(eventNames).toContain("token");
    expect(eventNames).toContain("done");
  });

  it("exits immediately when done arrives without waiting for the next ping", async () => {
    let messageHandler: (ch: string, msg: string) => void = () => {};
    const mockSub = {
      on: vi.fn((event: string, handler: (ch: string, msg: string) => void) => {
        if (event === "message") messageHandler = handler;
      }),
      subscribe: vi.fn().mockResolvedValue(undefined),
      unsubscribe: vi.fn().mockResolvedValue(undefined),
      quit: vi.fn().mockResolvedValue(undefined),
    };
    mockClient.duplicate.mockReturnValue(mockSub);

    const writer = createMockWriter();
    vi.useFakeTimers();

    const bridgePromise = bridgeRedisToSSE(writer, "conv-1", "[test]");

    await vi.advanceTimersByTimeAsync(0);
    messageHandler("stream-events:conv-1", JSON.stringify({ event: "done", data: "{}" }));

    // Without advancing timers past the ping interval (15s), the bridge should
    // still complete — the done event wakes up the ping sleep.
    await vi.advanceTimersByTimeAsync(10);
    await expect(bridgePromise).resolves.toBeUndefined();

    // No ping should have been emitted (we resolved well before the interval).
    const eventNames = writer.calls.map((c) => c.event);
    expect(eventNames).not.toContain("ping");
    expect(eventNames).toContain("done");
  });

  it("emits error and done when Redis subscription fails", async () => {
    mockedGetRedis.mockReturnValue(null);

    const writer = createMockWriter();
    await bridgeRedisToSSE(writer, "conv-1", "[test]");

    const eventNames = writer.calls.map((c) => c.event);
    expect(eventNames).toContain("error");
    expect(eventNames).toContain("done");
  });
});

describe("streamBufferedToSSE", () => {
  it("streams buffered events and stops at done", async () => {
    const writer = createMockWriter();

    mockClient.lrange
      .mockResolvedValueOnce([
        JSON.stringify({ event: "token", data: '{"content":"hello"}' }),
      ])
      .mockResolvedValueOnce([
        JSON.stringify({ event: "token", data: '{"content":" world"}' }),
        JSON.stringify({ event: "done", data: "{}" }),
      ]);

    vi.useFakeTimers();
    const promise = streamBufferedToSSE(writer, "conv-1");
    // First poll returns token, second returns token + done
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(200);
    await promise;

    const eventNames = writer.calls.map((c) => c.event);
    expect(eventNames).toEqual(["token", "token", "done"]);
  });

  it("handles empty polls before events arrive", async () => {
    const writer = createMockWriter();

    mockClient.lrange
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        JSON.stringify({ event: "done", data: "{}" }),
      ]);

    vi.useFakeTimers();
    const promise = streamBufferedToSSE(writer, "conv-1");

    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(200);
    await vi.advanceTimersByTimeAsync(200);
    await promise;

    const eventNames = writer.calls.map((c) => c.event);
    expect(eventNames).toEqual(["done"]);
  });
});
