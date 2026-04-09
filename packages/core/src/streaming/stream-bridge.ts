import { getRedis } from "../infra/redis";
import {
  STREAM_EVENTS_CHANNEL_PREFIX,
  STREAM_BUFFER_PREFIX,
  STREAM_BUFFER_TTL_SECONDS,
} from "../queue/constants";

export interface StreamEvent {
  event: string;
  data: string;
}

/**
 * Publish a stream event from the worker to the API via Redis pub/sub,
 * and append it to a Redis list so reconnecting clients can replay history.
 */
export async function publishStreamEvent(
  conversationId: string,
  event: StreamEvent,
): Promise<void> {
  const client = getRedis();
  if (!client) return;

  const channel = `${STREAM_EVENTS_CHANNEL_PREFIX}${conversationId}`;
  const bufferKey = `${STREAM_BUFFER_PREFIX}${conversationId}`;
  const payload = JSON.stringify(event);

  await Promise.all([
    client.publish(channel, payload),
    client.rpush(bufferKey, payload),
  ]);
  await client.expire(bufferKey, STREAM_BUFFER_TTL_SECONDS);
}

/**
 * Read buffered stream events starting from a given index.
 * Returns the events and the new cursor position.
 */
export async function getBufferedStreamEvents(
  conversationId: string,
  fromIndex: number,
): Promise<{ events: StreamEvent[]; nextIndex: number }> {
  const client = getRedis();
  if (!client) return { events: [], nextIndex: fromIndex };

  try {
    const bufferKey = `${STREAM_BUFFER_PREFIX}${conversationId}`;
    const raw = await client.lrange(bufferKey, fromIndex, -1);
    const events = raw.map((s) => JSON.parse(s) as StreamEvent);
    return { events, nextIndex: fromIndex + events.length };
  } catch {
    return { events: [], nextIndex: fromIndex };
  }
}

/**
 * Check whether a stream buffer exists (i.e. a stream is or was recently active).
 */
export async function isStreamActive(
  conversationId: string,
): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;
  try {
    const bufferKey = `${STREAM_BUFFER_PREFIX}${conversationId}`;
    const len = await client.llen(bufferKey);
    return len > 0;
  } catch {
    return false;
  }
}

/**
 * Delete the stream buffer after the stream completes and the message is saved.
 */
export async function clearStreamBuffer(
  conversationId: string,
): Promise<void> {
  const client = getRedis();
  if (!client) return;
  const bufferKey = `${STREAM_BUFFER_PREFIX}${conversationId}`;
  await client.del(bufferKey);
}

/**
 * Subscribe to stream events for a conversation.
 * Returns an unsubscribe function.
 * Uses a duplicated Redis client so the main client stays available.
 */
export async function subscribeToStream(
  conversationId: string,
  onEvent: (event: StreamEvent) => void,
): Promise<() => Promise<void>> {
  const client = getRedis();
  if (!client) {
    throw new Error("Redis not available for stream subscription");
  }

  const subscriber = client.duplicate();
  const channel = `${STREAM_EVENTS_CHANNEL_PREFIX}${conversationId}`;

  subscriber.on("message", (_ch: string, message: string) => {
    try {
      const parsed: StreamEvent = JSON.parse(message);
      onEvent(parsed);
    } catch (err) {
      console.error("[stream-bridge] Failed to parse stream event:", err);
    }
  });

  await subscriber.subscribe(channel);

  return async () => {
    try {
      await subscriber.unsubscribe(channel);
      subscriber.quit().catch(() => {});
    } catch {
      // already cleaned up
    }
  };
}
