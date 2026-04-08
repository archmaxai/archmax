## ADDED Requirements

### Requirement: Title Generation Model Configuration
The system SHALL support a `AGENT_TITLE_MODEL` environment variable that specifies the LLM model used for generating conversation titles. The variable is optional and defaults to `anthropic/claude-haiku-4-5-20250929`. Title generation reuses the existing `AGENT_API_BASE_URL` and `AGENT_API_KEY` for endpoint and authentication.

#### Scenario: Title model configured via env
- **WHEN** `AGENT_TITLE_MODEL` is set to `anthropic/claude-haiku-4-5-20250929`
- **THEN** conversation title generation uses that model

#### Scenario: Title model falls back to default
- **WHEN** `AGENT_TITLE_MODEL` is not set
- **THEN** the system uses `anthropic/claude-haiku-4-5-20250929` for title generation

## MODIFIED Requirements

### Requirement: Conversation Persistence
Agent conversations SHALL be persisted in MongoDB. Each conversation belongs to a project and stores an ordered list of messages (user and assistant roles, tool calls, timestamps). The chat endpoint accepts an optional `conversationId` to continue an existing conversation; if omitted, a new conversation is created. The frontend SHALL display a list of past conversations for the current project, allowing the user to resume any previous session. When a new conversation is created, the system SHALL asynchronously generate a descriptive title using a lightweight LLM call (via `AGENT_TITLE_MODEL`) after the first assistant response. Title generation MUST NOT block the SSE response stream. If title generation fails, the system SHALL fall back to truncating the first user message.

#### Scenario: New conversation created
- **WHEN** the user sends a message without a `conversationId`
- **THEN** a new conversation document is created in MongoDB
- **AND** the conversation ID is returned to the frontend for subsequent messages

#### Scenario: Resume existing conversation
- **WHEN** the user selects a past conversation and sends a new message
- **THEN** the message is appended to the existing conversation
- **AND** the agent has access to the full message history for context

#### Scenario: List conversations for a project
- **WHEN** the user navigates to the Semantic Models page
- **THEN** a list of past conversations is shown (most recent first)
- **AND** each entry displays a generated title and timestamp

#### Scenario: LLM title generated for new conversation
- **WHEN** a new conversation is created and the first assistant response completes
- **THEN** the system invokes the title generation LLM with the first user message
- **AND** updates the conversation title in MongoDB asynchronously

#### Scenario: Title generation failure fallback
- **WHEN** the title generation LLM call fails or times out
- **THEN** the conversation title remains the truncated first user message
