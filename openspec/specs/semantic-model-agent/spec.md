# semantic-model-agent Specification

## Purpose
AI-powered chat agent for creating and editing semantic models. Provides a chat interface in the frontend, a streaming backend using LangChain Deep Agents with sandboxed filesystem access to project YAML files, a DuckDB query tool for schema exploration, and conversation persistence in MongoDB.
## Requirements
### Requirement: Chat Interface

The Semantic Models page SHALL render a chat interface where the user can converse with an AI agent to create, edit, and explore semantic models for the selected project. Assistant messages SHALL be rendered as markdown with support for headings, lists, code blocks (with language label and copy button), bold, italic, tables, blockquotes, links, and horizontal rules. User messages SHALL remain plain text. Tool calls SHALL be rendered inline within the assistant message in the order they occurred during the response, interleaved with text segments rather than grouped separately. Each tool type SHALL have a specialized compact visualization.

When an assistant message has an associated error, the system SHALL render all partial content (text segments and tool call cards) normally, followed by a visual error banner at the bottom of the message. The error banner SHALL display the specific error message and use a destructive color treatment (icon + tinted background) to distinguish it from normal content. The partial content MUST NOT be hidden or replaced by the error indicator.

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

#### Scenario: executeQuery tool visualization with syntax highlighting

- **WHEN** the agent invokes the `executeQuery` tool
- **THEN** the collapsed card shows a database icon, "Queried database" label, row count badge (when completed), and status indicator
- **AND** expanding the card reveals the SQL query rendered with syntax highlighting (keyword, string, number, and comment tokens visually distinguished) and the result as a formatted table

#### Scenario: Filesystem tool visualization

- **WHEN** the agent invokes a filesystem tool (`ls`, `read_file`, `write_file`, `find`, `mv`, or `cp`)
- **THEN** the collapsed card shows an appropriate file icon, a human-readable label (e.g., "Read orders.yaml", "Listed files", "Copied sales.yaml → sales_backup.yaml"), and status indicator
- **AND** expanding the card reveals tool-specific content: file list for `ls`, content preview for `read_file`/`write_file`, matching paths for `find`, source and destination paths for `mv` and `cp`

#### Scenario: write_todos tool visualization

- **WHEN** the agent invokes the `write_todos` planning tool
- **THEN** the collapsed card shows a list icon, "Planning" or "Updated plan" label, and status indicator
- **AND** expanding the card reveals a formatted checklist where each todo item displays a status icon (checkmark for completed, circle for pending, spinner for in-progress) and the item's content text
- **AND** the todo items are parsed from the tool's nested JSON args format

#### Scenario: Unknown tool fallback visualization

- **WHEN** the agent invokes a tool that has no specialized renderer
- **THEN** the card displays the tool name as a badge, raw args, and raw result JSON as the fallback

#### Scenario: Tool call card expand and collapse

- **WHEN** the user clicks on a tool call card
- **THEN** the card toggles between collapsed (single-row summary) and expanded (full detail) state with a smooth animation
- **AND** the collapsed state shows: tool-specific icon, human-readable label, status indicator (spinner when running, checkmark when completed, alert when error), and a chevron

#### Scenario: Streaming progress bar

- **WHEN** the agent is actively streaming a response (processing, thinking, or executing tools)
- **THEN** a glowing animated horizontal bar is displayed below the assistant message, indicating ongoing activity
- **AND** the bar uses a sweeping gradient animation with a subtle glow effect

#### Scenario: Agent error preserves partial content

- **WHEN** the agent encounters an error during processing after streaming partial content (text tokens, tool calls)
- **THEN** all partial content that was streamed before the error MUST be preserved in the message
- **AND** a visual error banner is rendered below the partial content showing the specific error message
- **AND** the error banner uses a destructive color treatment with an alert icon
- **AND** the partial content and error state survive page reloads (persisted to the database)

#### Scenario: Agent error with no prior content

- **WHEN** the agent encounters an error before producing any content
- **THEN** the error banner is shown as the only content in the assistant message
- **AND** the banner displays the specific error message, not a generic placeholder

