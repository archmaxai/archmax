import fs from "node:fs/promises";
import mongoose from "mongoose";
import { getEnv } from "../config/env";
import { getRedis } from "./redis";

const PROBE_TIMEOUT_MS = 2_000;

interface CheckResult {
  status: "up" | "down" | "ok" | "error" | "missing";
  latencyMs?: number;
  missing?: string[];
  path?: string;
  error?: string;
}

export interface HealthCheckResponse {
  status: "healthy" | "unhealthy";
  checks: {
    mongodb: CheckResult;
    redis: CheckResult;
    env: CheckResult;
    dataDir: CheckResult;
  };
  timestamp: string;
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        ac.signal.addEventListener("abort", () =>
          reject(new Error(`Probe timed out after ${ms}ms`)),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function checkMongoDB(): Promise<CheckResult> {
  const start = performance.now();
  try {
    const conn = mongoose.connection;
    if (!conn || conn.readyState !== 1) {
      return { status: "down", error: "Not connected" };
    }
    await withTimeout(conn.db!.admin().ping(), PROBE_TIMEOUT_MS);
    return { status: "up", latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    return {
      status: "down",
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

export async function checkRedis(): Promise<CheckResult> {
  const start = performance.now();
  try {
    const client = getRedis();
    if (!client) {
      return { status: "down", error: "Redis client not available" };
    }
    await withTimeout(client.ping(), PROBE_TIMEOUT_MS);
    return { status: "up", latencyMs: Math.round(performance.now() - start) };
  } catch (err) {
    return {
      status: "down",
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

const REQUIRED_ENV_VARS = [
  "BETTER_AUTH_SECRET",
  "UI_PASSWORD",
  "REDIS_URL",
] as const;

export async function checkEnvVars(): Promise<CheckResult> {
  const env = getEnv();
  const missing = REQUIRED_ENV_VARS.filter(
    (key) => !env[key as keyof typeof env],
  );
  if (missing.length > 0) {
    return { status: "missing", missing: [...missing] };
  }
  return { status: "ok" };
}

export async function checkDataDir(): Promise<CheckResult> {
  const dir = getEnv().ARCHMAX_DATA_DIR;
  try {
    await fs.access(dir, fs.constants.W_OK);
    return { status: "ok", path: dir };
  } catch (err) {
    return {
      status: "error",
      path: dir,
      error: err instanceof Error ? err.message : "Not writable",
    };
  }
}

export async function runHealthChecks(): Promise<HealthCheckResponse> {
  const [mongodb, redis, env, dataDir] = await Promise.allSettled([
    checkMongoDB(),
    checkRedis(),
    checkEnvVars(),
    checkDataDir(),
  ]);

  const results = {
    mongodb:
      mongodb.status === "fulfilled"
        ? mongodb.value
        : { status: "down" as const, error: String(mongodb.reason) },
    redis:
      redis.status === "fulfilled"
        ? redis.value
        : { status: "down" as const, error: String(redis.reason) },
    env:
      env.status === "fulfilled"
        ? env.value
        : { status: "missing" as const, error: String(env.reason) },
    dataDir:
      dataDir.status === "fulfilled"
        ? dataDir.value
        : { status: "error" as const, error: String(dataDir.reason) },
  };

  const allOk =
    results.mongodb.status === "up" &&
    results.redis.status === "up" &&
    results.env.status === "ok" &&
    results.dataDir.status === "ok";

  return {
    status: allOk ? "healthy" : "unhealthy",
    checks: results,
    timestamp: new Date().toISOString(),
  };
}
