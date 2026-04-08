## MODIFIED Requirements

### Requirement: Agent Conversation Streaming

The agent endpoint SHALL use Server-Sent Events (SSE) to stream the agent's responses to the frontend in real time. The backend SHALL use LangGraph's `.stream()` API with `messages` and `updates` stream modes to deliver individual LLM tokens and agent step updates as they occur. The SSE protocol SHALL use distinct event types: `conversation`, `token`, `tool_call_start`, `tool_call_end`, `step`, `error`, and `done`.

#### Scenario: Token-by-token text streaming

- **WHEN** the agent generates a response
- **THEN** each LLM text token is emitted as a separate `token` SSE event with `{ content }` payload
- **AND** the frontend appends each token to the current assistant message incrementally
- **AND** the assembled full response is persisted to MongoDB after the stream completes

#### Scenario: Tool call lifecycle

- **WHEN** the agent invokes a tool (filesystem, executeQuery, or built-in)
- **THEN** a `tool_call_start` SSE event is emitted with `{ id, name, args }`
- **AND** the frontend renders a tool call card showing the tool name, arguments, and a "running" status
- **AND** after the tool completes, a `tool_call_end` SSE event is emitted with `{ id, name, result }` (result truncated to 500 characters)
- **AND** the frontend updates the card to "completed" status and shows the result preview

#### Scenario: Agent activity visibility

- **WHEN** the agent performs a non-tool step (e.g. planning via write_todos, spawning a subagent)
- **THEN** a `step` SSE event is emitted with `{ type, detail }` describing the activity
- **AND** the frontend displays an activity indicator (e.g. "Planning...", "Thinking...")

#### Scenario: Stream error recovery

- **WHEN** an error occurs during streaming
- **THEN** an `error` SSE event is emitted with `{ error }` containing the error message
- **AND** the stream attempts to continue if the error is recoverable
- **AND** a `done` event is always emitted to signal stream completion

### Requirement: Chat Interface

The Semantic Models page SHALL render a chat interface where the user can converse with an AI agent to create, edit, and explore semantic models for the selected project. Assistant messages SHALL be rendered as markdown (headings, lists, code blocks, bold, italic, tables) for readability.

#### Scenario: User sends a message

- **WHEN** the user types a message and presses Enter or clicks Send
- **THEN** the message is displayed in the chat area
- **AND** the message is sent to the backend agent endpoint
- **AND** the agent's response streams in real-time via SSE with incremental token delivery

#### Scenario: Agent response with file changes

- **WHEN** the agent creates or modifies a YAML semantic model file
- **THEN** the agent's response describes the changes made
- **AND** the changes are persisted to disk in the project's data directory

#### Scenario: Tool calls shown transparently

- **WHEN** the agent executes one or more tools during a response
- **THEN** each tool call is rendered as a collapsible card within the assistant message
- **AND** the card shows the tool name, a summary of arguments, execution status (running/completed), and a preview of the result
- **AND** the user can expand the card to see full argument and result details