### Requirement: Deep Agent Backend

The API SHALL expose a streaming endpoint for the semantic model agent. The agent uses LangChain Deep Agents with `FilesystemBackend({ rootDir: "<ARCHMAX_DATA_DIR>/projects/<projectId>", virtualMode: true })`, giving it sandboxed filesystem access to the project's YAML files. The agent system prompt SHALL document the OSI-compliant YAML schema including: snake_case keys (`ai_context`, `primary_key`, `unique_keys`, `from_columns`, `to_columns`), the OSI Expression object format (`{ dialects: [{ dialect: ANSI_SQL, expression: "..." }] }`), `custom_extensions` for project-specific field metadata (`data_type`, `example_data`, `distinct_values` under `vendor_name: COMMON`), and the `dimension` property with `is_time` for temporal fields. The agent SHALL also have access to a `read_document` tool that reads uploaded documents from the project's `uploads/` directory and returns their content as markdown, enabling the agent to reference data dictionaries, ERDs, business glossaries, and other supplementary documentation when building semantic models.

#### Scenario: Agent lists semantic models
- **WHEN** the user asks "What semantic models exist?"
- **THEN** the agent uses the `ls` filesystem tool to list YAML files in the project directory
- **AND** returns a summary to the user

#### Scenario: Agent creates a new semantic model
- **WHEN** the user asks "Create a model for the orders schema"
- **THEN** the agent uses `write_file` to create a new YAML file conforming to the OSI schema with snake_case keys and Expression objects
- **AND** the file is written to `<ARCHMAX_DATA_DIR>/projects/<projectId>/<model-name>.yaml`

#### Scenario: Agent writes fields with extensions
- **WHEN** the agent creates a dataset with fields that have data types and example data
- **THEN** the field's `data_type`, `example_data`, and `distinct_values` are placed in `custom_extensions` with `vendor_name: COMMON`
- **AND** timestamp/date fields include `dimension: { is_time: true }`

#### Scenario: Agent reads an uploaded document
- **WHEN** the user says "Use the data dictionary PDF to create the model"
- **THEN** the agent invokes `read_document` with the PDF filename
- **AND** receives the document content as markdown
- **AND** uses the extracted information to inform semantic model creation

### Requirement: executeQuery Tool

The deep agent SHALL have access to a custom `executeQuery` tool that runs read-only SQL queries against the project's DuckDB instance (which has all project connections attached as named schemas). The tool accepts a SQL template with positional placeholders (`$1`, `$2`, ...) and a separate `params` array of values.

The tool MUST always validate that the query is read-only (only SELECT, WITH, EXPLAIN, DESCRIBE, SHOW, PRAGMA are allowed, and multi-statement queries are rejected).

The agent's system prompt SHALL explicitly state the read-only constraint, instructing the agent that INSERT, UPDATE, DELETE, CREATE, DROP, and ALTER statements are forbidden and will be rejected. The dynamic connection context appended to the system prompt SHALL include a read-only notice.

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

- **WHEN** the agent attempts a DDL or DML statement
- **THEN** the tool rejects the query with an error
- **AND** no database modification occurs

#### Scenario: System prompt states read-only constraint

- **WHEN** the agent is initialized
- **THEN** the system prompt includes an explicit statement that only read-only queries are allowed
- **AND** the dynamic connection context includes a read-only notice

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

### Requirement: Title Generation Model Configuration
The system SHALL support a `AGENT_TITLE_MODEL` environment variable that specifies the LLM model used for generating conversation titles. The variable is optional and defaults to `anthropic/claude-haiku-4-5-20250929`. Title generation reuses the existing `AGENT_API_BASE_URL` and `AGENT_API_KEY` for endpoint and authentication.

#### Scenario: Title model configured via env
- **WHEN** `AGENT_TITLE_MODEL` is set to `anthropic/claude-haiku-4-5-20250929`
- **THEN** conversation title generation uses that model

