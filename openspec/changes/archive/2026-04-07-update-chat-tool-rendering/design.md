## Context

The agent chat renders assistant messages as a flat structure: all `ToolCallInfo[]` entries grouped before the `content` string. In reality, the agent interleaves text and tool usage — it might write a sentence, call a tool, write more text, call another tool, etc. The current model collapses this into two separate buckets, losing the conversation flow.

The backend already emits `token`, `tool_call_start`, and `tool_call_end` SSE events in temporal order, so the frontend has the information to reconstruct the interleaved flow — it just doesn't model it that way.

Additionally, the conversation document is only saved to MongoDB after the stream completes (`conv.save()` at the end), so the sidebar can't find the conversation during streaming.

## Goals / Non-Goals

- **Goals:**
  - Interleave tool call cards with text segments in the order they occur during streaming
  - Provide per-tool-type rendering: SQL code block + table for `executeQuery`, file list for `ls`, content preview for `read_file`/`write_file`
  - Compact default state for tool cards (single row), expandable to full detail
  - Show new conversations in the sidebar immediately when the user sends the first message
  - Smooth animation for expand/collapse and running state

- **Non-Goals:**
  - Syntax highlighting for code blocks inside tool results (existing markdown renderer handles agent text)
  - Editing or re-running tool calls from the UI
  - Changing the SSE event protocol (backend events remain the same)
  - Persisting tool call details in conversation messages (they remain `role + content` only)

## Decisions

### Interleaved Content Model

Replace the flat `content: string` + `toolCalls: ToolCallInfo[]` with an ordered array of content segments:

```ts
type ContentSegment =
  | { type: "text"; content: string }
  | { type: "tool_call"; toolCall: ToolCallInfo };

interface ChatMessage {
  role: "user" | "assistant";
  segments: ContentSegment[];
  isStreaming?: boolean;
}
```

During SSE streaming:
- `token` events append to the last `text` segment (or create a new one if the last segment is a `tool_call`)
- `tool_call_start` appends a new `tool_call` segment
- `tool_call_end` updates the matching `tool_call` segment's status and result
- Subsequent `token` events after a `tool_call` create a new `text` segment

For backward compatibility with persisted conversations (which store flat `content` strings), the component accepts both the legacy flat format and the new segmented format. When loading from MongoDB, messages are converted to a single `text` segment.

### Per-Tool Renderers

Map tool names to specialized renderers:

| Tool | Collapsed Label | Expanded Content |
|------|----------------|-----------------|
| `executeQuery` | "Queried database" + row count badge | SQL code block (from args), result table (parsed from JSON result) |
| `ls` | "Listed files" + file count badge | File list with icons |
| `read_file` | "Read `<filename>`" | File content preview (first 20 lines, monospace) |
| `write_file` | "Wrote `<filename>`" | Content preview or "written N lines" summary |
| `find` | "Searched files" + match count | List of matching paths |
| (default) | Tool name badge | Raw args/result JSON (current behavior as fallback) |

Tool names from `deepagents` `FilesystemBackend` are: `ls`, `read_file`, `write_file`, `find`. The custom tool is `executeQuery`.

### Compact Expandable Cards

Default state: single row with:
- Left: tool-specific icon (Database for executeQuery, Folder for ls, FileText for read/write, Search for find)
- Center: human-readable label (e.g., "Queried database", "Read orders.yaml")
- Right: status indicator (spinner when running, checkmark when completed, X when error) + chevron

Expanded state: slides open below the header row to show full args and result in the tool-specific format. Use CSS `grid-template-rows: 0fr → 1fr` transition for smooth expand.

### Immediate Conversation Persistence

Move `await conv.save()` to before `streamSSE()` for new conversations. This ensures:
1. The conversation exists in MongoDB when the `conversation` SSE event fires
2. The sidebar query finds the conversation immediately after invalidation
3. The assistant message is appended and saved again after the stream completes (as before)

This adds one extra MongoDB write for new conversations, which is acceptable for a single-user system.

### Alternatives Considered

1. **Virtual segments via post-processing** — Parse the flat `content` string looking for tool call markers to reconstruct ordering. Fragile and requires marker conventions.
2. **Separate tool call timeline** — Show tool calls in a side panel or timeline. Loses the in-context reading flow.
3. **WebSocket for instant sidebar update** — Would avoid the early-save approach. Overkill for a single-user system; one extra MongoDB write is simpler.

## Risks / Trade-offs

- **Migration of existing messages**: Persisted conversations use flat `content + toolCalls` format. The component must handle both formats gracefully. Converting to segments on load is straightforward.
- **Segment accumulation during streaming**: The `updateLastAssistant` pattern needs to operate on `segments[]` instead of flat fields. Slightly more complex state updates, but the logic is well-contained.
- **Tool name detection**: Filesystem tool names from `deepagents` may change between versions. Fallback to the generic renderer ensures nothing breaks if tool names change.

## Open Questions

- Should `executeQuery` results render as a full interactive table (sortable, scrollable) or a static preview? Starting with a static preview table; interactive features can be added later.
