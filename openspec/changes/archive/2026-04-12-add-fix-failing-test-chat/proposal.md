# Change: Add "Fix in Chat" button to failing test cases

## Why
When a test case fails, the user has no direct way to act on the failure. They must manually copy the test context, navigate to the Semantic Model Builder chat, and paste it as a prompt. A one-click "Fix in Chat" button on failing test cases would streamline the correction workflow by opening a new chat with a pre-composed prompt that includes the failure context.

## What Changes
- **Test Run Detail Page**: Add two action buttons to each expanded test case result that has a `failed` or `error` status:
  - **Fix in Chat** (message-circle icon): navigates to the Semantic Model Builder chat with a prefill prompt containing the semantic model name, the original input message, the expected facts (highlighting which failed and why), and a summary of the agent's response, so the builder agent has full context to diagnose and fix the model.
  - **Refine** (wand icon): navigates to the same chat with a different prefill prompt focused on model efficiency -- improving ai_context descriptions, simplifying naming, adding missing relationships, or reorganizing structure so the agent can answer with fewer tool calls.
- Both buttons navigate to `/$projectId/models/chat/new` with a `prefill` query parameter.
- No backend changes required. The existing `prefill` mechanism (already used by the Improvement Requests workflow) handles everything.

## Impact
- Affected specs: `testing-suite` (Test Run Detail Page requirement)
- Affected code:
  - `apps/frontend/src/routes/_auth/$projectId/testing/runs/$runId.tsx` (add button + prompt builder)
