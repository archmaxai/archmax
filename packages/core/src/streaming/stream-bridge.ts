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

/** Minimal interface for an SSE stream writer (compatible with Hono's SSEStreamingApi). */
export interface SSEWriter {
  writeSSE(message: { event?: string; data: string }): Promise<void>;
}

const SSE_PING_INTERVAL_MS = 15_000;
const SUBSCRIBE_POLL_INTERVAL_MS = 200;
const SUBSCRIBE_PINGS_PER_CYCLE = Math.round(SSE_PING_INTERVAL_MS / SUBSCRIBE_POLL_INTERVAL_MS);

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

/**
 * Bridge Redis pub/sub events to an SSE response stream.
 * Sends periodic pings to keep the connection alive through proxies.
 *
 * The ping sleep is interruptible via a `wakeup` callback so that arrival of a
 * `done` event closes the HTTP body immediately instead of waiting up to
 * `SSE_PING_INTERVAL_MS`. Without this the client sees the `done` SSE event
 * but its `reader.read()` keeps blocking until the server finally closes the
 * response, leaving the chat UI in a "still streaming" state for several
 * seconds after the stream has logically ended.
 */
export async function bridgeRedisToSSE(
  stream: SSEWriter,
  conversationId: string,
  logPrefix = "[sse]",
): Promise<void> {
  let unsubscribe: (() => Promise<void>) | undefined;
  let streamDone = false;
  let wakeup: (() => void) | null = null;

  try {
    unsubscribe = await subscribeToStream(conversationId, (event: StreamEvent) => {
      stream.writeSSE({ event: event.event, data: event.data }).catch(() => {});
      if (event.event === "done") {
        streamDone = true;
        wakeup?.();
        unsubscribe?.().catch(() => {});
      }
    });

    while (!streamDone) {
      await new Promise<void>((resolve) => {
        let resolved = false;
        const timer = setTimeout(() => finish(), SSE_PING_INTERVAL_MS);
        const finish = () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          wakeup = null;
          resolve();
        };
        wakeup = finish;
      });
      if (!streamDone) {
        stream.writeSSE({ event: "ping", data: "{}" }).catch(() => {});
      }
    }
  } catch (err) {
    console.error(`${logPrefix} SSE bridge error:`, err);
    await stream.writeSSE({ event: "error", data: JSON.stringify({ error: "Stream bridge failed" }) });
    await stream.writeSSE({ event: "done", data: "{}" });
  } finally {
    if (!streamDone && unsubscribe) {
      await unsubscribe().catch(() => {});
    }
  }
}

/**
 * Stream buffered events from Redis to an SSE response (polling subscribe).
 * Sends periodic pings to keep the connection alive through proxies.
 */
export async function streamBufferedToSSE(
  stream: SSEWriter,
  conversationId: string,
): Promise<void> {
  let cursor = 0;
  let done = false;
  let pollsSinceLastEvent = 0;

  while (!done) {
    const { events, nextIndex } = await getBufferedStreamEvents(conversationId, cursor);
    cursor = nextIndex;

    if (events.length > 0) {
      pollsSinceLastEvent = 0;
    } else {
      pollsSinceLastEvent++;
    }

    for (const event of events) {
      await stream.writeSSE({ event: event.event, data: event.data });
      if (event.event === "done") {
        done = true;
        break;
      }
    }

    if (!done) {
      if (pollsSinceLastEvent > 0 && pollsSinceLastEvent % SUBSCRIBE_PINGS_PER_CYCLE === 0) {
        stream.writeSSE({ event: "ping", data: "{}" }).catch(() => {});
      }
      await new Promise((r) => setTimeout(r, SUBSCRIBE_POLL_INTERVAL_MS));
    }
  }
}
