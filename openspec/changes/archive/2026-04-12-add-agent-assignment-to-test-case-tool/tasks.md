## 1. Backend: New list_test_agents tool
- [x] 1.1 Add `makeListTestAgentsTool(projectId)` in `packages/core/src/services/agent-tools.ts` that queries non-deleted TestAgent documents and returns `id`, `name`, `semanticModels`, `llmModel`
- [x] 1.2 Register the tool in `createSemlayerAgent()` in `packages/core/src/services/agent.ts`

## 2. Backend: New list_test_cases tool
- [x] 2.1 Add `makeListTestCasesTool(projectId)` in `packages/core/src/services/agent-tools.ts` that queries non-deleted TestCase documents with optional `semanticModel` filter
- [x] 2.2 Register the tool in `createSemlayerAgent()` in `packages/core/src/services/agent.ts`

## 3. Backend: New delete_test_case tool
- [x] 3.1 Add `makeDeleteTestCaseTool(projectId)` in `packages/core/src/services/agent-tools.ts` that soft-deletes a test case by ID after validating project ownership
- [x] 3.2 Register the tool in `createSemlayerAgent()` in `packages/core/src/services/agent.ts`

## 4. Backend: Extend create_test_case tool
- [x] 4.1 Add optional `testAgentId` parameter to `makeCreateTestCaseTool` schema in `packages/core/src/services/agent-tools.ts`
- [x] 4.2 When `testAgentId` is provided, validate agent exists and belongs to the project before creating the test case
- [x] 4.3 Set `testAgent` on the created TestCase when a valid `testAgentId` is provided

## 5. System prompt update
- [x] 5.1 Add `list_test_agents`, `list_test_cases`, and `delete_test_case` to the "Your Tools" section in `packages/core/prompts/semantic-model-agent.md`
- [x] 5.2 Update the "Create Test Cases" workflow section to instruct the agent to call `list_test_cases` to check existing coverage, then `list_test_agents` to find agents, and assign the selected agent

## 6. Verification
- [x] 6.1 Run `pnpm typecheck` and `pnpm lint` to confirm no type or lint errors
- [x] 6.2 Run existing unit tests in `packages/core` to confirm no regressions
