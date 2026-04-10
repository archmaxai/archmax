import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import mongoose from "mongoose";
import {
  checkMongoDB,
  checkRedis,
  checkEnvVars,
  checkDataDir,
  runHealthChecks,
} from "./health";

vi.mock("mongoose", () => {
  const connection = {
    readyState: 1,
    db: {
      admin: () => ({
        ping: vi.fn().mockResolvedValue({ ok: 1 }),
      }),
    },
  };
  return { default: { connection } };
});

vi.mock("./redis", () => ({
  getRedis: vi.fn(),
}));

vi.mock("../config/env", () => ({
  getEnv: vi.fn().mockReturnValue({
    BETTER_AUTH_SECRET: "a".repeat(32),
    UI_PASSWORD: "password123",
    REDIS_URL: "redis://127.0.0.1:6379",
    ARCHMAX_DATA_DIR: "/tmp/health-test-data",
  }),
}));

vi.mock("node:fs/promises", () => ({
  default: {
    access: vi.fn().mockResolvedValue(undefined),
    constants: { W_OK: 2 },
  },
}));

import { getRedis } from "./redis";
import { getEnv } from "../config/env";
import fs from "node:fs/promises";

const mockGetRedis = getRedis as ReturnType<typeof vi.fn>;
const mockGetEnv = getEnv as ReturnType<typeof vi.fn>;
const mockFsAccess = fs.access as ReturnType<typeof vi.fn>;

describe("checkMongoDB", () => {
  it("returns up when MongoDB is connected and responds to ping", async () => {
    const result = await checkMongoDB();
    expect(result.status).toBe("up");
    expect(result.latencyMs).toBeTypeOf("number");
  });

  it("returns down when readyState is not 1", async () => {
    const original = mongoose.connection.readyState;
    Object.defineProperty(mongoose.connection, "readyState", { value: 0, writable: true });
    const result = await checkMongoDB();
    expect(result.status).toBe("down");
    Object.defineProperty(mongoose.connection, "readyState", { value: original, writable: true });
  });

  it("returns down when ping throws", async () => {
    const original = mongoose.connection.db!.admin;
    mongoose.connection.db!.admin = () =>
      ({ ping: vi.fn().mockRejectedValue(new Error("Connection refused")) }) as any;
    const result = await checkMongoDB();
    expect(result.status).toBe("down");
    expect(result.error).toBe("Connection refused");
    mongoose.connection.db!.admin = original;
  });
});

describe("checkRedis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns up when Redis responds to PING", async () => {
    mockGetRedis.mockReturnValue({ ping: vi.fn().mockResolvedValue("PONG") });
    const result = await checkRedis();
    expect(result.status).toBe("up");
    expect(result.latencyMs).toBeTypeOf("number");
  });

  it("returns down when Redis client is null", async () => {
    mockGetRedis.mockReturnValue(null);
    const result = await checkRedis();
    expect(result.status).toBe("down");
    expect(result.error).toBe("Redis client not available");
  });

  it("returns down when PING throws", async () => {
    mockGetRedis.mockReturnValue({
      ping: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    });
    const result = await checkRedis();
    expect(result.status).toBe("down");
    expect(result.error).toBe("ECONNREFUSED");
  });
});

describe("checkEnvVars", () => {
  it("returns ok when all required vars are set", async () => {
    const result = await checkEnvVars();
    expect(result.status).toBe("ok");
  });

  it("returns missing with list of missing vars", async () => {
    mockGetEnv.mockReturnValue({
      BETTER_AUTH_SECRET: "a".repeat(32),
      UI_PASSWORD: undefined,
      REDIS_URL: undefined,
      ARCHMAX_DATA_DIR: "/tmp",
    });
    const result = await checkEnvVars();
    expect(result.status).toBe("missing");
    expect(result.missing).toContain("UI_PASSWORD");
    expect(result.missing).toContain("REDIS_URL");
  });
});

describe("checkDataDir", () => {
  beforeEach(() => {
    mockGetEnv.mockReturnValue({
      BETTER_AUTH_SECRET: "a".repeat(32),
      UI_PASSWORD: "password123",
      REDIS_URL: "redis://127.0.0.1:6379",
      ARCHMAX_DATA_DIR: "/tmp/health-test-data",
    });
  });

  it("returns ok when directory is writable", async () => {
    mockFsAccess.mockResolvedValue(undefined);
    const result = await checkDataDir();
    expect(result.status).toBe("ok");
    expect(result.path).toBe("/tmp/health-test-data");
  });

  it("returns error when directory is not writable", async () => {
    mockFsAccess.mockRejectedValue(new Error("EACCES: permission denied"));
    const result = await checkDataDir();
    expect(result.status).toBe("error");
    expect(result.error).toBe("EACCES: permission denied");
  });
});

describe("runHealthChecks", () => {
  beforeEach(() => {
    mockGetEnv.mockReturnValue({
      BETTER_AUTH_SECRET: "a".repeat(32),
      UI_PASSWORD: "password123",
      REDIS_URL: "redis://127.0.0.1:6379",
      ARCHMAX_DATA_DIR: "/tmp/health-test-data",
    });
    mockGetRedis.mockReturnValue({ ping: vi.fn().mockResolvedValue("PONG") });
    mockFsAccess.mockResolvedValue(undefined);
    Object.defineProperty(mongoose.connection, "readyState", { value: 1, writable: true });
  });

  it("returns healthy when all checks pass", async () => {
    const result = await runHealthChecks();
    expect(result.status).toBe("healthy");
    expect(result.checks.mongodb.status).toBe("up");
    expect(result.checks.redis.status).toBe("up");
    expect(result.checks.env.status).toBe("ok");
    expect(result.checks.dataDir.status).toBe("ok");
    expect(result.timestamp).toBeTruthy();
  });

  it("returns unhealthy when Redis is down", async () => {
    mockGetRedis.mockReturnValue(null);
    const result = await runHealthChecks();
    expect(result.status).toBe("unhealthy");
    expect(result.checks.redis.status).toBe("down");
  });

  it("returns unhealthy when MongoDB is down", async () => {
    Object.defineProperty(mongoose.connection, "readyState", { value: 0, writable: true });
    const result = await runHealthChecks();
    expect(result.status).toBe("unhealthy");
    expect(result.checks.mongodb.status).toBe("down");
  });

  it("returns unhealthy when data dir is not writable", async () => {
    mockFsAccess.mockRejectedValue(new Error("EACCES"));
    const result = await runHealthChecks();
    expect(result.status).toBe("unhealthy");
    expect(result.checks.dataDir.status).toBe("error");
  });
});
