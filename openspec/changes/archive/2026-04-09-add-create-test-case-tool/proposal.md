# Change: Add create_test_case tool to the semantic model agent

## Why
After building a semantic model, the agent has deep knowledge of the data — schemas, relationships, enums, and validated queries. It is uniquely positioned to generate meaningful test cases (natural-language questions with expected factual answers). Today test cases must be created manually through the UI, which is tedious and error-prone. Giving the agent a `create_test_case` tool lets it produce a starter test suite automatically, tagged "auto-generated" so users can distinguish them from hand-crafted cases.

## What Changes
- Add a `create_test_case` LangChain tool to the semantic model agent that creates a `TestCase` document in MongoDB with the "auto-generated" tag prepended automatically
- Make `testAgent` optional on the `TestCase` model — auto-generated cases are created without an assigned test agent; users assign one later before running a batch
- Update the test-cases CRUD API to accept optional `testAgentId` on creation
- Update the semantic model agent system prompt to document the new tool and suggest using it after completing a model

## Impact
- Affected specs: `semantic-model-agent`, `testing-suite`
- Affected code:
  - `packages/core/src/services/agent-tools.ts` — new `makeCreateTestCaseTool()` factory
  - `packages/core/src/services/agent.ts` — register the tool with the deep agent
  - `packages/core/src/models/TestCase.ts` — make `testAgent` optional
  - `apps/api/src/routes/test-cases.ts` — allow optional `testAgentId`
  - `packages/core/prompts/semantic-model-agent.md` — document the tool
