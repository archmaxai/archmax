## Context

The semantic layer platform currently supports building semantic models via an AI agent and exposing them via an MCP server, but lacks structured testing. Users cannot verify that their models produce correct answers from the perspective of an external AI agent. This change adds three interconnected features: test agent configuration, interactive playground, and automated test case execution.

## Goals / Non-Goals

- Goals:
  - Let users define test agents with custom LLM configs to simulate real MCP consumers
  - Provide an interactive playground that reuses the existing chat UI but with MCP-style tools
  - Enable batch test case execution with expected-fact validation through the existing worker queue infrastructure
  - Store API keys securely using the existing AES-256-GCM encryption (`packages/core/src/infra/crypto.ts`)

- Non-Goals:
  - Multi-user test execution (remains single-user like the rest of the system)
  - Test scheduling / cron-based execution (manual trigger only)
  - Code coverage or performance benchmarking
  - Published model testing (tests run against the current development state only)

## Decisions

### Test Agent API key storage
- **Decision**: Encrypt API keys at rest using `encrypt()` from `crypto.ts` with `ENCRYPTION_KEY`. Return the key in plaintext only on initial creation (POST response). Subsequent GET responses return a masked version (`sk-...****`).
- **Alternatives**: Hash like MCP tokens (rejected — need to decrypt for LLM calls), store plaintext (rejected — API keys are high-value secrets).

### Playground agent architecture
- **Decision**: Create a `createPlaygroundAgent` function that builds a LangChain agent with MCP-style tools (`list_semantic_models`, `get_semantic_model_overview`, `get_dataset_fields`, `execute_query`) scoped to the test agent's selected models. Reuses `SemanticModelFileService` for reading YAML from disk and the DuckDB scoped-VIEW pattern from the MCP server.
- **Alternatives**: Route playground through the actual MCP endpoint (rejected — adds network hop, requires token management, conflates access logging).

### Playground conversations
- **Decision**: Reuse the existing `Conversation` model with an added optional `testAgent` ref field. When `testAgent` is set, the conversation is a playground conversation. Playground conversations are excluded from the MCP access log (`McpCallLog`).
- **Alternatives**: Separate `PlaygroundConversation` model (rejected — duplicates schema and forces parallel UI code).

### Test case fact evaluation
- **Decision**: Use an LLM "judge" call to evaluate whether the agent's final response satisfies each expected fact. The judge uses the test agent's own LLM config. The prompt asks the judge to return a JSON array of `{ fact, passed: boolean, reasoning }`. This avoids brittle string matching and handles paraphrased answers.
- **Alternatives**: Regex/substring matching (rejected — too brittle for natural language), separate judge model config (rejected — adds config complexity without clear benefit for v1).

### Batch execution via worker
- **Decision**: Add a `test-runs` BullMQ queue processed by the existing worker (`apps/worker/`). A batch run creates one job per test case. Each job: (1) creates a playground-style agent with the test agent's config scoped to the test case's model, (2) sends the input message, (3) collects the response, (4) runs the fact-evaluation judge, (5) updates the `TestRun` document. The worker already handles multiple queues via BullMQ's `Worker` class — add a second worker instance for `test-runs`.
- **Alternatives**: Run all test cases in a single job (rejected — loses parallelism and granular failure isolation), use the API process (rejected — breaks the worker separation pattern).

### MCP tool extraction
- **Decision**: Extract the MCP server's tool logic (`list_semantic_models`, `get_semantic_model_overview`, `get_dataset_fields`, `execute_query` with scoped VIEWs) from `apps/api/src/mcp/semlayer-server.ts` into shared service functions in `packages/core/src/services/mcp-tools.ts`. Both the MCP server and the playground/test runner consume these functions.
- **Alternatives**: Duplicate tool logic (rejected — divergence risk), call MCP endpoint internally (rejected — see playground decision above).

## Risks / Trade-offs

- **LLM-as-judge reliability**: Fact evaluation depends on LLM quality. Weaker models may produce false positives/negatives. → Mitigate by returning the judge's reasoning so users can inspect failures. Consider adding "strict mode" (exact match) as a future option.
- **Cost of batch runs**: Each test case requires at least 2 LLM calls (agent + judge). Large test suites could be expensive. → Show estimated cost/token count before starting a batch run (future enhancement).
- **`ENCRYPTION_KEY` required**: Test agents need API key encryption, making `ENCRYPTION_KEY` a soft requirement. → Fall back gracefully: if not set, warn on test agent creation that API keys will be stored in plaintext.

## Open Questions

- Should test runs store full conversation history (all tool calls) or just the final response? Full history aids debugging but increases storage. Recommend: store full history for the initial version.
