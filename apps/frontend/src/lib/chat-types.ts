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
  error?: string;
}

export interface ConversationSummary {
  _id: string;
  title: string;
  updatedAt: string;
  isStreaming?: boolean;
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

export function appendToken(segments: ContentSegment[], content: string): ContentSegment[] {
  const next = [...segments];
  const last = next[next.length - 1];
  if (last?.type === "text") {
    next[next.length - 1] = { type: "text", content: last.content + content };
  } else {
    next.push({ type: "text", content });
  }
  return next;
}

export function appendToolCallStart(segments: ContentSegment[], tc: ToolCallInfo): ContentSegment[] {
  return [...segments, { type: "tool_call", toolCall: tc }];
}

export function updateToolCall(
  segments: ContentSegment[],
  id: string,
  update: Partial<ToolCallInfo>,
): ContentSegment[] {
  return segments.map((seg) => {
    if (seg.type === "tool_call" && seg.toolCall.id === id) {
      return { type: "tool_call", toolCall: { ...seg.toolCall, ...update } };
    }
    return seg;
  });
}

export function normalizeMessage(msg: ChatMessage): ChatMessage {
  const raw = msg as unknown as { content?: string; toolCalls?: ToolCallInfo[]; segments?: ContentSegment[]; error?: string };
  const error = msg.error ?? raw.error;
  if (msg.segments?.length) {
    return {
      role: msg.role,
      isStreaming: msg.isStreaming,
      error,
      segments: msg.segments.map((s) =>
        s.type === "tool_call"
          ? { type: "tool_call" as const, toolCall: { ...s.toolCall, status: s.toolCall.status ?? ("completed" as const) } }
          : s,
      ),
    };
  }
  return {
    role: msg.role,
    segments: toSegments(raw.content ?? "", raw.toolCalls, raw.segments),
    isStreaming: msg.isStreaming,
    error,
  };
}

export function shouldSyncMessages(
  prevConversationId: string | null,
  conversationId: string | null,
  isStreaming: boolean,
): boolean {
  if (prevConversationId === null && conversationId !== null && isStreaming) {
    return false;
  }
  return true;
}

/**
 * Determines whether streaming state should be reset on a conversation change.
 * Returns `true` when navigating between conversations (abort + reset needed),
 * `false` for creation-navigation (null → new ID that matches `createdConvId`).
 */
export function shouldResetStreamingState(
  prevConversationId: string | null,
  conversationId: string | null,
  createdConvId: string | null,
): boolean {
  if (prevConversationId === conversationId) return false;
  if (conversationId !== null && createdConvId === conversationId) return false;
  return true;
}
