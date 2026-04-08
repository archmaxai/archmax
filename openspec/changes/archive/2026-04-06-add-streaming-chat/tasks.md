## 1. Backend: Streaming agent endpoint

- [ ] 1.1 Verify `deepagents` `.stream()` API works with `streamMode: ["messages", "updates"]` — write a throwaway test that creates an agent and logs chunks
- [ ] 1.2 Rewrite `apps/api/src/routes/agent.ts` to use `.stream()` instead of `.invoke()`, iterating over chunks and emitting SSE events per the protocol in `design.md`
- [ ] 1.3 Implement tool call accumulation: collect `tool_call_chunk` fragments from `messages` mode, emit `tool_call_start` when complete, emit `tool_call_end` from `updates` tool step
- [ ] 1.4 Accumulate full response text from `token` events and persist to MongoDB conversation after stream ends (same as current behavior, just assembled from tokens)
- [ ] 1.5 Emit `step` events for agent planning/thinking activity when detectable from `updates` chunks

## 2. Frontend: Chat types and SSE handler

- [ ] 2.1 Extend `ChatMessage` and add `ToolCallInfo` type in `apps/frontend/src/lib/chat-types.ts`
- [ ] 2.2 Update SSE event handler in `AgentChat` to handle `token`, `tool_call_start`, `tool_call_end`, `step` events
- [ ] 2.3 Implement token batching (requestAnimationFrame or 16ms debounce) to prevent excessive re-renders during fast token delivery

## 3. Frontend: Message rendering

- [ ] 3.1 Add `react-markdown` and `remark-gfm` dependencies to `apps/frontend/package.json`
- [ ] 3.2 Create a `MarkdownContent` component that renders assistant message text as markdown with syntax-highlighted code blocks
- [ ] 3.3 Create a `ToolCallCard` component — collapsible card showing tool name, truncated args, running/completed status badge, and result preview
- [ ] 3.4 Update `AgentChat` message rendering to use `MarkdownContent` for assistant messages and render `ToolCallCard` for each tool call
- [ ] 3.5 Add agent activity indicator (e.g. "Thinking...", "Running executeQuery...") shown below the last message while streaming

## 4. Testing and validation

- [ ] 4.1 Update `apps/frontend/src/components/chat/agent-chat.test.ts` to cover new SSE event types
- [ ] 4.2 Manual end-to-end test: send a message, verify tokens stream incrementally, tool calls appear with start/end lifecycle, markdown renders correctly
