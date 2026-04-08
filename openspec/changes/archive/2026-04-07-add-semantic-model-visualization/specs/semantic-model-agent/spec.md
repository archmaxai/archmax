## MODIFIED Requirements

### Requirement: Chat Interface

The Semantic Models page SHALL render a chat interface where the user can converse with an AI agent to create, edit, and explore semantic models for the selected project. Assistant messages SHALL be rendered as markdown with support for headings, lists, code blocks (with language label and copy button), bold, italic, tables, blockquotes, links, and horizontal rules. User messages SHALL remain plain text.

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

## ADDED Requirements

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
