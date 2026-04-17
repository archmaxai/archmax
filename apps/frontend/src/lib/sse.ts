export function parseSSEChunk(
  chunk: string,
): Array<{ event: string; data: string }> {
  const events: Array<{ event: string; data: string }> = [];
  let currentEvent = "message";
  let currentData = "";

  for (const line of chunk.split("\n")) {
    if (line.startsWith("event:")) {
      currentEvent = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      currentData = line.slice(5).trim();
    } else if (line === "" && currentData) {
      events.push({ event: currentEvent, data: currentData });
      currentEvent = "message";
      currentData = "";
    }
  }

  return events;
}

export interface SSEStreamResult {
  /** True when the server sent an explicit `done` event (clean end). */
  receivedDone: boolean;
}

/**
 * Process a ReadableStreamDefaultReader as an SSE stream,
 * calling `onEvent` for each complete event in the buffer.
 *
 * Returns metadata about how the stream ended so callers can decide
 * whether to reconnect.
 */
export async function consumeSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: string, parsed: Record<string, unknown>) => void,
): Promise<SSEStreamResult> {
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedDone = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lastDoubleNewline = buffer.lastIndexOf("\n\n");
    if (lastDoubleNewline === -1) continue;

    const complete = buffer.slice(0, lastDoubleNewline + 2);
    buffer = buffer.slice(lastDoubleNewline + 2);

    for (const { event, data } of parseSSEChunk(complete)) {
      if (event === "ping") continue;
      try {
        const parsed = JSON.parse(data);
        if (event === "done") receivedDone = true;
        onEvent(event, parsed);
      } catch { /* ignore malformed JSON */ }
    }
  }

  return { receivedDone };
}
