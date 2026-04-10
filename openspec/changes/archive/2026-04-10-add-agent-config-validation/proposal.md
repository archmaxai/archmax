# Change: Add agent API configuration validation and user guidance

## Why

The Semantic Model Builder and Testing Playground depend on an OpenAI-compatible API key (`AGENT_API_KEY`) to function, but the system treats it as optional. When the key is missing, agent chat requests fail at runtime with a cryptic LLM error. Users have no upfront indication that configuration is incomplete, and the `.env.example` file under-emphasizes these variables.

## What Changes

- Update `.env.example` to clearly mark `AGENT_API_KEY` as required for agent functionality, with guidance on supported providers (OpenRouter, OpenAI, Azure, Ollama, etc.)
- Expose agent configuration status via the existing `/api/config` endpoint so the frontend can check without revealing secrets
- Show an informative error banner on the agent chat empty state (Semantic Model Builder and Testing Playground) when `AGENT_API_KEY` is not configured, explaining what needs to be set and where
- Update the configuration reference docs to emphasize that `AGENT_API_KEY` is required for all agent features

## Impact

- Affected specs: `deployment`, `semantic-model-agent`, `documentation-site`
- Affected code:
  - `.env.example`
  - `docker-compose.yml` (comment clarification)
  - `packages/core/src/config/env.ts` (no schema change, key stays optional for startup)
  - `apps/api/src/app.ts` (`/api/config` endpoint extension)
  - `apps/frontend/src/components/chat/agent-chat.tsx` (config-missing banner)
  - `apps/docs/src/content/docs/reference/configuration.mdx`
