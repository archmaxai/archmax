## 1. Backend: Early conversation save

- [x] 1.1 Move `await conv.save()` before `streamSSE()` for new conversations in `apps/api/src/routes/agent.ts`, so the document exists in MongoDB when the `conversation` SSE event fires
- [x] 1.2 After stream completes, update the existing document with the assistant message (use `conv.save()` as before — Mongoose tracks dirty fields)

## 2. Frontend: Interleaved content model

- [x] 2.1 Add `ContentSegment` union type and update `ChatMessage` in `apps/frontend/src/lib/chat-types.ts` to use `segments: ContentSegment[]` alongside the legacy `content`/`toolCalls` fields
- [x] 2.2 Add a `toLegacyContent(segments)` and `toSegments(content, toolCalls)` conversion utility for backward compatibility with persisted messages
- [x] 2.3 Update the SSE event handler in `AgentChat` to build interleaved segments: `token` → append to last text segment or create new one; `tool_call_start` → append tool_call segment; `tool_call_end` → update matching segment

## 3. Frontend: Per-tool renderers

- [x] 3.1 Create `apps/frontend/src/components/chat/tool-call-card.tsx` with a `ToolCallCard` component that dispatches to per-tool renderers based on tool name
- [x] 3.2 Implement `ExecuteQueryCard` — collapsed: "Queried database" + row count; expanded: SQL code block + result table
- [x] 3.3 Implement `FileToolCard` — covers `ls`, `read_file`, `write_file`, `find` with appropriate collapsed labels and expanded content (file lists, content previews)
- [x] 3.4 Implement `DefaultToolCard` — fallback showing tool name badge, raw args/result JSON (current behavior)
- [x] 3.5 Add compact expandable layout: single-row collapsed state with icon + label + status + chevron, smooth CSS grid expand animation

## 4. Frontend: Message rendering update

- [x] 4.1 Update `AgentChat` message rendering to iterate over `segments[]` and render `text` segments via `MarkdownContent` and `tool_call` segments via `ToolCallCard`, preserving temporal order
- [x] 4.2 Handle loading persisted conversations by converting flat `content`/`toolCalls` into segments via `toSegments()`
- [x] 4.3 Show history items in sidebar as soon as user sends first message — verify `conversation` SSE event triggers sidebar refresh now that the document is pre-saved

## 5. Testing and validation

- [ ] 5.1 Manual test: send a message, verify the new conversation appears in the sidebar immediately (before the assistant responds)
- [ ] 5.2 Manual test: verify tool calls appear inline between text segments during streaming
- [ ] 5.3 Manual test: verify `executeQuery` shows SQL + table, filesystem tools show appropriate previews
- [ ] 5.4 Manual test: verify expanding/collapsing tool cards is smooth and works during streaming
- [ ] 5.5 Verify loading an existing conversation from history renders correctly (legacy format conversion)
