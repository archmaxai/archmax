# Change: Fix chat streaming state isolation across conversations

## Why
When a user opens a new chat (or navigates to a different conversation) while an existing conversation is streaming, the chat input remains disabled with the "stop" button visible. This prevents parallel usage of multiple chats because the streaming UI state is tied to the `AgentChat` component instance rather than scoped to a specific conversation.

## What Changes
- The `AgentChat` component SHALL abort any in-flight stream and reset `isStreaming` when the active conversation changes
- The models chat route SHALL properly isolate component state per conversation, matching the pattern already used by the playground route
- Add spec requirement for conversation-scoped streaming state isolation

## Impact
- Affected specs: `semantic-model-agent` (Chat Interface, Agent Conversation Streaming)
- Affected code:
  - `apps/frontend/src/routes/_auth/$projectId/models/chat/$conversationId.tsx` — models chat route
  - `apps/frontend/src/components/chat/agent-chat.tsx` — `AgentChat` component streaming state
  - `apps/frontend/src/lib/chat-types.ts` — `shouldSyncMessages` helper
  - `apps/frontend/src/components/chat/agent-chat.test.ts` — unit tests
