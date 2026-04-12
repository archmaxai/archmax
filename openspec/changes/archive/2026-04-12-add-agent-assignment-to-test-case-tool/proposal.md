# Change: Add test case management tools to the semantic model builder

## Why
The semantic model builder agent can create test cases via `create_test_case`, but they are always created without an assigned test agent and the agent has no visibility into existing test coverage. Users must navigate to the Testing UI to assign agents, review cases, or clean up duplicates. By giving the builder full test case management tools, the build-then-test workflow becomes seamless: the agent can check what already exists, assign agents during creation so cases are immediately runnable, and remove outdated cases when a model changes.

## What Changes
- **New `list_test_agents` tool**: Lists all non-deleted test agents for the current project (id, name, semantic models, LLM model). Lets the agent know which agents are available before creating test cases.
- **New `list_test_cases` tool**: Lists existing test cases for the project with an optional `semanticModel` filter. Returns title, semantic model, input message, expected facts count, tags, and assigned agent. Lets the agent review existing coverage and avoid duplicates.
- **New `delete_test_case` tool**: Soft-deletes a test case by ID after validating project ownership. Lets the agent remove outdated or duplicate test cases.
- **Modified `create_test_case` tool**: Added an optional `testAgentId` parameter. When provided, validates the agent exists in the project and assigns it, making test cases immediately eligible for batch runs.
- **Updated system prompt**: Instructs the agent to call `list_test_cases` to check existing coverage, then `list_test_agents` to find available agents, and offer to assign one when creating test cases.

## Impact
- Affected specs: `semantic-model-agent` (3 new tools + 1 modified tool), `testing-suite` (test case creation with agent)
- Affected code:
  - `packages/core/src/services/agent-tools.ts` (new `makeListTestAgentsTool`, `makeListTestCasesTool`, `makeDeleteTestCaseTool`; modified `makeCreateTestCaseTool`)
  - `packages/core/src/services/agent.ts` (register new tools)
  - `packages/core/prompts/semantic-model-agent.md` (document new tools, update workflow)
