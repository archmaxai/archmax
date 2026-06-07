## Context

The agent stack is **deepagents** (LangGraph) with **`ChatOpenAI`** (`@langchain/openai`) pointed at OpenRouter by default (`AGENT_API_BASE_URL=https://openrouter.ai/api/v1`, `AGENT_MODEL=anthropic/claude-sonnet-4.6`). The agent is assembled in `packages/core/src/services/agent.ts:45-88` via `createDeepAgent({ model, backend, tools, memory, systemPrompt, middleware })`. The system prompt is passed as a plain string (`buildSystemPrompt(connections)`), and deepagents' memory middleware appends an optional project `AGENTS.md`.

There is no prompt caching today and no token-usage tracking. The constraint is that the **system prompt is sent as an OpenAI-style `{ role: "system" }` message** through the chat-completions wire format.

### Key external constraints (verified)

- OpenRouter supports Anthropic prompt caching via **explicit per-block `cache_control: { type: "ephemeral" }` breakpoints** placed on message **content blocks**. Per-block breakpoints work across all Anthropic-compatible OpenRouter providers (Anthropic, Bedrock, Vertex). ([OpenRouter prompt caching docs](https://openrouter.ai/docs/guides/best-practices/prompt-caching))
- Anthropic allows a **maximum of 4 explicit breakpoints**; the cache covers `tools` → `system` → `messages` in order, up to and including the marked block.
- Caching only triggers for prefixes **> ~1024 tokens** — our ~47 KB system prompt easily clears this.
- Top-level (automatic) `cache_control` is **not** reliably honored over the OpenAI-compat path; explicit per-block breakpoints on the system message are the robust route.
- `session_id` in the request body enables **provider sticky routing**, which maximizes cache hits across the many requests in a tool loop and across turns.
- LangChain reports cache usage on the response as `usage_metadata.input_token_details.cache_read` / `cache_creation`.

## Goals / Non-Goals

- Goals:
  - Cache the stable prompt prefix (tool definitions + system prompt) for Anthropic/Claude models so tool-loop iterations and follow-up turns are billed at the cached rate.
  - Keep the existing OpenAI-compatible provider configuration; no required provider switch.
  - Make caching safe-by-default: on for supported models, transparent no-op otherwise, and disableable via env.
  - Observe cache effectiveness (cache_read / cache_creation tokens).
- Non-Goals:
  - Switching the default client to `@langchain/anthropic` (kept as a documented alternative only).
  - Caching frequently changing per-turn content beyond the stable prefix.
  - Building a full cost dashboard / persisted token-accounting model (logging only for now).
  - Caching the short single-shot title-generation call (negligible benefit).

## Decisions

- **Decision: Inject breakpoints via a LangChain model-wrapping middleware, not by hand-building messages.** deepagents owns message assembly (system string + memory + history + tool results), so the only stable interception point is a middleware that rewrites the outgoing request just before the model call. The middleware converts the system message's string content into a single content block `[{ type: "text", text, cache_control: { type: "ephemeral", ttl } }]`. This places one breakpoint at the end of the static prefix (tools + system), which is the dominant repeated content.
  - Alternatives considered: (a) Passing a structured `systemPrompt` to `createDeepAgent` — rejected, the API takes a string and memory mutates it. (b) Top-level automatic `cache_control` — rejected, unreliable over chat-completions. (c) Switching to `ChatAnthropic` direct — rejected as default (breaks provider-agnostic config) but noted as an option since `@langchain/anthropic@^1.4.0` is already a dependency.

- **Decision: Provider-aware activation.** The middleware only injects breakpoints when caching is enabled AND the model id indicates an Anthropic/Claude model (e.g. contains `claude`/`anthropic`). For other models (OpenAI, Gemini, Ollama) it is a no-op, relying on those providers' implicit caching. This prevents sending unsupported syntax to providers that reject extra breakpoints.

- **Decision: Per-conversation sticky routing.** Pass the conversation id as `session_id` (via OpenRouter request extra body) so the tool loop and subsequent turns route to the same provider and reuse the cache. The conversation id is already available at the worker/API call site.

- **Decision: Configuration.**
  - `AGENT_PROMPT_CACHE_ENABLED` (default `true`) — master switch.
  - `AGENT_PROMPT_CACHE_TTL` (default `5m`; accepts `5m` or `1h`) — maps to ephemeral default vs `{ ttl: "1h" }`. 1h costs more on writes but survives long pauses.

- **Decision: Lightweight observability.** Handle `on_chat_model_end` in `processAgentStream` to read `usage_metadata` and accumulate `cache_read` / `cache_creation` / `input` / `output` tokens for the run. Log a single structured summary per agent run (worker + in-process API path). No new DB model in this change.

## Risks / Trade-offs

- **Risk: OpenRouter passthrough quirks for cache_control over chat-completions.** → Validate against the live default model during implementation; ship behind `AGENT_PROMPT_CACHE_ENABLED` so it can be disabled instantly if a provider rejects it.
- **Risk: Cache invalidation from non-deterministic prefix content.** Connection context ordering or tool-arg serialization changes break the prefix hash. → Ensure `buildConnectionContext` output is stable/ordered; mark only content that is byte-identical across requests.
- **Risk: 1h TTL increases write cost** if conversations are short. → Default to 5m; document the trade-off.
- **Trade-off: Single breakpoint** (tools+system) rather than multiple. Keeps us well under the 4-breakpoint limit and covers the largest repeated payload; a rolling message-history breakpoint can be added later if usage data justifies it.

## Migration Plan

- Purely additive and backward-compatible. New env vars default to caching-on; existing deployments gain caching automatically for Claude models with no config change. Set `AGENT_PROMPT_CACHE_ENABLED=false` to restore prior behavior. No data migration.

## Open Questions

- Should cache usage be surfaced in the UI (per-message token/cost badge) or kept to server logs for now? (Proposed: logs only in this change.)
- Should the playground/test agent also use sticky routing keyed by test-run id? (Proposed: yes, reuse the same helper.)
