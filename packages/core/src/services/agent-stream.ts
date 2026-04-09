import type { IToolCallRecord, IContentSegment } from "../models/Conversation";

export const RESULT_TRUNCATE = 500;

export function truncateToolOutput(s: string, max = RESULT_TRUNCATE): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export interface AgentStreamResult {
  fullResponse: string;
  toolCalls: IToolCallRecord[];
  segments: IContentSegment[];
}

export function createStreamCollector(): AgentStreamResult {
  return { fullResponse: "", toolCalls: [], segments: [] };
}

export type StreamEmitter = (event: string, data: string) => Promise<void>;

/**
 * Consumes a LangChain `streamEvents` async iterable, maps events to
 * SSE-shaped payloads via `emit`, and collects the assistant response,
 * tool calls, and content segments.
 *
 * Pass a `collector` to retain partial state when the iterator throws.
 * The collector is mutated in place; on success the same object is returned.
 */
export async function processAgentStream(
  events: AsyncIterable<{ event: string; data?: any; run_id?: string; name?: string }>,
  emit: StreamEmitter,
  collector?: AgentStreamResult,
): Promise<AgentStreamResult> {
  const result = collector ?? createStreamCollector();
  let textBuffer = "";

  const flushText = () => {
    if (textBuffer) {
      result.segments.push({ type: "text", content: textBuffer });
      textBuffer = "";
    }
  };

  try {
    for await (const event of events) {
      if (event.event === "on_chat_model_stream") {
        const chunk = event.data?.chunk;
        if (!chunk) continue;

        const content = chunk.content;
        if (typeof content === "string" && content) {
          result.fullResponse += content;
          textBuffer += content;
          await emit("token", JSON.stringify({ content }));
        } else if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text" && typeof block.text === "string" && block.text) {
              result.fullResponse += block.text;
              textBuffer += block.text;
              await emit("token", JSON.stringify({ content: block.text }));
            }
          }
        }
      } else if (event.event === "on_tool_start") {
        flushText();
        const inputData = event.data?.input;
        const args = typeof inputData === "string" ? inputData : JSON.stringify(inputData ?? {});
        const truncatedArgs = truncateToolOutput(args);
        const tc: IToolCallRecord = {
          id: event.run_id!,
          name: event.name!,
          args: truncatedArgs,
        };
        result.toolCalls.push(tc);
        result.segments.push({ type: "tool_call", toolCall: tc });
        await emit("tool_call_start", JSON.stringify({
          id: event.run_id,
          name: event.name,
          args: truncatedArgs,
        }));
      } else if (event.event === "on_tool_end") {
        const output = event.data?.output;
        const res = typeof output === "string"
          ? output
          : typeof output?.content === "string"
            ? output.content
            : JSON.stringify(output ?? {});
        const truncatedResult = truncateToolOutput(res);
        const existing = result.toolCalls.find((tc) => tc.id === event.run_id);
        if (existing) {
          existing.result = truncatedResult;
          existing.status = "completed";
        }
        await emit("tool_call_end", JSON.stringify({
          id: event.run_id,
          name: event.name,
          result: truncatedResult,
        }));
      }
    }
  } finally {
    flushText();
  }

  return result;
}
