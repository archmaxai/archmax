# Change: Add streaming indicator to chat history sidebar

## Why
When a chat is running in the background (e.g. the user navigated away while the agent is still streaming), the chat history sidebar gives no visual signal that the conversation is still active. Users have no way to tell which chats are in-progress versus completed without clicking into each one.

## What Changes
- The conversation list API endpoints return an `isStreaming` flag per conversation item (checked via existing Redis stream buffer)
- The chat history sidebar in both Semantic Models and Playground replaces the static `MessageSquare` icon with an animated `Loader2` spinner for conversations that are actively streaming
- Frontend types updated to include `isStreaming` on `ConversationSummary`
- Existing 10-second polling on the conversations list keeps the indicator fresh without additional infrastructure

## Impact
- Affected specs: `semantic-model-agent` (Conversation Persistence), `testing-suite` (Testing UI — Playground Page)
- Affected code:
  - `apps/api/src/routes/conversations.ts` — list endpoint adds `isStreaming` per item
  - `apps/api/src/routes/playground.ts` — playground conversation list adds `isStreaming` per item
  - `apps/frontend/src/lib/chat-types.ts` — `ConversationSummary` type
  - `apps/frontend/src/routes/_auth/$projectId/models.tsx` — sidebar icon swap
  - `apps/frontend/src/routes/_auth/$projectId/testing/playground.tsx` — sidebar icon swap
  - `packages/core/src/streaming/stream-bridge.ts` — reuses existing `isStreamActive()`
