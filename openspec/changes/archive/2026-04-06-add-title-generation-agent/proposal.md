# Change: Add LLM-powered conversation title generation

## Why
Conversation titles are currently the first user message truncated to 60 characters, which produces unhelpful titles like "Can you help me create a semantic model for the ord…". An LLM can generate concise, descriptive titles that make the conversation list scannable.

## What Changes
- Add a `AGENT_TITLE_MODEL` environment variable (defaults to `anthropic/claude-haiku-4-5-20250929`) to configure a cheap/fast model for title generation, reusing the existing `AGENT_API_BASE_URL` and `AGENT_API_KEY`
- Add a title generation service that uses a plain LangChain `ChatOpenAI.invoke()` call (not a deep agent) to summarize the first user message into a short title
- Update the agent chat endpoint to fire-and-forget title generation after the first assistant response, replacing the truncation logic
- Update `.env.example` and the Zod env schema with the new variable

## Impact
- Affected specs: `semantic-model-agent` (Conversation Persistence, LLM Provider Configuration)
- Affected code: `packages/core/src/config/env.ts`, `apps/api/src/routes/agent.ts`, `apps/api/src/services/title-agent.ts` (new), `.env.example`
