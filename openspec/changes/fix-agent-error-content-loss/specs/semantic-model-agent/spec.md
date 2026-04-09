## MODIFIED Requirements
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
