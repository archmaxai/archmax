import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  setex: vi.fn(),
  exists: vi.fn(),
  del: vi.fn(),
}));

const fakeRedisClient = {
  publish: mocks.publish,
  setex: mocks.setex,
  exists: mocks.exists,
  del: mocks.del,
};

vi.mock("ioredis", () => ({
  default: vi.fn(),
}));

vi.mock("../config/env", () => ({
  getEnv: vi.fn(() => ({ REDIS_URL: "redis://localhost:6379" })),
}));

let getRedisOverride: (() => typeof fakeRedisClient | null) | null = null;

vi.mock("./redis", async (importOriginal) => {
  const original = await importOriginal<typeof import("./redis")>();
  return {
    ...original,
    getRedis: (...args: unknown[]) => {
      if (getRedisOverride) return getRedisOverride();
      return fakeRedisClient;
    },
  };
});

import {
  publishTestRunCancelSignal,
  isTestRunCancelFlagSet,
  clearTestRunCancelFlag,
} from "./redis";

beforeEach(() => {
  vi.clearAllMocks();
  getRedisOverride = null;
  mocks.publish.mockResolvedValue(1);
  mocks.setex.mockResolvedValue("OK");
  mocks.exists.mockResolvedValue(0);
  mocks.del.mockResolvedValue(1);
});

describe("publishTestRunCancelSignal", () => {
  it("publishes to the cancel channel and sets a flag", async () => {
    await publishTestRunCancelSignal("run-123");

    expect(mocks.publish).toHaveBeenCalledWith(
      "test-run-cancel:run-123",
      "cancel",
    );
    expect(mocks.setex).toHaveBeenCalledWith(
      "test-run-cancel-flag:run-123",
      300,
      "1",
    );
  });

  it("does nothing when Redis is not available", async () => {
    getRedisOverride = () => null;
    await publishTestRunCancelSignal("run-123");
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.setex).not.toHaveBeenCalled();
  });
});

describe("isTestRunCancelFlagSet", () => {
  it("returns true when the flag key exists", async () => {
    mocks.exists.mockResolvedValue(1);
    const result = await isTestRunCancelFlagSet("run-123");
    expect(result).toBe(true);
    expect(mocks.exists).toHaveBeenCalledWith("test-run-cancel-flag:run-123");
  });

  it("returns false when the flag key does not exist", async () => {
    mocks.exists.mockResolvedValue(0);
    const result = await isTestRunCancelFlagSet("run-456");
    expect(result).toBe(false);
  });

  it("returns false when Redis is not available", async () => {
    getRedisOverride = () => null;
    const result = await isTestRunCancelFlagSet("run-123");
    expect(result).toBe(false);
  });
});

describe("clearTestRunCancelFlag", () => {
  it("deletes the flag key", async () => {
    await clearTestRunCancelFlag("run-123");
    expect(mocks.del).toHaveBeenCalledWith("test-run-cancel-flag:run-123");
  });

  it("does nothing when Redis is not available", async () => {
    getRedisOverride = () => null;
    await clearTestRunCancelFlag("run-123");
    expect(mocks.del).not.toHaveBeenCalled();
  });
});