#### Scenario: Title model falls back to default
- **WHEN** `AGENT_TITLE_MODEL` is not set
- **THEN** the system uses `anthropic/claude-haiku-4-5-20250929` for title generation

### Requirement: YAML Syntax Validation on Write

The agent's filesystem backend SHALL validate YAML syntax before persisting any file whose path ends in `.yaml` or `.yml`. When the content is not valid YAML, the `write_file` tool MUST return an error describing the syntax issue instead of writing the file to disk. When an `edit_file` operation on a YAML file produces syntactically invalid content, the tool MUST return an error describing the issue so the agent can self-correct.

#### Scenario: write_file with valid YAML succeeds
- **WHEN** the agent invokes `write_file` with a `.yaml` path and syntactically valid YAML content
- **THEN** the file is written to disk as normal
- **AND** the tool returns a success result

#### Scenario: write_file with invalid YAML returns error
- **WHEN** the agent invokes `write_file` with a `.yaml` path and content that is not valid YAML (e.g. bad indentation, unmatched quotes)
- **THEN** the file is NOT written to disk
- **AND** the tool returns an error containing the YAML parse error message
- **AND** the agent can use the error to fix the content and retry

#### Scenario: edit_file producing invalid YAML returns error
- **WHEN** the agent invokes `edit_file` on a `.yaml` file and the resulting content after the edit is not valid YAML
- **THEN** the tool returns an error describing the YAML syntax issue
- **AND** the agent can use the error to correct the edit

#### Scenario: Non-YAML files are not validated
- **WHEN** the agent invokes `write_file` or `edit_file` on a file that does not end in `.yaml` or `.yml` (e.g. `.md`, `.txt`)
- **THEN** no YAML validation is performed
- **AND** the file is written or edited as normal

### Requirement: Move Tool

The deep agent SHALL have access to a `mv` tool that moves a file or directory within the project's sandboxed filesystem. The tool accepts `oldPath` (the current virtual path) and `newPath` (the desired virtual path). Both paths MUST resolve within the project root directory; path traversal attempts SHALL be rejected. Moving onto an existing target SHALL be rejected to prevent accidental overwrites. Symlinks SHALL be rejected.

#### Scenario: Agent moves a semantic model file
- **WHEN** the agent invokes `mv` with `{ "oldPath": "/sales.yaml", "newPath": "/retail/sales.yaml" }`
- **THEN** the file is moved from `sales.yaml` to `retail/sales.yaml` within the project directory
- **AND** the tool returns a success result with both paths

#### Scenario: Agent moves a dataset file
- **WHEN** the agent invokes `mv` with `{ "oldPath": "/sales/orders.yaml", "newPath": "/sales/customer_orders.yaml" }`
- **THEN** the dataset file is moved to the new path
- **AND** the tool returns a success result

#### Scenario: Path traversal rejected
- **WHEN** the agent invokes `mv` with a path containing `..` that would escape the project root
- **THEN** the tool returns an error and no file system changes occur

#### Scenario: Target already exists
- **WHEN** the agent invokes `mv` and `newPath` already exists on disk
- **THEN** the tool returns an error indicating the target already exists
- **AND** the original file remains untouched

#### Scenario: Source not found
- **WHEN** the agent invokes `mv` with an `oldPath` that does not exist
- **THEN** the tool returns a descriptive error

#### Scenario: Symlink rejected
- **WHEN** the agent invokes `mv` on a path that is a symbolic link
- **THEN** the tool returns an error and no move occurs

### Requirement: Semantic Model Visualization Tabs

When a semantic model is selected, the visualization view SHALL display three tabs: YAML Code, Tree, and Graph. The user can switch between tabs freely. The selected tab SHALL persist across model re-selections within the same session.

#### Scenario: YAML Code tab displays model source

- **WHEN** the YAML Code tab is active
- **THEN** the full YAML source of the selected semantic model (root file plus all dataset files assembled) is displayed with syntax highlighting
- **AND** the YAML is read-only (no in-place editing)

#### Scenario: Tree tab displays hierarchical structure

