## 1. Configuration

- [ ] 1.1 Add `AGENT_PROMPT_CACHE_ENABLED` (default `true`) and `AGENT_PROMPT_CACHE_TTL` (default `5m`, accepts `5m`/`1h`) to the Zod env schema in `packages/core/src/config/env.ts`
- [ ] 1.2 Add both vars (with comments) to `.env.example`

## 2. Caching middleware & helper

- [ ] 2.1 Add a provider-aware helper that decides whether the configured `AGENT_MODEL` supports explicit cache breakpoints (Anthropic/Claude check)
- [ ] 2.2 Implement a LangChain model-wrapping middleware in `packages/core/src/services/agent-middleware.ts` that, when enabled, rewrites the outgoing system message content into a single `{ type: "text", text, cache_control: { type: "ephemeral", ttl } }` block
- [ ] 2.3 Register the middleware in `createSemlayerAgent` (`packages/core/src/services/agent.ts`) alongside the existing tool-error-recovery middleware
- [ ] 2.4 Reuse the helper/middleware in `createPlaygroundAgent` (`packages/core/src/services/playground-agent.ts`)

## 3. Sticky routing

- [ ] 3.1 Thread the conversation id (and test-run id for playground) to the LLM client as the OpenRouter `session_id` / sticky-routing key
- [ ] 3.2 Verify `session_id` is sent on every request in the tool loop (worker path `apps/worker/src/processor.ts` and in-process path `apps/api/src/routes/agent.ts`)

## 4. Token usage observability

- [ ] 4.1 Handle `on_chat_model_end` in `processAgentStream` (`packages/core/src/services/agent-stream.ts`) to read `usage_metadata` (input, output, `cache_read`, `cache_creation`) and accumulate per-run totals
- [ ] 4.2 Log a structured per-run usage summary in the worker and in-process API completion paths

## 5. Validation

- [ ] 5.1 Manually verify against the default model (`anthropic/claude-sonnet-4.6` via OpenRouter) that a second call within a turn reports `cache_read` tokens
- [ ] 5.2 Verify a non-Anthropic model (e.g. an OpenAI model) runs without injected breakpoints and without provider errors
- [ ] 5.3 Verify `AGENT_PROMPT_CACHE_ENABLED=false` produces requests with no `cache_control` markers

## 6. Tests

- [ ] 6.1 Unit test the provider-aware activation helper (Anthropic vs non-Anthropic model ids; enabled/disabled flag)
- [ ] 6.2 Unit test the middleware rewrites the system message into a cache-controlled content block only when active, and leaves messages untouched otherwise
- [ ] 6.3 Unit test usage accumulation in `processAgentStream` (cache fields present and absent)

## 7. Documentation

- [ ] 7.1 Document `AGENT_PROMPT_CACHE_ENABLED` and `AGENT_PROMPT_CACHE_TTL` (defaults, TTL trade-off, provider support) in the agent configuration page of `apps/docs`
