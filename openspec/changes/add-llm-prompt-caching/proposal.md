# Change: Enable LLM Prompt Caching for the Semantic Model Agent

## Why

The semantic model agent resends a large, static prefix on every LLM call: a ~47 KB system prompt (`packages/core/prompts/semantic-model-agent.md`), the connection context, the optional project `AGENTS.md`, and the full tool-definition list. A single user turn runs many model→tool→model iterations, so this prefix is re-billed as fresh input tokens on each iteration and again on every follow-up turn. With Claude (the default model via OpenRouter), prompt caching can serve this stable prefix at ~10% of the input price after the first write, cutting input-token cost dramatically for these tool-heavy conversations.

## What Changes

- Inject Anthropic-style `cache_control: { type: "ephemeral" }` breakpoints on the stable prompt prefix (tool definitions + system prompt) so the provider caches it across tool-loop iterations and across turns.
- Add OpenRouter sticky routing via a per-conversation `session_id` so repeated requests hit the same provider endpoint and reuse the cache.
- Make caching **provider-aware and configurable**: enabled by default, automatically a no-op for providers/models that don't support explicit breakpoints, controllable via new env vars (`AGENT_PROMPT_CACHE_ENABLED`, `AGENT_PROMPT_CACHE_TTL`).
- Capture and log per-call cache token usage (`cache_read` / `cache_creation`) so cost savings are observable.
- Apply the same caching helper to the playground/test agent, which is also tool-loop heavy.
- Update `.env.example` and the documentation site with the new configuration.

## Impact

- Affected specs: `semantic-model-agent`
- Affected code:
  - `packages/core/src/services/agent.ts` (LLM construction, agent assembly)
  - `packages/core/src/services/agent-middleware.ts` (new cache-control middleware)
  - `packages/core/src/services/agent-stream.ts` (capture `usage_metadata` on model end)
  - `packages/core/src/services/playground-agent.ts` (reuse caching helper)
  - `packages/core/src/config/env.ts` (new env vars)
  - `apps/worker/src/processor.ts` / `apps/api/src/routes/agent.ts` (pass conversation id as session key, log usage)
  - `.env.example`, `apps/docs` (configuration docs)
