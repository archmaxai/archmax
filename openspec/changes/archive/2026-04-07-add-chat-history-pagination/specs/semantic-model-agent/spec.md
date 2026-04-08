## MODIFIED Requirements
### Requirement: Conversation Persistence
Agent conversations SHALL be persisted in MongoDB. Each conversation belongs to a project and stores an ordered list of messages (user and assistant roles, tool calls, timestamps). The chat endpoint accepts an optional `conversationId` to continue an existing conversation; if omitted, a new conversation is created. The frontend SHALL display a paginated list of past conversations for the current project, allowing the user to resume any previous session. The list SHALL initially show the 10 most recent conversations (sorted by `updatedAt` descending). When more than 10 conversations exist, a "Load More" button SHALL appear below the list. Clicking "Load More" SHALL fetch the next batch of 10 older conversations and append them to the displayed list. All semantic models in the sidebar SHALL always be displayed in full without pagination.

When a new conversation is created, the system SHALL asynchronously generate a descriptive title using a lightweight LLM call (via `AGENT_TITLE_MODEL`) after the first assistant response. Title generation MUST NOT block the SSE response stream. If title generation fails, the system SHALL fall back to truncating the first user message.

The conversations list API endpoint SHALL accept `limit` (default 10) and `skip` (default 0) query parameters and return an object with `items` (the conversation summaries) and `total` (the total count of conversations for the project).

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
- **THEN** the 10 most recent conversations are shown (most recent first)
- **AND** each entry displays a generated title and timestamp

#### Scenario: Load more conversations
- **WHEN** the project has more than 10 conversations and the user clicks "Load More"
- **THEN** the next 10 older conversations are fetched from the API
- **AND** they are appended below the already visible conversations
- **AND** the "Load More" button remains visible if still more conversations exist
- **AND** the button disappears once all conversations are loaded

#### Scenario: Fewer than 10 conversations
- **WHEN** the project has 10 or fewer conversations
- **THEN** all conversations are displayed
- **AND** no "Load More" button is shown

#### Scenario: LLM title generated for new conversation
- **WHEN** a new conversation is created and the first assistant response completes
- **THEN** the system invokes the title generation LLM with the first user message
- **AND** updates the conversation title in MongoDB asynchronously

#### Scenario: Title generation failure fallback
- **WHEN** the title generation LLM call fails or times out
- **THEN** the conversation title remains the truncated first user message
