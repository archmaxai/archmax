# Change: Add true SSE streaming for agent chat with transparent tool activity

## Why
The agent chat endpoint currently calls `agent.invoke()` (non-streaming) and sends the full response as a single SSE event after the entire LLM loop completes. This means the user sees a spinner for seconds or minutes with no feedback, then the entire response appears at once. Tool executions (filesystem ops, SQL queries) are invisible during processing. Switching to LangGraph's `.stream()` API enables token-by-token text delivery and real-time visibility into every agent step.

## What Changes
- **API**: Replace `agent.invoke()` with `agent.stream()` using LangGraph's `messages` + `updates` stream modes, emitting SSE events as each token/step arrives
- **API**: Define a structured SSE event protocol with distinct event types: `token` (incremental text), `tool_call_start` (tool invoked), `tool_call_end` (tool result), `step` (agent activity like planning/subagent), `conversation`, `error`, `done`
- **API**: Persist the full assembled response to MongoDB only after the stream completes (unchanged behavior, just deferred assembly)
- **Frontend**: Update `AgentChat` to append tokens incrementally instead of replacing full content
- **Frontend**: Render tool call lifecycle as collapsible cards showing tool name, arguments, running/completed status, and result summary
- **Frontend**: Show agent activity indicators (e.g. "Thinking...", "Planning...", "Running subagent...") as they happen
- **Frontend**: Render assistant messages as markdown (basic: headings, lists, code blocks, bold/italic)

## Impact
- Affected specs: `semantic-model-agent` (Agent Conversation Streaming, Chat Interface)
- Affected code:
  - `apps/api/src/routes/agent.ts` — stream loop rewrite
  - `apps/api/src/services/agent.ts` — no changes (agent creation unchanged)
  - `apps/frontend/src/components/chat/agent-chat.tsx` — SSE handler + message rendering overhaul
  - `apps/frontend/src/lib/chat-types.ts` — extended message types for tool calls and activity