- **WHEN** the Tree tab is active
- **THEN** the complete semantic model is displayed as an expandable tree: model root → datasets (with nested fields), metrics, and relationships
- **AND** hovering over a leaf-level item (field, metric, relationship) displays a tooltip or popover with all properties (expression, data_type, example_data, description, etc.)

#### Scenario: Graph tab displays dataset relationships

- **WHEN** the Graph tab is active
- **THEN** each dataset is rendered as a node in an interactive graph
- **AND** relationships are rendered as directed edges between dataset nodes
- **AND** the user can drag nodes to reposition them
- **AND** the graph supports zoom and pan

#### Scenario: Graph node positions are persisted

- **WHEN** the user drags a dataset node to a new position in the graph
- **THEN** the new x/y coordinates are saved to the dataset's `custom_extensions` array (vendor_name: "archmax") via the API
- **AND** reopening the graph restores nodes to their saved positions

#### Scenario: Graph auto-layout for new models

- **WHEN** a model is opened in the Graph tab and datasets have no saved positions
- **THEN** an automatic layout algorithm positions the nodes
- **AND** the auto-generated positions are saved as custom_extensions

### Requirement: Sidebar Model List

The sidebar Models section SHALL display semantic models as a flat, non-expandable list. Each entry shows the model name. Clicking a model name selects it and opens the visualization view in the main content area. The currently selected model SHALL be visually highlighted. Clicking the selected model again deselects it and returns to the chat view.

#### Scenario: User clicks a model in the sidebar

- **WHEN** the user clicks a model name in the sidebar Models section
- **THEN** the model is highlighted as selected
- **AND** the main content area shows the visualization for that model

#### Scenario: User deselects the active model

- **WHEN** the user clicks the currently selected model name
- **THEN** the model is deselected
- **AND** the main content area returns to the chat message view

#### Scenario: Models listed without expansion

- **WHEN** the sidebar Models section is rendered
- **THEN** each model is displayed as a single row with the model name and a database icon
- **AND** no expand/collapse chevron or subtree is shown

### Requirement: Change Highlighting

When the AI agent modifies a semantic model that is currently being visualized, items that changed SHALL be visually highlighted across all three visualization tabs. Highlights SHALL fade automatically after a brief duration (e.g. 5 seconds) or until the user interacts with the highlighted item.

#### Scenario: Agent adds a new dataset

- **WHEN** the agent creates a new dataset in the currently viewed model
- **THEN** the new dataset node is highlighted in the Graph tab
- **AND** the new dataset entry is highlighted in the Tree tab
- **AND** the added YAML lines are highlighted in the YAML Code tab

#### Scenario: Agent modifies a field

- **WHEN** the agent changes a field's expression or data_type in the currently viewed model
- **THEN** the modified field is highlighted in the Tree tab
- **AND** the changed YAML lines are highlighted in the YAML Code tab

#### Scenario: Highlights fade over time

- **WHEN** a change highlight is displayed
- **THEN** the highlight fades out after approximately 5 seconds
- **AND** the item returns to its normal visual state

### Requirement: Validated Query Generation

After writing datasets and model-level entities (relationships, metrics), the semantic model agent SHALL generate validated queries for both individual datasets and the model as a whole. All validated queries MUST use the DuckDB SQL dialect exclusively — PostgreSQL, MySQL, SQL Server, and any other dialect-specific syntax SHALL NOT be used, even when the underlying source database uses one of those engines. The agent SHALL follow this process:

1. For each dataset, compose 2–5 DuckDB SQL queries that demonstrate common access patterns: simple lookups, filtered aggregations, and usage of enum/time-dimension columns.
2. For the model root, compose 2–5 DuckDB SQL queries that demonstrate cross-dataset joins using declared relationships and metric expressions.
3. Execute each query via `executeQuery` to confirm it returns results without error.
4. Store only queries that execute successfully as `validated_queries` entries within the COMMON custom extension on the respective dataset or model root file.
5. Each entry SHALL have a `description` (plain-language summary of what the query answers) and `query` (the exact DuckDB SQL that was executed). The `query` value MUST contain only DuckDB-compatible SQL syntax.

