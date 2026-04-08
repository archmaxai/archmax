# Change: Add testing suite for semantic model validation

## Why
There is no way to verify that semantic models work correctly from the perspective of an external AI agent. Users build models and manually test them, but there is no structured way to define repeatable test cases, run them in batch against the current development state, or interactively test with a configurable LLM. A testing suite closes this gap by providing test agents (configurable LLM endpoints), an interactive playground, and automated test case execution with expected-fact validation.

## What Changes
- Add a **Test Agents** management page where users define reusable LLM configurations (base URL, API key, model, system prompt) scoped to specific semantic models
- Add a **Playground** chat interface that reuses the existing chat components (agent-chat, tool-call-card, markdown rendering) but connects to a user-selected test agent with MCP-style tools (list models, get overview, get fields, execute query) instead of filesystem tools
- Add a **Test Cases** management page for defining input/expected-fact pairs tied to semantic models, with batch execution via the BullMQ worker queue and LLM-based fact evaluation
- Add a collapsible **Testing** group in the sidebar navigation with three sub-items: Test Agents, Test Cases, Playground
- Add new Mongoose models: `TestAgent`, `TestCase`, `TestRun`
- Add new API routes for test agent CRUD, test case CRUD, playground chat, and batch run management
- Add new frontend routes under `/$projectId/testing/`

## Impact
- Affected specs: frontend-shell (sidebar nav modification), new testing-suite capability
- Affected code:
  - `packages/core/src/models/` — new TestAgent, TestCase, TestRun models
  - `packages/core/src/infra/crypto.ts` — reuse for API key encryption
  - `apps/api/src/routes/` — new test-agents, test-cases, playground routes
  - `apps/worker/` — new `test-runs` queue processor
  - `apps/frontend/src/routes/_auth/$projectId/testing/` — new route tree
  - `apps/frontend/src/components/chat/` — reuse existing chat components
  - `packages/core/src/services/` — extract MCP tools into reusable functions for playground/test runner
