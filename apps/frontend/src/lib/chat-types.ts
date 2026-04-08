export interface ToolCallInfo {
  id: string;
  name: string;
  args: string;
  status: "running" | "completed" | "error";
  result?: string;
}

export type ContentSegment =
  | { type: "text"; content: string }
  | { type: "tool_call"; toolCall: ToolCallInfo };

export interface ChatMessage {
  role: "user" | "assistant";
  segments: ContentSegment[];
  isStreaming?: boolean;
}

export interface ConversationSummary {
  _id: string;
  title: string;
  updatedAt: string;
}

export interface ConversationListResponse {
  items: ConversationSummary[];
  total: number;
}

export interface ConversationFull extends ConversationSummary {
  messages: ChatMessage[];
  isStreaming?: boolean;
}

/**
 * Convert a persisted conversation message into the interleaved segments format.
 *
 * Prefers the ordered `segments` array (preserves inline ordering from streaming).
 * Falls back to flat `content` + `toolCalls` for older conversations.
 */
export function toSegments(
  content: string,
  toolCalls?: ToolCallInfo[],
  persistedSegments?: ContentSegment[],
): ContentSegment[] {
  if (persistedSegments?.length) {
    return persistedSegments.map((seg) => {
      if (seg.type === "tool_call") {
        return {
          type: "tool_call",
          toolCall: { ...seg.toolCall, status: seg.toolCall.status ?? "completed" },
        };
      }
      return seg;
    });
  }
  const segments: ContentSegment[] = [];
  if (toolCalls?.length) {
    for (const tc of toolCalls) {
      segments.push({
        type: "tool_call",
        toolCall: { ...tc, status: tc.status ?? "completed" },
      });
    }
  }
  if (content) {
    segments.push({ type: "text", content });
  }
  return segments;
}

/** Extract the concatenated text content from segments. */
export function getTextContent(segments: ContentSegment[]): string {
  return segments
    .filter((s): s is Extract<ContentSegment, { type: "text" }> => s.type === "text")
    .map((s) => s.content)
    .join("");
}
