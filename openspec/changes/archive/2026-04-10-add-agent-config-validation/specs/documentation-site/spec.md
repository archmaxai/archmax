## ADDED Requirements

### Requirement: Agent API Key Documentation

The configuration reference page SHALL include a prominent note in the "AI Agent" section stating that `AGENT_API_KEY` is required for all agent features to function. The note MUST:

- Explain that without `AGENT_API_KEY`, the Semantic Model Builder, Testing Playground, and automatic title generation will not work
- List supported providers (OpenRouter, OpenAI, Azure OpenAI, Ollama, or any OpenAI-compatible endpoint)
- Include a link or brief instructions for obtaining an API key from OpenRouter (the default provider)

The README Quick Start section MUST mention the `AGENT_API_KEY` variable and note that it is needed for the AI agent to function.

#### Scenario: User reads configuration reference

- **WHEN** a user reads the AI Agent section on the configuration reference page
- **THEN** they find a note explaining that `AGENT_API_KEY` is required for agent features
- **AND** they understand which providers are supported

#### Scenario: User reads README Quick Start

- **WHEN** a user reads the Quick Start section in README.md
- **THEN** `AGENT_API_KEY` is listed among the environment variables with a note that it enables AI agent features
