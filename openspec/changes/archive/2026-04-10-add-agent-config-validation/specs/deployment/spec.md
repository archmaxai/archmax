## ADDED Requirements

### Requirement: Agent API Configuration Guidance in .env.example

The `.env.example` file SHALL clearly communicate that `AGENT_API_KEY` is required for all AI agent features (Semantic Model Builder, Testing Playground, conversation title generation). The comment block for the `AGENT_*` variables MUST:

- State that `AGENT_API_KEY` is required (not optional) for agent functionality
- List supported providers (OpenRouter, OpenAI, Azure OpenAI, Ollama, or any OpenAI-compatible endpoint)
- Note that `AGENT_API_BASE_URL` defaults to OpenRouter and should be changed when using a different provider
- Note that `AGENT_MODEL` should match the provider's model naming convention

The `docker-compose.yml` SHALL include a comment on the `AGENT_API_KEY` line indicating that it is required for agent features.

#### Scenario: New user reads .env.example

- **WHEN** a new user opens `.env.example` to configure the application
- **THEN** they find a clearly marked section explaining that `AGENT_API_KEY` must be set for the AI agent to work
- **AND** they understand which providers are supported and how to obtain a key

#### Scenario: User deploys without AGENT_API_KEY

- **WHEN** a user starts the application without setting `AGENT_API_KEY`
- **THEN** the application starts successfully (the key is not required for startup)
- **AND** agent features are unavailable until the key is configured

### Requirement: Agent Configuration Status in Config Endpoint

The `/api/config` endpoint SHALL include an `agentConfigured` boolean field that indicates whether the agent API key is set. The endpoint MUST NOT expose the actual key value or any secret material. The field SHALL be `true` when `AGENT_API_KEY` is a non-empty string, and `false` otherwise.

#### Scenario: Agent is configured

- **WHEN** `AGENT_API_KEY` is set to a non-empty value
- **AND** a client requests `GET /api/config`
- **THEN** the response includes `"agentConfigured": true`

#### Scenario: Agent is not configured

- **WHEN** `AGENT_API_KEY` is not set or is empty
- **AND** a client requests `GET /api/config`
- **THEN** the response includes `"agentConfigured": false`
- **AND** no secret values are leaked in the response
