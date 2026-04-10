## MODIFIED Requirements

### Requirement: Testing UI — Playground Page

The frontend SHALL provide a Playground page at `/$projectId/testing/playground` with a test agent selector and a chat interface. The chat interface SHALL reuse the existing chat components (`AgentChat`, `ToolCallCard`, `ChatInput`, `MarkdownContent`) adapted to work with playground conversations. The sidebar SHALL show past playground conversations for the selected test agent. Tool calls (list_semantic_models, get_semantic_model_overview, get_dataset_fields, execute_query) SHALL be rendered with the same card-based visualization as the semantic model builder. The playground conversation list API response SHALL include an `isStreaming` boolean per item. The sidebar SHALL display an animated spinner icon instead of the static message icon for conversations that are actively streaming, matching the behavior of the Semantic Models chat sidebar.

#### Scenario: Select a test agent and start chatting

- **WHEN** the user selects a test agent from the dropdown
- **THEN** past playground conversations for that agent are shown in the sidebar
- **AND** the user can start a new conversation or resume an existing one

#### Scenario: Tool calls displayed in playground

- **WHEN** the playground agent invokes `execute_query`
- **THEN** the tool call card shows the SQL query with syntax highlighting and result table (same as semantic model builder)

#### Scenario: Switch test agent

- **WHEN** the user selects a different test agent from the dropdown
- **THEN** the conversation history updates to show only conversations for the newly selected agent
- **AND** a new chat session is started (no conversation pre-selected)

#### Scenario: Active streaming conversation shown in playground sidebar

- **WHEN** a playground conversation has an active streaming session
- **AND** the user views the playground sidebar
- **THEN** the sidebar entry for that conversation displays an animated spinning icon instead of the static message icon
- **AND** the icon reverts to the static message icon once streaming completes and the next poll cycle refreshes the list
