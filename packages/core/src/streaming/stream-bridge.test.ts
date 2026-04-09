import { describe, it, expect, vi, beforeEach } from "vitest";

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
} from "./stream-bridge";

const mockedGetRedis = vi.mocked(getRedis);

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetRedis.mockReturnValue(mockClient as any);
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