The agent SHALL skip query generation if the user explicitly opts out or if no connections are active for the project.

#### Scenario: Agent generates dataset-level validated queries

- **WHEN** the agent finishes writing a dataset with fields including a time dimension and an enum column
- **THEN** the agent composes queries such as a count by enum value and a time-series aggregation
- **AND** each query is executed via `executeQuery` to verify it succeeds
- **AND** successful queries are written into the dataset's COMMON custom extension under `validated_queries`

#### Scenario: Agent generates model-level validated queries

- **WHEN** the agent finishes writing relationships and metrics for a model
- **THEN** the agent composes queries that join multiple datasets and use metric expressions
- **AND** each query is executed via `executeQuery` to verify it succeeds
- **AND** successful queries are written into the model root file's COMMON custom extension under `validated_queries`

#### Scenario: Query execution fails

- **WHEN** a proposed validated query fails execution (syntax error, missing table, etc.)
- **THEN** the agent does NOT include the failing query in validated_queries
- **AND** the agent may attempt to fix and re-run the query once before discarding it

#### Scenario: Validated queries use DuckDB SQL dialect only

- **WHEN** the agent generates validated queries for a dataset or model connected to a PostgreSQL, MySQL, or other non-DuckDB source
- **THEN** all queries use DuckDB SQL syntax exclusively (e.g. `strftime` instead of `TO_CHAR`, `UNNEST(from_json(...))` instead of `json_array_elements`)
- **AND** no PostgreSQL-only, MySQL-only, or other dialect-specific functions or syntax appear in the stored `query` values

#### Scenario: User opts out of query generation

- **WHEN** the user says "skip queries" or "don't generate queries"
- **THEN** the agent writes the model without validated_queries entries

### Requirement: Copy Tool

The deep agent SHALL have access to a `cp` tool that copies a file or directory within the project's sandboxed filesystem. The tool accepts `srcPath` (the source virtual path) and `destPath` (the destination virtual path), and an optional `recursive` flag for directory copies. Both paths MUST resolve within the project root directory; path traversal attempts SHALL be rejected. Copying onto an existing target SHALL be rejected to prevent accidental overwrites. Symlinks SHALL be rejected.

#### Scenario: Agent copies a semantic model file
- **WHEN** the agent invokes `cp` with `{ "srcPath": "/sales.yaml", "destPath": "/sales_backup.yaml" }`
- **THEN** the file is copied from `sales.yaml` to `sales_backup.yaml` within the project directory
- **AND** the original file remains unchanged
- **AND** the tool returns a success result with both paths

#### Scenario: Agent copies a dataset directory
- **WHEN** the agent invokes `cp` with `{ "srcPath": "/sales", "destPath": "/sales_v2", "recursive": true }`
- **THEN** the directory and all its contents are copied to the new path
- **AND** the original directory remains unchanged

#### Scenario: Directory copy without recursive flag rejected
- **WHEN** the agent invokes `cp` on a directory without setting `recursive` to true
- **THEN** the tool returns an error indicating the source is a directory and recursive must be set

#### Scenario: Path traversal rejected
- **WHEN** the agent invokes `cp` with a path containing `..` that would escape the project root
- **THEN** the tool returns an error and no file system changes occur

#### Scenario: Target already exists
- **WHEN** the agent invokes `cp` and `destPath` already exists on disk
- **THEN** the tool returns an error indicating the target already exists
- **AND** no files are modified

#### Scenario: Source not found
- **WHEN** the agent invokes `cp` with a `srcPath` that does not exist
- **THEN** the tool returns a descriptive error

#### Scenario: Symlink rejected
- **WHEN** the agent invokes `cp` on a path that is a symbolic link
- **THEN** the tool returns an error and no copy occurs

### Requirement: Create Test Case Tool

