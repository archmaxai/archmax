## 1. Model & API
- [x] 1.1 Make `testAgent` optional on `TestCase` schema (`required: false`) and update `ITestCase` interface
- [x] 1.2 Update `test-cases` POST route to accept optional `testAgentId`; skip agent existence check when omitted
- [x] 1.3 Update `test-cases` create Zod schema to make `testAgentId` optional

## 2. Agent Tool
- [x] 2.1 Add `makeCreateTestCaseTool(projectId)` in `agent-tools.ts` — accepts title, semanticModel, inputMessage, expectedFacts; auto-prepends "auto-generated" tag; creates TestCase via Mongoose
- [x] 2.2 Register `create_test_case` tool in `createSemlayerAgent()` alongside existing tools

## 3. Agent Prompt
- [x] 3.1 Add `create_test_case` to the "Your Tools" section of `semantic-model-agent.md`
- [x] 3.2 Add a brief workflow step suggesting test case generation after completing validated queries

## 4. Validation
- [x] 4.1 Verify existing test-run creation still rejects cases without an assigned test agent (already guarded in `test-runs.ts`)
- [x] 4.2 Verify the "auto-generated" tag is normalized to lowercase and appears in the tags array
