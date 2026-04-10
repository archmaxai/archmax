## ADDED Requirements

### Requirement: Agent Configuration Missing Banner

The agent chat empty state (shown before any messages are sent) SHALL display an error banner when the backend reports that `AGENT_API_KEY` is not configured. The banner SHALL:

- Appear in place of the default empty state description on both the Semantic Model Builder page and the Testing Playground page
- Use a warning/caution visual treatment (icon + tinted background) consistent with the application's design system
- Explain that an AI provider API key is required for the agent to work
- List the environment variables that need to be set: `AGENT_API_KEY` (required), `AGENT_API_BASE_URL` (optional, defaults to OpenRouter), and `AGENT_MODEL` (optional)
- Briefly describe where to configure them (`.env` file or Docker Compose environment section)
- Disable the chat input (prevent sending) while the agent is not configured

The banner SHALL NOT appear once the agent is properly configured.

#### Scenario: User opens Semantic Model Builder without API key configured

- **WHEN** the user navigates to the Semantic Models chat page
- **AND** `AGENT_API_KEY` is not set on the server
- **THEN** the empty state displays a warning banner explaining that an API key is required
- **AND** the chat input is disabled (cannot send messages)
- **AND** the banner describes which environment variables to set and where

#### Scenario: User opens Semantic Model Builder with API key configured

- **WHEN** the user navigates to the Semantic Models chat page
- **AND** `AGENT_API_KEY` is set on the server
- **THEN** the default empty state is shown (title + description)
- **AND** the chat input is enabled

#### Scenario: User opens Testing Playground without API key configured

- **WHEN** the user navigates to the Testing Playground page
- **AND** `AGENT_API_KEY` is not set on the server
- **THEN** the empty state displays the same warning banner as the Semantic Model Builder
- **AND** the chat input is disabled
