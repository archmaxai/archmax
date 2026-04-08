# Change: Add example prompts to chat empty state

## Why
When the chat is empty, users see only a generic description and no clear call to action. Providing clickable example prompts (matching the archmax_chat pattern) guides new users toward high-value interactions and reduces the blank-canvas problem.

## What Changes
- Add 4 hardcoded example prompts to the `AgentChat` empty state, rendered as a responsive 2-column grid of ghost buttons with an arrow prefix
- Clicking a prompt prefills the chat input and focuses it (does **not** auto-send)
- Prompts cover the core agent workflows: schema exploration, model creation, model updates, and relationship/metric work

## Impact
- Affected specs: `semantic-model-agent`
- Affected code: `apps/frontend/src/components/chat/agent-chat.tsx`, `apps/frontend/src/components/chat/chat-input.tsx`
