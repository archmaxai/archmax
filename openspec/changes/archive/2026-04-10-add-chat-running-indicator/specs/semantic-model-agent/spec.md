## MODIFIED Requirements

### Requirement: Conversation Persistence
Agent conversations SHALL be persisted in MongoDB. Each conversation belongs to a project and stores an ordered list of messages (user and assistant roles, tool calls, timestamps). Assistant messages SHALL include a `toolCalls` array that captures every tool invocation performed during the response — each entry records the tool `id`, `name`, `args` (truncated to 500 characters), `result` (truncated to 500 characters), and `status` (`"completed"` or `"error"`). The chat endpoint accepts an optional `conversationId` to continue an existing conversation; if omitted, a new conversation is created. The frontend SHALL display a list of past conversations for the current project, allowing the user to resume any previous session. When a past conversation is loaded, tool call cards SHALL be rendered from persisted data, identical in appearance to those shown during live streaming. When a new conversation is created, the system SHALL asynchronously generate a descriptive title using a lightweight LLM call (via `AGENT_TITLE_MODEL`) after the first assistant response. Title generation MUST NOT block the SSE response stream. If title generation fails, the system SHALL fall back to truncating the first user message. The conversation list API response SHALL include an `isStreaming` boolean per item indicating whether the conversation currently has an active streaming session (determined via the Redis stream buffer). The chat history sidebar SHALL display an animated spinner icon in place of the default message icon for conversations where `isStreaming` is `true`, reverting to the default icon once streaming completes.

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
- **AND** each entry displays a generated title, timestamp, and an `isStreaming` boolean

#### Scenario: Active streaming conversation shown in sidebar
- **WHEN** a conversation has an active streaming session (agent is processing in the background)
- **AND** the user views the chat history sidebar
- **THEN** the sidebar entry for that conversation displays an animated spinning icon instead of the static message icon
- **AND** the icon reverts to the static message icon once the streaming session completes and the next poll cycle refreshes the list

#### Scenario: LLM title generated for new conversation
- **WHEN** a new conversation is created and the first assistant response completes
- **THEN** the system invokes the title generation LLM with the first user message
- **AND** updates the conversation title in MongoDB asynchronously

#### Scenario: Title generation failure fallback
- **WHEN** the title generation LLM call fails or times out
- **THEN** the conversation title remains the truncated first user message

#### Scenario: Tool calls persisted with assistant message
- **WHEN** the agent invokes one or more tools during a response
- **THEN** each tool call is saved in the assistant message's `toolCalls` array with `id`, `name`, `args`, `result`, and `status`
- **AND** `args` and `result` are each truncated to 500 characters

#### Scenario: Persisted tool calls rendered on reload
- **WHEN** the user reloads or revisits a past conversation containing tool calls
- **THEN** the tool call cards are displayed in the assistant message using persisted data
- **AND** each card shows the tool name, arguments, status, and result preview

#### Scenario: Backward compatibility with existing conversations
- **WHEN** a conversation was created before tool call persistence was implemented
- **THEN** assistant messages without `toolCalls` data render normally with text-only content
- **AND** no errors occur due to missing `toolCalls` fields
