## 1. Data Models

- [x] 1.1 Create `TestAgent` Mongoose model in `packages/core/src/models/TestAgent.ts` with soft-delete plugin, encrypted API key field, and project index
- [x] 1.2 Create `TestCase` Mongoose model in `packages/core/src/models/TestCase.ts` with soft-delete plugin and project index
- [x] 1.3 Create `TestRun` Mongoose model in `packages/core/src/models/TestRun.ts` with embedded case results array
- [x] 1.4 Add optional `testAgent` field (ObjectId ref) to existing `Conversation` model for playground conversations
- [x] 1.5 Export new models from `packages/core/src/models/index.ts`

## 2. Shared MCP Tool Extraction

- [x] 2.1 Extract `list_semantic_models`, `get_semantic_model_overview`, `get_dataset_fields`, and `execute_query` (with scoped VIEWs) logic from `apps/api/src/mcp/semlayer-server.ts` into reusable service functions in `packages/core/src/services/mcp-tools.ts`
- [x] 2.2 Refactor `semlayer-server.ts` to consume the extracted service functions (no behavior change)
- [ ] 2.3 Write unit tests for the extracted tool functions

## 3. Test Agent API

- [x] 3.1 Create `apps/api/src/routes/test-agents.ts` with GET (list), GET (single), POST (create with API key encryption), PUT (update), DELETE (soft-delete) endpoints
- [x] 3.2 Ensure API key is masked in GET responses and encrypted on write using `packages/core/src/infra/crypto.ts`
- [x] 3.3 Register route in `apps/api/src/app.ts`

## 4. Test Case API

- [x] 4.1 Create `apps/api/src/routes/test-cases.ts` with GET (list), POST (create), PUT (update), DELETE (soft-delete) endpoints
- [x] 4.2 Register route in `apps/api/src/app.ts`

## 5. Playground Agent & Chat API

- [x] 5.1 Create `packages/core/src/services/playground-agent.ts` with `createPlaygroundAgent(testAgentId)` that builds a LangChain agent using the test agent's decrypted LLM config and MCP-style tools (from step 2.1)
- [x] 5.2 Create `apps/api/src/routes/playground.ts` with POST `/chat` (SSE streaming, same protocol as agent route), GET `/conversations` (list by testAgent), supporting both worker and in-process modes
- [x] 5.3 Ensure playground tool executions do NOT create `McpCallLog` entries
- [x] 5.4 Register route in `apps/api/src/app.ts`

## 6. Test Run Batch Execution

- [x] 6.1 Create `packages/core/src/queue/test-runs.ts` with queue constants and job data types (added to existing constants.ts and types.ts)
- [x] 6.2 Create `apps/api/src/routes/test-runs.ts` with GET (list), GET (single), POST (initiate batch), DELETE endpoints
- [x] 6.3 Create test run processor in `apps/worker/src/test-processor.ts` that executes a single test case: create playground agent → send input → collect response → run LLM judge → update TestRun document
- [x] 6.4 Register `test-runs` queue worker in `apps/worker/src/index.ts` alongside existing `agent-runs` worker
- [x] 6.5 Add in-process fallback in the API route when Redis is not configured
- [x] 6.6 Register route in `apps/api/src/app.ts`

## 7. Frontend — Sidebar Navigation

- [x] 7.1 Add collapsible Testing group to the sidebar in `apps/frontend/src/components/layout/app-sidebar.tsx` with sub-items: Test Agents, Test Cases, Playground
- [x] 7.2 Implement auto-expand when active route is within `/$projectId/testing/*` (leverages existing group auto-expand logic)

## 8. Frontend — Testing Routes & Pages

- [x] 8.1 Create layout route (not needed — uses existing project layout)
- [x] 8.2 Create Test Agents page at `apps/frontend/src/routes/_auth/$projectId/testing/agents.tsx` with table + create/edit/delete dialogs
- [x] 8.3 Create Test Cases page at `apps/frontend/src/routes/_auth/$projectId/testing/cases.tsx` with table + create/edit dialogs + dynamic expected-facts list
- [x] 8.4 Create batch run initiation UI (test agent selector + run button) on the Test Cases page
- [x] 8.5 Create Test Run detail view (dialog) showing per-case pass/fail results with fact breakdowns and agent responses

## 9. Frontend — Playground

- [x] 9.1 Create Playground page at `apps/frontend/src/routes/_auth/$projectId/testing/playground.tsx` with test agent selector dropdown
- [x] 9.2 Create PlaygroundChat using reusable components from agent-chat (parseSSEChunk, normalizeMessage, appendToken, appendToolCallStart, updateToolCall, MessageSegments, ToolCallCard, ChatInput, MarkdownContent)
- [x] 9.3 Render past playground conversations in the sidebar filtered by selected test agent
- [x] 9.4 Wire SSE streaming to playground API endpoint with the same event protocol

## 10. Integration Verification

- [ ] 10.1 Verify playground chat end-to-end: create test agent → start playground conversation → agent invokes MCP tools → tool call cards render correctly
- [ ] 10.2 Verify batch test run end-to-end: create test cases → initiate batch → worker processes jobs → fact evaluation produces pass/fail → results visible in UI
- [ ] 10.3 Verify in-process fallback works when Redis is not configured
