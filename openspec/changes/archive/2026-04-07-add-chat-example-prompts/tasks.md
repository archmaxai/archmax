## 1. Implementation
- [x] 1.1 Add `onSelectExamplePrompt` callback prop to `ChatInput` that sets the textarea value and focuses it
- [x] 1.2 Create `ExamplePromptButton` component in `agent-chat.tsx` (ghost button, arrow prefix, rounded-xl, hover styles matching archmax_chat)
- [x] 1.3 Define the 4 example prompt strings as a constant array in `agent-chat.tsx`
- [x] 1.4 Render the example prompt grid (2-col on sm+, 1-col on mobile) in the empty state section of `AgentChat`, below the description text
- [x] 1.5 Wire clicking an example prompt to prefill the `ChatInput` value and focus it (no auto-send)
- [x] 1.6 Verify example prompts disappear once messages exist and reappear when starting a new conversation