The deep agent SHALL have access to a `create_test_case` tool that creates a test case document in MongoDB for the current project. The tool accepts `title` (string, required), `semanticModel` (string, required), `inputMessage` (string, required), `expectedFacts` (array of strings, min 1), and `testAgentId` (string, optional). When `testAgentId` is provided, the tool SHALL validate that the referenced test agent exists and belongs to the current project before creating the test case. If the agent does not exist or belongs to a different project, the tool SHALL return an error. When `testAgentId` is omitted, the test case SHALL be created without an assigned agent (existing behavior).

The tool SHALL automatically add "auto-generated" to the test case's `tags` array so that auto-generated cases are distinguishable from manually created ones.

The agent's system prompt SHALL document the tool and instruct the agent to only create test cases when the user explicitly provides ground-truth facts or expected answers. The agent SHALL NOT invent expected facts from its own data exploration or query results. Before creating test cases, the agent SHALL call `list_test_agents` to check for available agents and present the options to the user. If agents exist, the agent SHALL ask the user which agent to assign. If no agents exist, the agent SHALL proceed without assignment and inform the user.

#### Scenario: Agent creates a test case with an assigned agent

- **WHEN** the agent has called `list_test_agents` and the user selects agent "GPT-4o Agent" (id: "abc123")
- **AND** the user provides ground-truth facts
- **AND** the agent invokes `create_test_case` with `{ "title": "Total revenue 2024", "semanticModel": "ecommerce", "inputMessage": "What is the total revenue for 2024?", "expectedFacts": ["Total revenue for 2024 is 1.65 MEUR"], "testAgentId": "abc123" }`
- **THEN** a TestCase document is created with `testAgent` set to the referenced agent
- **AND** the `tags` array contains "auto-generated"

#### Scenario: Agent creates a test case without an agent when none exist

- **WHEN** the agent has called `list_test_agents` and the result is empty
- **AND** the user provides ground-truth facts
- **AND** the agent invokes `create_test_case` without `testAgentId`
- **THEN** a TestCase document is created with `testAgent` set to null
- **AND** the agent informs the user that a test agent can be assigned later through the Testing UI

#### Scenario: Invalid test agent ID rejected

- **WHEN** the agent invokes `create_test_case` with a `testAgentId` that does not exist or belongs to a different project
- **THEN** the tool returns an error indicating the test agent was not found
- **AND** no TestCase document is created

#### Scenario: Agent does not create test cases without user-provided facts

- **WHEN** the agent has finished writing a semantic model
- **AND** the user has not provided any ground-truth facts or expected answers
- **THEN** the agent SHALL NOT invoke `create_test_case` on its own
- **AND** the agent MAY suggest creating test cases and ask the user to supply expected answers

#### Scenario: Invalid input rejected

- **WHEN** the agent invokes `create_test_case` with an empty `expectedFacts` array
- **THEN** the tool returns an error indicating at least one expected fact is required
- **AND** no TestCase document is created

#### Scenario: Auto-generated tag always present

- **WHEN** the agent invokes `create_test_case` for any test case
- **THEN** the resulting TestCase always includes "auto-generated" in its `tags` array regardless of any other tags provided

### Requirement: Auto-Create Dataset Groups

The semantic model agent SHALL auto-create dataset groups when assembling a semantic model. Groups SHALL be written to the model root file's `custom_extensions` under vendor `COMMON` with a `dataset_groups` key. The agent SHALL identify logical groups based on schema prefixes (e.g. `hr_*`, `sales_*`), star-schema topology (fact + dimensions as a group), or explicit business domain boundaries. Each group SHALL contain 2–6 datasets with a descriptive name. Colors SHALL be assigned from the available palette, cycling through options.

#### Scenario: Star-schema grouping

- **WHEN** the agent builds a model containing `orders`, `order_items`, `customers`, `products`, and `warehouses`
- **AND** `orders` and `order_items` share a relationship, and `customers` joins to `orders`
- **THEN** the agent creates a group like `{"id":"grp_...","name":"Order Management","datasets":["orders","order_items","customers"]}`
- **AND** `products` and `warehouses` are placed in a separate group like "Inventory"

