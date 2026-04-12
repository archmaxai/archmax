import Redis from "ioredis";
import { getEnv } from "../config/env";
import { JOB_CANCEL_CHANNEL_PREFIX, TEST_RUN_CANCEL_CHANNEL_PREFIX } from "../queue/constants";

let redis: Redis | null = null;
let connectionAttempted = false;

export function getRedis(): Redis | null {
  if (redis) return redis;
  if (connectionAttempted) return null;

  connectionAttempted = true;

  const env = getEnv();
  const redisUrl = env.REDIS_URL;

  if (!redisUrl) {
    console.warn(
      "[redis] No REDIS_URL set — worker queue disabled, agent runs in-process",
    );
    return null;
  }

  try {
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) {
          console.error("[redis] Max retries reached, giving up");
          return null;
        }
        return Math.min(times * 100, 3000);
      },
      lazyConnect: true,
    });

    redis.on("error", (err) => {
      console.error("[redis] Connection error:", err.message);
    });

    redis.on("connect", () => {
      console.log("[redis] Connected successfully");
    });

    redis.connect().catch((err) => {
      console.error("[redis] Failed to connect:", err.message);
      redis = null;
    });

    return redis;
  } catch (err) {
    console.error("[redis] Failed to create client:", err);
    return null;
  }
}

export function isRedisConfigured(): boolean {
  return !!getEnv().REDIS_URL;
}

export async function closeRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    connectionAttempted = false;
  }
}

// ---------------------------------------------------------------------------
// Job Cancellation (cross-process signaling for BullMQ workers)
// ---------------------------------------------------------------------------

const CANCEL_FLAG_PREFIX = "job-cancel-flag:";
const CANCEL_FLAG_TTL_SECONDS = 5 * 60;

/**
 * Publish a cancel signal for a running agent job AND set a persistent
 * cancel flag so that queued jobs that haven't started yet will also
 * see the cancellation when they are picked up by the worker.
 */
export async function publishCancelSignal(
  conversationId: string,
): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    await Promise.all([
      client.publish(
        `${JOB_CANCEL_CHANNEL_PREFIX}${conversationId}`,
        "cancel",
      ),
      client.setex(
        `${CANCEL_FLAG_PREFIX}${conversationId}`,
        CANCEL_FLAG_TTL_SECONDS,
        "1",
      ),
    ]);
  } catch (err) {
    console.error("[redis] Failed to publish cancel signal:", err);
  }
}

export async function isCancelFlagSet(
  conversationId: string,
): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  try {
    return (
      (await client.exists(`${CANCEL_FLAG_PREFIX}${conversationId}`)) === 1
    );
  } catch {
    return false;
  }
}

export async function clearCancelFlag(
  conversationId: string,
): Promise<void> {
  const client = getRedis();
  if (!client) return;

  client.del(`${CANCEL_FLAG_PREFIX}${conversationId}`).catch(() => {});
}

// ---------------------------------------------------------------------------
// Test Run Cancellation (cross-process signaling for test-run workers)
// ---------------------------------------------------------------------------

const TEST_RUN_CANCEL_FLAG_PREFIX = "test-run-cancel-flag:";

export async function publishTestRunCancelSignal(
  testRunId: string,
): Promise<void> {
  const client = getRedis();
  if (!client) return;

  try {
    await Promise.all([
      client.publish(
        `${TEST_RUN_CANCEL_CHANNEL_PREFIX}${testRunId}`,
        "cancel",
      ),
      client.setex(
        `${TEST_RUN_CANCEL_FLAG_PREFIX}${testRunId}`,
        CANCEL_FLAG_TTL_SECONDS,
        "1",
      ),
    ]);
  } catch (err) {
    console.error("[redis] Failed to publish test run cancel signal:", err);
  }
}

export async function isTestRunCancelFlagSet(
  testRunId: string,
): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;

  try {
    return (
      (await client.exists(`${TEST_RUN_CANCEL_FLAG_PREFIX}${testRunId}`)) === 1
    );
  } catch {
    return false;
  }
}

export async function clearTestRunCancelFlag(
  testRunId: string,
): Promise<void> {
  const client = getRedis();
  if (!client) return;

  client.del(`${TEST_RUN_CANCEL_FLAG_PREFIX}${testRunId}`).catch(() => {});
}
