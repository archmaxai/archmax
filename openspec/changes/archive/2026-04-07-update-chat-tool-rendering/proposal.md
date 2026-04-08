# Change: Improve chat tool call rendering and conversation history UX

## Why
The agent chat currently groups all tool calls at the top of each assistant message, far from the text that references them. Every tool uses the same generic card (raw JSON args/result), making it hard to understand what the agent did. Additionally, new conversations don't appear in the sidebar until the assistant finishes responding, because the MongoDB document is only saved after the stream completes.

## What Changes
- **Inline tool calls**: Restructure the assistant message model to support interleaved content segments (text chunks and tool calls mixed in the order they occurred), so tool calls appear in-line with the surrounding text rather than grouped at the top
- **Per-tool visualizations**: Render each tool type with a specialized card — `executeQuery` shows SQL in a code block and results as a table; filesystem tools (`ls`, `read_file`, `write_file`, `find`) show file paths, content previews, or diffs as appropriate
- **Compact expandable cards**: Redesign tool call cards to be compact by default (single line: icon + tool label + status), expandable on click to show full args and results, with a smooth animation; active (running) cards show a subtle pulse/spinner inline
- **Immediate history entries**: Save the conversation document to MongoDB before starting the SSE stream (after creating the document and pushing the user message), so the sidebar list shows the new conversation as soon as the user sends their first message

## Impact
- Affected specs: `semantic-model-agent` (Chat Interface, Agent Conversation Streaming, Conversation Persistence)
- Affected code:
  - `apps/frontend/src/lib/chat-types.ts` — new `ContentSegment` union type for interleaved rendering
  - `apps/frontend/src/components/chat/agent-chat.tsx` — message rendering rewrite, SSE handler changes to build interleaved segments
  - `apps/frontend/src/components/chat/tool-call-card.tsx` (new) — per-tool renderers
  - `apps/api/src/routes/agent.ts` — move `conv.save()` before stream start for new conversations
