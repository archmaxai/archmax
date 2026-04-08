# Change: Persist tool calls in conversation history

## Why
Tool calls are only visible during live SSE streaming. Once the stream ends and the user reloads or revisits a conversation, only the assistant's text content is shown — all tool call information (what the agent did, arguments, results) is lost. This makes past conversations hard to review and debug.

## What Changes
- **Extend `IMessage.toolCalls` schema**: Add `result` (string) and `status` ("completed" | "error") fields to the existing `toolCalls` subdocument in the Conversation model, so tool outcomes are captured alongside their invocations
- **Collect tool calls during streaming**: Both the in-process agent path (`agent.ts`) and the worker path (`processor.ts`) SHALL accumulate tool call records (id, name, args, result, status) during the stream event loop and include them when saving the assistant message
- **Frontend hydration**: The existing `toSegments()` function already converts persisted `toolCalls` into renderable segments; with the schema extension, loaded conversations will display tool call cards identical to those shown during live streaming

## Impact
- Affected specs: `semantic-model-agent` (Conversation Persistence, Agent Conversation Streaming)
- Affected code:
  - `packages/core/src/models/Conversation.ts` — add `result` and `status` to `toolCalls` subdocument schema and interface
  - `apps/api/src/routes/agent.ts` — collect tool calls in the in-process streaming loop, include them in `conv.messages.push()`
  - `apps/worker/src/processor.ts` — collect tool calls in the worker streaming loop, include them in `saveAssistantMessage()`
  - `apps/frontend/src/lib/chat-types.ts` — `toSegments()` already handles `toolCalls`; minor update to map `result`/`status` from persisted data
