## 1. Schema Extension
- [x] 1.1 Add `result` (String) and `status` (String, enum: completed/error) to the `toolCalls` subdocument in `MessageSchema` (`packages/core/src/models/Conversation.ts`)
- [x] 1.2 Update `IMessage.toolCalls` TypeScript interface to include `result?: string` and `status?: "completed" | "error"`
- [x] 1.3 Add `segments` field (ordered `IContentSegment[]`) to `IMessage` interface and `MessageSchema` to preserve inline ordering

## 2. Worker Persistence (Redis path)
- [x] 2.1 Add a `textBuffer` and `orderedSegments` accumulator in `processAgentJob` (`apps/worker/src/processor.ts`)
- [x] 2.2 On `on_tool_start`, flush text buffer as a text segment, then push tool_call segment
- [x] 2.3 On `on_tool_end`, update the matching tool call entry with `result` and `status: "completed"`
- [x] 2.4 After streaming completes, flush remaining text buffer
- [x] 2.5 Extend `saveAssistantMessage` to accept and persist `toolCalls` and `segments` alongside `content`

## 3. In-Process Persistence (no-Redis path)
- [x] 3.1 Add a `textBuffer` and `orderedSegments` accumulator in the in-process streaming handler (`apps/api/src/routes/agent.ts`)
- [x] 3.2 On `on_tool_start`, flush text buffer as a text segment, then push tool_call segment
- [x] 3.3 On `on_tool_end`, update the matching tool call entry with `result` and `status: "completed"`
- [x] 3.4 After streaming completes, flush remaining text buffer
- [x] 3.5 Include `toolCalls` and `segments` in the `conv.messages.push()` call for the assistant message

## 4. Frontend Hydration
- [x] 4.1 Update `toSegments()` in `chat-types.ts` to accept and prefer persisted `segments` (ordered), falling back to flat `content` + `toolCalls` for old conversations
- [x] 4.2 Update `normalizeMessage()` to pass persisted `segments` through to `toSegments()` and default tool call statuses

## 5. Validation
- [ ] 5.1 Manual test: send a message with tool calls, reload the page, verify tool call cards appear inline with text in the correct order
- [ ] 5.2 Manual test: verify existing conversations without segments still render correctly (backward compatibility)
