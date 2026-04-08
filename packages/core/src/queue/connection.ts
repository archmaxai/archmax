import type { ConnectionOptions } from "bullmq";
import { getEnv } from "../config/env";

/**
 * Build BullMQ ConnectionOptions from REDIS_URL.
 * BullMQ manages its own connection pool so we provide raw connection
 * params rather than sharing the ioredis singleton.
 */
export function getQueueConnectionOptions(): ConnectionOptions {
  const url = getEnv().REDIS_URL;
  if (!url) {
    throw new Error("[queue] REDIS_URL must be set for BullMQ");
  }

  const parsed = new URL(url);

  return {
    host: parsed.hostname,
    port: Number(parsed.port) || 6379,
    username: parsed.username || undefined,
    password: parsed.password || undefined,
    ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
  };
}
