## ADDED Requirements

### Requirement: Conversation-Scoped Streaming State

The chat interface SHALL scope all streaming state (input disabled, stop button, abort controller) to the active conversation. When the user navigates to a different conversation or creates a new chat while a stream is in progress, the new conversation's input SHALL be immediately usable — enabled with the send button visible — regardless of whether the previous conversation's stream is still running in the background. The system SHALL abort any client-side SSE subscription for the previous conversation on navigation and clean up the associated `AbortController`.

#### Scenario: Navigate to new chat while streaming

- **WHEN** the user is viewing a conversation that is actively streaming
- **AND** the user navigates to a new chat (conversation ID "new")
- **THEN** the new chat's text input is enabled and accepts user input
- **AND** the send button is visible (not the stop button)
- **AND** the client-side SSE subscription for the previous conversation is aborted

#### Scenario: Switch between existing conversations while streaming

- **WHEN** the user is viewing a conversation that is actively streaming
- **AND** the user clicks a different conversation in the sidebar
- **THEN** the selected conversation loads with its persisted messages
- **AND** the text input reflects the new conversation's streaming state (enabled if not streaming, disabled with stop button if that conversation is also streaming)
- **AND** the client-side SSE subscription for the previous conversation is aborted

#### Scenario: Return to a still-streaming conversation

- **WHEN** the user navigated away from a streaming conversation
- **AND** the backend agent is still processing (conversation `isStreaming` is true server-side)
- **AND** the user navigates back to that conversation
- **THEN** the chat re-subscribes to the SSE stream for that conversation
- **AND** the input is disabled with the stop button visible
- **AND** new tokens are appended to the assistant message

#### Scenario: Multiple conversations streaming concurrently

- **WHEN** the user starts a stream in conversation A, navigates to conversation B, and sends a message there
- **THEN** both conversations process independently on the backend
- **AND** the UI shows streaming state only for the currently viewed conversation
- **AND** the sidebar shows animated streaming indicators for both conversations
