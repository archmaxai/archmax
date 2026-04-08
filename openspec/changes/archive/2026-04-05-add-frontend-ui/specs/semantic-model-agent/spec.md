## ADDED Requirements

### Requirement: Chat Interface

The Semantic Models page SHALL render a chat interface where the user can converse with an AI agent to create, edit, and explore semantic models for the selected project.

#### Scenario: User sends a message

- **WHEN** the user types a message and presses Enter or clicks Send
- **THEN** the message is displayed in the chat area
- **AND** the message is sent to the backend agent endpoint
- **AND** the agent's response streams in real-time via SSE

#### Scenario: Agent response with file changes

- **WHEN** the agent creates or modifies a YAML semantic model file
- **THEN** the agent's response describes the changes made
- **AND** the changes are persisted to disk in the project's data directory

### Requirement: Deep Agent Backend

The API SHALL expose a streaming endpoint for the semantic model agent. The agent uses LangChain Deep Agents with `FilesystemBackend({ rootDir: "<SEMLAYER_DATA_DIR>/<projectId>", virtualMode: true })`, giving it sandboxed filesystem access to the project's YAML files.

#### Scenario: Agent lists semantic models

- **WHEN** the user asks "What semantic models exist?"
- **THEN** the agent uses the `ls` filesystem tool to list YAML files in the project directory
- **AND** returns a summary to the user

#### Scenario: Agent creates a new semantic model

- **WHEN** the user asks "Create a model for the orders schema"
- **THEN** the agent uses `write_file` to create a new YAML file conforming to the OSI schema
- **AND** the file is written to `<SEMLAYER_DATA_DIR>/<projectId>/<model-name>.yaml`

### Requirement: executeQuery Tool

The deep agent SHALL have access to a custom `executeQuery` tool that runs parameterized read-only SQL queries against the project's DuckDB instance (which has all project connections attached as named schemas). The tool accepts a SQL template with positional placeholders (`$1`, `$2`, ...) and a separate `params` array of values.

#### Scenario: Agent explores database schema

- **WHEN** the agent invokes `executeQuery` with `{ "sql": "SELECT table_name FROM information_schema.tables WHERE table_schema = $1", "params": ["public"] }`
- **THEN** DuckDB executes the parameterized query against the attached connections
- **AND** the result rows and column metadata are returned to the agent as JSON

#### Scenario: Query without parameters

- **WHEN** the agent invokes `executeQuery` with `{ "sql": "SELECT table_name FROM information_schema.tables", "params": [] }`
- **THEN** DuckDB executes the query without parameter binding
- **AND** results are returned normally

#### Scenario: Query timeout

- **WHEN** a query exceeds the 30-second timeout
- **THEN** the query is cancelled
- **AND** an error message is returned to the agent

#### Scenario: Non-SELECT query rejected

- **WHEN** the agent attempts a DDL or DML statement (CREATE, INSERT, UPDATE, DELETE, DROP)
- **THEN** the tool rejects the query with an error
- **AND** no database modification occurs

### Requirement: Conversation Persistence

Agent conversations SHALL be persisted in MongoDB. Each conversation belongs to a project and stores an ordered list of messages (user and assistant roles, tool calls, timestamps). The chat endpoint accepts an optional `conversationId` to continue an existing conversation; if omitted, a new conversation is created. The frontend SHALL display a list of past conversations for the current project, allowing the user to resume any previous session.

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
- **AND** each entry displays a title or first message preview and timestamp

### Requirement: LLM Provider Configuration

The deep agent SHALL use an OpenAI-compatible API endpoint configured via environment variables: `AGENT_API_BASE_URL` (defaults to `https://openrouter.ai/api/v1`), `AGENT_API_KEY`, and `AGENT_MODEL`. This allows using OpenRouter, direct OpenAI, Azure OpenAI, local Ollama, or any OpenAI-compatible provider.

#### Scenario: Agent uses OpenRouter

- **WHEN** `AGENT_API_BASE_URL` is set to `https://openrouter.ai/api/v1` and a valid `AGENT_API_KEY` is provided
- **THEN** the agent sends LLM requests through OpenRouter
- **AND** the model specified in `AGENT_MODEL` is used

#### Scenario: Agent uses local Ollama

- **WHEN** `AGENT_API_BASE_URL` is set to `http://localhost:11434/v1`
- **THEN** the agent sends LLM requests to the local Ollama instance

### Requirement: Agent Conversation Streaming

The agent endpoint SHALL use Server-Sent Events (SSE) to stream the agent's responses to the frontend, including intermediate tool call results and final text output.

#### Scenario: Streaming partial response

- **WHEN** the agent generates a long response
- **THEN** tokens are streamed incrementally to the frontend
- **AND** the UI renders them as they arrive

#### Scenario: Tool execution visibility

- **WHEN** the agent executes a tool (filesystem or executeQuery)
- **THEN** the tool name and a summary of the action are visible in the chat stream
