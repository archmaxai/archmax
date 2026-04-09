## Context

The current error handling flow discards streamed content in three places:

1. **In-process path** (`agent.ts:157-159`): `result = result ?? { fullResponse: "The agent encountered an error...", toolCalls: [], segments: [] }` — since `processAgentStream` only returns on success, `result` is always `undefined` on throw, so the generic fallback always wins.

2. **Worker path** (`processor.ts:226-228`): `saveAssistantMessage(conversationId, "The agent encountered an error...")` — called with only the generic string, no toolCalls or segments.

3. **Frontend refetch** (`agent-chat.tsx:130-136`): After streaming ends, TanStack Query refetches the conversation and `initialMessages` sync replaces the local messages with what the server persisted — the generic text.

The frontend SSE `error` handler already appends `"\n\n**Error:** ..."` to segments (line 382-388), which is correct for the live streaming session. But once the user navigates away and back, or the refetch triggers, the persisted generic message overwrites the streamed state.

## Goals / Non-Goals

- **Goal**: Preserve all partial content (text, tool calls, segments) when an agent errors, so users see what was accomplished before the failure.
- **Goal**: Display a clear visual error indicator below the partial content.
- **Goal**: Persist the error state so it survives page reloads and conversation re-opens.
- **Non-Goal**: Retry or resume failed agent runs (separate concern).
- **Non-Goal**: Change the error handling for user-initiated cancellations (already preserves partial content correctly).

## Decisions

### AgentStreamCollector pattern

Rather than wrapping `processAgentStream` in a try/catch and losing the return value, we introduce a collector object that accumulates state as a side-effect during iteration. The caller creates the collector, passes it in, and can read partial state even after an error:

```typescript
const collector = createStreamCollector();
try {
  result = await processAgentStream(events, emit, collector);
} catch (err) {
  result = collector.getPartialResult();
  result.segments.push({ type: "text", content: `\n\n**Error:** ${err.message}` });
  result.fullResponse += `\n\n**Error:** ${err.message}`;
}
```

**Alternative considered**: Wrapping the entire iterator in a try/catch inside `processAgentStream` and returning partial results — rejected because it would suppress errors from the caller, making it harder to emit the SSE `error` event and handle logging.

### Error field on messages

Add an optional `error` string field to the conversation message schema. When set, the frontend renders an error banner. This is more reliable than parsing the last text segment for `**Error:**` patterns.

### Frontend rendering

The error banner is a small `bg-destructive/10 text-destructive` box with an `AlertCircle` icon, placed as the final element in the message bubble. All preceding content (text segments, tool call cards) renders normally. This matches the user's expectation: "still the content is shown, with an error message below."

## Risks / Trade-offs

- **Schema migration**: Adding `error` to existing messages is additive (optional field), no migration needed for existing conversations.
- **Partial content may be misleading**: Users might act on incomplete tool results. Mitigated by the clear error banner.
