## 1. Core: expose partial results from processAgentStream
- [x] 1.1 Refactor `processAgentStream` to use an `AgentStreamCollector` that accumulates `fullResponse`, `toolCalls`, and `segments` as mutable state accessible to callers
- [x] 1.2 On error, callers read accumulated state from the collector and append an error text segment
- [x] 1.3 Add unit tests for partial-result collection when the event iterator throws mid-stream

## 2. API: preserve partial content on error
- [x] 2.1 In `agent.ts` in-process error handler, read partial `result` from the collector instead of falling back to the generic string; append error segment
- [x] 2.2 In `playground.ts` error handler, apply the same pattern
- [x] 2.3 Persist the partial content + error segment to MongoDB (existing `conv.messages.push` already handles segments)

## 3. Worker: persist partial content on error
- [x] 3.1 In `processor.ts`, capture partial streamed content from the collector before the catch block
- [x] 3.2 Call `saveAssistantMessage` with partial `fullResponse`, `toolCalls`, and `segments` (with error segment appended) instead of the generic error string

## 4. Frontend: render error state visually
- [x] 4.1 Add an `error` field to the `ChatMessage` interface and the MongoDB conversation schema to distinguish errored assistant messages from completed ones
- [x] 4.2 Populate `error` from the SSE `error` event and from persisted messages
- [x] 4.3 Render a visual error banner (red/destructive tint, alert icon) below the partial content when `error` is set — partial text and tool calls remain fully visible above it
- [x] 4.4 The error banner displays the specific error message (e.g. "recursion limit exceeded"), not a generic sentence
