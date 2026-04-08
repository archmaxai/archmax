## Context

The backend uses `deepagents` (LangChain Deep Agents SDK for JS/TS, built on LangGraph). The current agent endpoint in `apps/api/src/routes/agent.ts` calls `agent.invoke()` which blocks until the full response is available, then sends everything via Hono's `streamSSE`. The frontend already has SSE parsing infrastructure in `AgentChat`, but receives one bulk `text` event.

LangGraph agents expose a `.stream()` method supporting multiple stream modes (`messages`, `updates`, `custom`) that yield chunks as the agent executes. The `messages` mode yields `(token, metadata)` tuples with individual LLM tokens and tool call chunks. The `updates` mode yields state deltas after each graph step (model, tools).

## Goals / Non-Goals

- **Goals:**
  - Token-by-token text streaming to the frontend via SSE
  - Real-time tool call visibility (name, args, status, result summary)
  - Agent activity indicators for non-tool steps (thinking, planning, subagent)
  - Clean SSE event protocol that supports future extensibility
  - Markdown rendering for assistant messages

- **Non-Goals:**
  - Cancellation / abort (future work — stop button currently fakes it)
  - Persisting tool call details in conversation history (messages remain role + content only)
  - Full rich tool result rendering (e.g. rendering SQL tables inline)

## Decisions

### SSE Event Protocol

Use distinct event types rather than a single `message` event with a type field, because Hono's `streamSSE` maps cleanly to SSE `event:` lines and the frontend `EventSource`/fetch reader can branch on `event` directly.

| SSE Event | Payload | When |
|---|---|---|
| `conversation` | `{ conversationId }` | Once, after conversation document is created/found |
| `token` | `{ content }` | Each LLM text token (from `messages` stream mode) |
| `tool_call_start` | `{ id, name, args }` | When LLM emits a complete tool call request |
| `tool_call_end` | `{ id, name, result }` | After tool execution completes (result truncated to 500 chars) |
| `step` | `{ type, detail }` | Agent activity — `type` is one of `thinking`, `planning`, `subagent`; `detail` is optional description |
| `error` | `{ error }` | On error (stream continues if recoverable) |
| `done` | `{}` | Stream complete, frontend can finalize |

The `token` event replaces the current `text` event. Tool calls get a start/end lifecycle instead of a single `tool_call` event.

### Streaming Implementation

Use `agent.stream({ messages }, { streamMode: ["messages", "updates"] })`. Process each chunk:

- `messages` chunks with `content_blocks` of type `text` → emit `token` SSE events
- `messages` chunks with `content_blocks` of type `tool_call_chunk` → accumulate; when a tool call is complete, emit `tool_call_start`
- `updates` chunks from the `tools` step → emit `tool_call_end` with truncated result
- `updates` chunks from special nodes (planner, subagent spawner) → emit `step` events

Accumulate the full response text from tokens to persist in MongoDB after the stream ends.

### Frontend Message Model

Extend `ChatMessage` to support richer rendering:

```ts
interface ToolCallInfo {
  id: string;
  name: string;
  args: string;
  status: "running" | "completed" | "error";
  result?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallInfo[];
  isStreaming?: boolean;
}
```

### Markdown Rendering

Use `react-markdown` with `remark-gfm` for GFM support (tables, strikethrough, task lists). Code blocks get syntax highlighting via a lightweight highlighter. This is a common pattern for chat UIs and adds minimal bundle size (~15KB gzipped).

### Alternatives Considered

1. **WebSocket instead of SSE** — More complex setup (upgrade handling, reconnection logic), no benefit for unidirectional streaming. SSE over fetch is simpler and already implemented.
2. **Single `message` event with `type` field** — Less ergonomic for SSE parsing; distinct event names are idiomatic SSE and let the browser's `EventSource` API filter natively.
3. **Vercel AI SDK** — Would replace the manual SSE handling with a battle-tested streaming protocol, but introduces a significant new dependency and diverges from the LangChain-native approach already in use.

## Risks / Trade-offs

- **LangGraph JS streaming API surface** — The `deepagents` JS package wraps LangGraph. The `.stream()` API should be available but the exact chunk format needs verification during implementation. Mitigation: verify with a minimal test before committing to the full rewrite.
- **Token granularity** — Very rapid token delivery may cause excessive React re-renders. Mitigation: batch token updates with `requestAnimationFrame` or a small debounce (16ms).
- **Tool call accumulation** — Tool call arguments arrive as chunks in `messages` mode. We must accumulate them into a complete tool call before emitting `tool_call_start`. This is the same pattern used by OpenAI's streaming API.

## Open Questions

- Should tool call results be rendered inline (e.g. show SQL query results as a table)? Deferred to a follow-up proposal.
- Should the stop button actually abort the agent run (AbortController on the stream)? Deferred — noted as future work.