#### Scenario: Schema-prefix grouping

- **WHEN** the agent encounters datasets named `hr_employees`, `hr_departments`, `hr_salaries`, `fin_invoices`, `fin_payments`
- **THEN** the agent creates groups "HR" containing `hr_employees`, `hr_departments`, `hr_salaries` and "Finance" containing `fin_invoices`, `fin_payments`

#### Scenario: Single-domain model

- **WHEN** all datasets belong to the same business domain and there are fewer than 6 datasets
- **THEN** the agent MAY omit groups or create a single group if it aids readability

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

### Requirement: List Test Agents Tool

The deep agent SHALL have access to a `list_test_agents` tool that returns all non-deleted test agents for the current project. The tool accepts no parameters. It SHALL return a JSON array of objects, each containing `id` (string), `name` (string), `semanticModels` (array of strings), and `llmModel` (string). The API key and system prompt SHALL NOT be included in the response.

The agent's system prompt SHALL document the tool and instruct the agent to call `list_test_agents` before creating test cases so it can offer the user the option to assign an existing agent. If no agents exist, the agent SHALL inform the user that test cases will be created without an assigned agent and suggest creating one through the Testing UI.

#### Scenario: Agent lists test agents for the project

- **WHEN** the agent invokes `list_test_agents`
- **AND** the project has two non-deleted test agents
- **THEN** the tool returns a JSON array with two entries, each containing `id`, `name`, `semanticModels`, and `llmModel`
- **AND** no API key or system prompt data is included

#### Scenario: No test agents exist

- **WHEN** the agent invokes `list_test_agents`
- **AND** the project has no test agents
- **THEN** the tool returns an empty JSON array
- **AND** the agent informs the user that test cases will be created without an assigned agent

### Requirement: List Test Cases Tool

The deep agent SHALL have access to a `list_test_cases` tool that returns existing test cases for the current project. The tool accepts an optional `semanticModel` parameter to filter results by model name. It SHALL return a JSON array of objects, each containing `id` (string), `title` (string), `semanticModel` (string), `inputMessage` (string), `expectedFactsCount` (number), `tags` (array of strings), and `testAgent` (object with `id` and `name`, or null). The agent's system prompt SHALL instruct the agent to call `list_test_cases` before creating new test cases to review existing coverage and avoid duplicates.

#### Scenario: Agent lists test cases for a semantic model

- **WHEN** the agent invokes `list_test_cases` with `{ "semanticModel": "ecommerce" }`
- **AND** the project has three test cases for "ecommerce" and two for "hr"
- **THEN** the tool returns a JSON array with only the three "ecommerce" test cases

#### Scenario: Agent lists all test cases

- **WHEN** the agent invokes `list_test_cases` without a `semanticModel` filter
- **THEN** the tool returns all non-deleted test cases for the project

#### Scenario: No test cases exist

- **WHEN** the agent invokes `list_test_cases`
- **AND** the project has no test cases
- **THEN** the tool returns an empty JSON array

### Requirement: Delete Test Case Tool

The deep agent SHALL have access to a `delete_test_case` tool that soft-deletes a test case by ID. The tool accepts `testCaseId` (string, required). It SHALL validate that the test case exists and belongs to the current project before deleting. If the test case does not exist or belongs to a different project, the tool SHALL return an error. On success, the tool SHALL return the deleted test case's ID and title. The agent's system prompt SHALL instruct the agent to use `list_test_cases` first to find the ID before deleting.

#### Scenario: Agent deletes a test case

- **WHEN** the agent invokes `delete_test_case` with a valid `testCaseId` belonging to the current project
- **THEN** the test case is soft-deleted
- **AND** the tool returns the deleted test case's ID and title

#### Scenario: Test case not found

- **WHEN** the agent invokes `delete_test_case` with a `testCaseId` that does not exist or belongs to a different project
- **THEN** the tool returns an error indicating the test case was not found
- **AND** no test case is deleted

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

