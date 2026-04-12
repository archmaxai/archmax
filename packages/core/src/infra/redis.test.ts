import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  publish: vi.fn(),
  setex: vi.fn(),
  exists: vi.fn(),
  del: vi.fn(),
  on: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  getEnv: vi.fn(() => ({ REDIS_URL: "redis://localhost:6379" })),
}));

vi.mock("ioredis", () => ({
  default: class FakeRedis {
    publish = mocks.publish;
    setex = mocks.setex;
    exists = mocks.exists;
    del = mocks.del;
    on = mocks.on;
    connect = mocks.connect;
  },
}));

vi.mock("../config/env", () => ({
  getEnv: mocks.getEnv,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.publish.mockResolvedValue(1);
  mocks.setex.mockResolvedValue("OK");
  mocks.exists.mockResolvedValue(0);
  mocks.del.mockResolvedValue(1);
  mocks.connect.mockResolvedValue(undefined);
  mocks.getEnv.mockReturnValue({ REDIS_URL: "redis://localhost:6379" });
});

async function loadModule() {
  return await import("./redis");
}

describe("publishTestRunCancelSignal", () => {
  it("publishes to the cancel channel and sets a flag", async () => {
    const { publishTestRunCancelSignal } = await loadModule();
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
    mocks.getEnv.mockReturnValue({ REDIS_URL: "" });
    const { publishTestRunCancelSignal } = await loadModule();
    await publishTestRunCancelSignal("run-123");
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.setex).not.toHaveBeenCalled();
  });
});

describe("isTestRunCancelFlagSet", () => {
  it("returns true when the flag key exists", async () => {
    mocks.exists.mockResolvedValue(1);
    const { isTestRunCancelFlagSet } = await loadModule();
    const result = await isTestRunCancelFlagSet("run-123");
    expect(result).toBe(true);
    expect(mocks.exists).toHaveBeenCalledWith("test-run-cancel-flag:run-123");
  });

  it("returns false when the flag key does not exist", async () => {
    mocks.exists.mockResolvedValue(0);
    const { isTestRunCancelFlagSet } = await loadModule();
    const result = await isTestRunCancelFlagSet("run-456");
    expect(result).toBe(false);
  });

  it("returns false when Redis is not available", async () => {
    mocks.getEnv.mockReturnValue({ REDIS_URL: "" });
    const { isTestRunCancelFlagSet } = await loadModule();
    const result = await isTestRunCancelFlagSet("run-123");
    expect(result).toBe(false);
  });
});

describe("clearTestRunCancelFlag", () => {
  it("deletes the flag key", async () => {
    const { clearTestRunCancelFlag } = await loadModule();
    await clearTestRunCancelFlag("run-123");
    expect(mocks.del).toHaveBeenCalledWith("test-run-cancel-flag:run-123");
  });

  it("does nothing when Redis is not available", async () => {
    mocks.getEnv.mockReturnValue({ REDIS_URL: "" });
    const { clearTestRunCancelFlag } = await loadModule();
    await clearTestRunCancelFlag("run-123");
    expect(mocks.del).not.toHaveBeenCalled();
  });
});
