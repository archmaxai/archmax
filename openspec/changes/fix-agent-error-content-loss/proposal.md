# Change: Preserve streamed content when agent encounters an error

## Why
When an agent errors mid-stream, the full output that was already streamed to the user is replaced with a generic "The agent encountered an error processing your request." message. Users lose all useful context — tool call results, partial analysis, SQL queries — making it impossible to understand what happened or retry effectively.

## What Changes
- API in-process error handler (`agent.ts`) preserves partial `result` (text, tool calls, segments) accumulated before the error, appending an error indicator rather than replacing everything
- Worker error handler (`processor.ts`) captures partial streamed content and persists it alongside the error, instead of saving only the generic error string
- `processAgentStream` (`agent-stream.ts`) exposes accumulated state via a collector object so callers can access partial results even when the iterator throws
- Frontend chat component renders persisted error messages with a visual error banner below the partial content, distinguishing errors from normal completions

## Impact
- Affected specs: `semantic-model-agent` (Chat Interface requirement), `agent-job-queue` (Worker handles pipeline error scenario)
- Affected code:
  - `packages/core/src/services/agent-stream.ts` — return partial results on error
  - `apps/api/src/routes/agent.ts:147-166` — use partial result instead of generic fallback
  - `apps/api/src/routes/playground.ts:147-158` — same pattern as agent.ts
  - `apps/worker/src/processor.ts:226-231` — persist partial content on error
  - `apps/frontend/src/components/chat/agent-chat.tsx:382-394` — render error state visually
  - `apps/frontend/src/lib/chat-types.ts` — add `error` field to `ChatMessage`
