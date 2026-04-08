## 1. Environment Configuration
- [x] 1.1 Add `AGENT_TITLE_MODEL` to the Zod env schema in `packages/core/src/config/env.ts` (optional, defaults to `anthropic/claude-haiku-4-5-20250929`)
- [x] 1.2 Add `AGENT_TITLE_MODEL` to `.env.example` with a comment

## 2. Title Generation Service
- [x] 2.1 Create `apps/api/src/services/title-agent.ts` with a `generateTitle(userMessage: string): Promise<string>` function that uses `ChatOpenAI` with `AGENT_TITLE_MODEL` and a system prompt to produce a concise title (≤60 chars)
- [x] 2.2 Handle errors gracefully — fall back to the truncated message on failure

## 3. Integration
- [x] 3.1 Update `apps/api/src/routes/agent.ts` to call `generateTitle()` after the first assistant response (when `conversationId` was not provided) and update the conversation title in MongoDB
- [x] 3.2 Title generation MUST NOT block the SSE stream — fire it after the response is saved

## 4. Validation
- [x] 4.1 Verify title generation works with a running agent and a new conversation
- [x] 4.2 Verify fallback: when `AGENT_TITLE_MODEL` is unset or the LLM call fails, title falls back to truncated first message
