## MODIFIED Requirements
### Requirement: Chat Interface

The Semantic Models page SHALL render a chat interface where the user can converse with an AI agent to create, edit, and explore semantic models for the selected project. Assistant messages SHALL be rendered as markdown with support for headings, lists, code blocks (with language label and copy button), bold, italic, tables, blockquotes, links, and horizontal rules. User messages SHALL remain plain text.

When no messages are present, the empty state SHALL display a set of example prompts as clickable buttons arranged in a responsive grid (2 columns on sm+ screens, 1 column on mobile). Each button SHALL show an arrow prefix (`→`) followed by the prompt text. Clicking an example prompt SHALL prefill the chat input with the prompt text and focus the input field without auto-sending.

When a semantic model is selected in the sidebar, the chat message area SHALL be replaced by a three-tab visualization view of the selected model. The chat input text field SHALL remain visible at the bottom at all times, continuing the active conversation or starting a new one if no conversation is selected. Dismissing the visualization (via close button or deselecting the model) SHALL restore the chat message view.

#### Scenario: User sends a message

- **WHEN** the user types a message and presses Enter or clicks Send
- **THEN** the message is displayed in the chat area
- **AND** the message is sent to the backend agent endpoint
- **AND** the agent's response streams in real-time via SSE

#### Scenario: Agent response with file changes

- **WHEN** the agent creates or modifies a YAML semantic model file
- **THEN** the agent's response describes the changes made
- **AND** the changes are persisted to disk in the project's data directory

#### Scenario: User selects a model from the sidebar

- **WHEN** the user clicks a semantic model name in the sidebar
- **THEN** the chat message area is replaced by the semantic model visualization
- **AND** the chat input remains at the bottom of the page
- **AND** the user can continue sending messages to the agent

#### Scenario: User dismisses the visualization

- **WHEN** the user clicks the close button on the visualization or clicks the same model name again
- **THEN** the visualization is hidden
- **AND** the chat message history reappears

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

#### Scenario: User clicks an example prompt

- **WHEN** the chat is empty and the user clicks an example prompt button
- **THEN** the prompt text is inserted into the chat input field
- **AND** the chat input is focused with the cursor at the end
- **AND** the message is NOT automatically sent

#### Scenario: Example prompts hidden after first message

- **WHEN** the user sends a message (directly or after selecting an example prompt)
- **THEN** the example prompt grid is no longer visible
- **AND** the chat shows the message history instead
