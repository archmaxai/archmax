# Change: Improve tool call visualizations with syntax highlighting, todo lists, and streaming indicator

## Why
Tool call cards currently show raw JSON for args and results, making it hard to read SQL queries and todo plans. The agent also lacks a visible streaming progress indicator — the user sees nothing between tool call completions, making it unclear whether the agent is still working.

## What Changes
- **SQL syntax highlighting**: The `executeQuery` expanded card SHALL display the SQL query with syntax highlighting via `shiki` instead of a plain `<pre>` block, improving readability for complex queries
- **Todo list visualization**: A specialized renderer for the `write_todos` tool (deep agent planning) SHALL display a formatted checklist with status icons (completed/pending/in-progress) instead of raw JSON
- **Streaming progress bar**: A glowing animated bar (inspired by archmax_chat `StreamingDot`) SHALL appear below the assistant message while the agent is streaming, replacing the current spinner. It provides continuous visual feedback that the agent is working, even during long tool executions

## Impact
- Affected specs: `semantic-model-agent` (Chat Interface requirement — three new scenarios)
- Affected code:
  - `apps/frontend/src/components/chat/tool-call-card.tsx` — add `ExecuteQueryContent` SQL highlighting, new `WriteTodosContent` renderer, add `write_todos` to `TOOL_META`
  - `apps/frontend/src/components/chat/agent-chat.tsx` — replace spinner with streaming progress bar component
  - `apps/frontend/src/components/chat/streaming-bar.tsx` (new) — CSS-animated streaming progress indicator
  - `apps/frontend/src/globals.css` — CSS custom properties and keyframes for streaming bar animation
  - `apps/frontend/package.json` — add `shiki` dependency
- Depends on: `update-chat-tool-rendering` (13/18 tasks done; this change builds on its tool card infrastructure)
