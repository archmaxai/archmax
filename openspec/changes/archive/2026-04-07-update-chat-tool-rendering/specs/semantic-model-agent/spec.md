## MODIFIED Requirements

### Requirement: Chat Interface

The Semantic Models page SHALL render a chat interface where the user can converse with an AI agent to create, edit, and explore semantic models for the selected project. Assistant messages SHALL be rendered as markdown with support for headings, lists, code blocks (with language label and copy button), bold, italic, tables, blockquotes, links, and horizontal rules. User messages SHALL remain plain text. Tool calls SHALL be rendered inline within the assistant message in the order they occurred during the response, interleaved with text segments rather than grouped separately. Each tool type SHALL have a specialized compact visualization.

#### Scenario: User sends a message

- **WHEN** the user types a message and presses Enter or clicks Send
- **THEN** the message is displayed in the chat area
- **AND** the message is sent to the backend agent endpoint
- **AND** the agent's response streams in real-time via SSE

#### Scenario: Agent response with file changes

- **WHEN** the agent creates or modifies a YAML semantic model file
- **THEN** the agent's response describes the changes made
- **AND** the changes are persisted to disk in the project's data directory

#### Scenario: Assistant message contains markdown

- **WHEN** the agent responds with markdown content (headings, code fences, lists, tables, bold/italic)
- **THEN** the content is rendered as formatted HTML with Tailwind-styled custom components
- **AND** code blocks display a language label (when specified) and a copy-to-clipboard button on hover
- **AND** tables render with proper column alignment and border styling

#### Scenario: Assistant message contains inline code

- **WHEN** the agent response includes inline code (single backticks)
- **THEN** the inline code is rendered with a monospace font and subtle background highlight

#### Scenario: User message remains plain text

- **WHEN** the user sends a message containing markdown-like syntax
- **THEN** the message is displayed as-is without markdown interpretation

#### Scenario: Tool calls rendered inline with text

- **WHEN** the agent executes one or more tools during a response
- **THEN** each tool call is rendered as a compact, expandable card at the position it occurred in the response flow, interleaved with surrounding text segments
- **AND** subsequent text from the agent appears below the tool call card, preserving the natural reading order

#### Scenario: executeQuery tool visualization

- **WHEN** the agent invokes the `executeQuery` tool
- **THEN** the collapsed card shows a database icon, "Queried database" label, row count badge (when completed), and status indicator
- **AND** expanding the card reveals the SQL query in a code block and the result as a formatted table

#### Scenario: Filesystem tool visualization

- **WHEN** the agent invokes a filesystem tool (`ls`, `read_file`, `write_file`, or `find`)
- **THEN** the collapsed card shows an appropriate file icon, a human-readable label (e.g., "Read orders.yaml", "Listed files"), and status indicator
- **AND** expanding the card reveals tool-specific content: file list for `ls`, content preview for `read_file`/`write_file`, matching paths for `find`

#### Scenario: Unknown tool fallback visualization

- **WHEN** the agent invokes a tool that has no specialized renderer
- **THEN** the card displays the tool name as a badge, raw args, and raw result JSON as the fallback

#### Scenario: Tool call card expand and collapse

- **WHEN** the user clicks on a tool call card
- **THEN** the card toggles between collapsed (single-row summary) and expanded (full detail) state with a smooth animation
- **AND** the collapsed state shows: tool-specific icon, human-readable label, status indicator (spinner when running, checkmark when completed, alert when error), and a chevron

### Requirement: Agent Conversation Streaming

The agent endpoint SHALL use Server-Sent Events (SSE) to stream the agent's responses to the frontend, including intermediate tool call results and final text output. The frontend SHALL reconstruct the interleaved ordering of text and tool calls from the temporal sequence of SSE events.

#### Scenario: Streaming partial response

- **WHEN** the agent generates a response
- **THEN** tokens are streamed incrementally to the frontend
- **AND** the UI renders them as they arrive

#### Scenario: Tool execution visibility

- **WHEN** the agent executes a tool (filesystem or executeQuery)
- **THEN** the tool name and a summary of the action are visible in the chat stream

#### Scenario: Interleaved segment construction from SSE events

- **WHEN** the frontend receives `token` SSE events followed by a `tool_call_start` event followed by more `token` events
- **THEN** the message is rendered with a text segment, then the tool call card, then another text segment, preserving the temporal order of the stream

### Requirement: Conversation Persistence

Agent conversations SHALL be persisted in MongoDB. Each conversation belongs to a project and stores an ordered list of messages (user and assistant roles, tool calls, timestamps). The chat endpoint accepts an optional `conversationId` to continue an existing conversation; if omitted, a new conversation is created. For new conversations, the document SHALL be saved to MongoDB before starting the SSE stream, so the conversation appears in the sidebar immediately. The system SHALL asynchronously generate a descriptive title using a lightweight LLM call (via `AGENT_TITLE_MODEL`) after the first assistant response. Title generation MUST NOT block the SSE response stream. If title generation fails, the system SHALL fall back to truncating the first user message.

#### Scenario: New conversation created

- **WHEN** the user sends a message without a `conversationId`
- **THEN** a new conversation document is created and saved in MongoDB before streaming begins
- **AND** the conversation ID is returned to the frontend for subsequent messages
- **AND** the conversation appears in the sidebar history list immediately

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
