## 1. Abort stream and reset state on conversation change

- [x] 1.1 In `AgentChat` (`agent-chat.tsx`), add an effect keyed on `conversationId` that aborts `abortRef.current` and resets `isStreaming` to `false` when the conversation changes
- [x] 1.2 Ensure the abort triggers cleanup in both the `sendMessage` async flow and the subscribe-effect flow (both use `abortRef`)
- [x] 1.3 Reset `uploadedFiles` and `input` state when conversation changes to avoid stale drafts leaking across conversations

## 2. Update shouldSyncMessages for streaming transitions

- [x] 2.1 Review `shouldSyncMessages` in `chat-types.ts` — the `null → conversationId` guard while streaming is still needed for creation-navigation; no simplification required
- [x] 2.2 Update or add unit tests in `agent-chat.test.ts` for the conversation-switch-while-streaming case

## 3. Tests

- [x] 3.1 Add unit test: navigating from a streaming conversation to "new" results in `isStreaming === false` and an enabled input
- [x] 3.2 Add unit test: navigating from a streaming conversation to another existing conversation results in correct streaming state for the target conversation
- [x] 3.3 Add unit test: returning to a still-streaming conversation re-subscribes via the `activeStreamConversationId` effect
