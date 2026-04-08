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

/**
 * Process a ReadableStreamDefaultReader as an SSE stream,
 * calling `onEvent` for each complete event in the buffer.
 */
export async function consumeSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (event: string, parsed: Record<string, unknown>) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lastDoubleNewline = buffer.lastIndexOf("\n\n");
    if (lastDoubleNewline === -1) continue;

    const complete = buffer.slice(0, lastDoubleNewline + 2);
    buffer = buffer.slice(lastDoubleNewline + 2);

    for (const { event, data } of parseSSEChunk(complete)) {
      try {
        const parsed = JSON.parse(data);
        onEvent(event, parsed);
      } catch { /* ignore malformed JSON */ }
    }
  }
}
