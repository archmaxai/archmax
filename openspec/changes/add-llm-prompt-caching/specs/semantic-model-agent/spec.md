## ADDED Requirements

### Requirement: LLM Prompt Caching

The agent SHALL cache the stable prompt prefix (tool definitions and system prompt) so that repeated LLM calls within a single tool-loop turn and across follow-up turns reuse cached input tokens instead of re-billing the full prefix. For Anthropic/Claude models served via the configured OpenAI-compatible endpoint, the agent MUST inject an explicit `cache_control: { type: "ephemeral" }` breakpoint on the system message content block so the provider caches everything up to and including that block.

The breakpoint MUST be placed on content that is byte-identical across consecutive requests of the same conversation; per-turn varying content (the incoming user message, tool results) MUST NOT be marked for caching.

#### Scenario: System prefix cached across tool-loop iterations
- **WHEN** an agent turn performs multiple model→tool→model iterations using a Claude model
- **THEN** the first model call writes the tool+system prefix to the provider cache
- **AND** subsequent iterations in the same turn read that prefix from cache rather than re-billing it as fresh input tokens

#### Scenario: Cache reused on a follow-up turn
- **WHEN** the user sends a follow-up message in the same conversation while the cache is still live
- **THEN** the agent's first LLM call for that turn reads the previously cached prefix

#### Scenario: Sticky provider routing
- **WHEN** the agent issues multiple LLM requests for one conversation through OpenRouter
- **THEN** the requests include the conversation identifier as the session/sticky-routing key
- **AND** the requests are routed to the same provider endpoint to maximize cache hits

### Requirement: Provider-Aware Cache Activation

Prompt caching SHALL be provider-aware and configurable. Caching MUST be controlled by an `AGENT_PROMPT_CACHE_ENABLED` environment variable that defaults to enabled, and a cache lifetime controlled by `AGENT_PROMPT_CACHE_TTL` (default `5m`, also accepting `1h`). When the configured model does not support explicit cache breakpoints (e.g. non-Anthropic models), the agent MUST NOT inject `cache_control` markers and MUST continue operating normally.

#### Scenario: Caching disabled via configuration
- **WHEN** `AGENT_PROMPT_CACHE_ENABLED` is set to `false`
- **THEN** the agent issues LLM requests without any `cache_control` breakpoints
- **AND** behaves identically to the pre-caching implementation

#### Scenario: Non-Anthropic model is a no-op
- **WHEN** `AGENT_MODEL` points to a non-Anthropic model (e.g. an OpenAI or Ollama model)
- **THEN** the agent does not inject explicit `cache_control` markers
- **AND** the LLM request succeeds without provider errors

#### Scenario: Configurable cache TTL
- **WHEN** `AGENT_PROMPT_CACHE_TTL` is set to `1h`
- **THEN** injected `cache_control` breakpoints request the 1-hour ephemeral lifetime
- **AND** when unset, the default 5-minute ephemeral lifetime is used

### Requirement: Cache Token Usage Logging

The agent run pipeline SHALL capture per-call LLM token usage, including cache read and cache creation token counts, and log a structured summary for each completed agent run so that caching effectiveness and cost savings are observable.

#### Scenario: Cache usage captured on model completion
- **WHEN** an LLM call completes and the provider returns usage metadata with `cache_read` and/or `cache_creation` token counts
- **THEN** those counts are accumulated for the agent run

#### Scenario: Run usage summary logged
- **WHEN** an agent run finishes (in the worker or the in-process API path)
- **THEN** a structured log entry records total input, output, cache-read, and cache-creation tokens for the run

#### Scenario: Missing usage metadata tolerated
- **WHEN** a provider returns no cache usage fields
- **THEN** the run completes normally and the logged cache counts are zero
