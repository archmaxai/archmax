## ADDED Requirements

### Requirement: Periodic Data Polling
The frontend SHALL periodically refetch dynamic data using TanStack Query's `refetchInterval` option. Each query SHALL define its polling interval inline, colocated with its query configuration. No shared polling config module is required.

The following queries SHALL poll at regular intervals:
- **Projects list** (`["projects"]`) — 30 seconds
- **Single project** (`["project", projectId]`) — 30 seconds
- **Connections list** (`["connections", projectId]`) — 30 seconds
- **Semantic models list** (`["semantic-models", projectId]`) — 10 seconds
- **Conversations list** (`["conversations", projectId]`) — 10 seconds
- **Single conversation** (`["conversation", conversationId]`) — 10 seconds

Semantic models and conversations use a shorter interval because they change frequently during active agent sessions (file writes, async title generation).

#### Scenario: Conversation title appears after async generation
- **WHEN** the user starts a new conversation and the title is generated asynchronously
- **THEN** the conversations list updates to show the generated title within the polling interval
- **AND** no manual refresh is required

#### Scenario: Semantic model changes reflected during agent session
- **WHEN** the AI agent writes or modifies a semantic model YAML file
- **THEN** the semantic models list in the explorer updates within the polling interval
- **AND** the user sees the changes without navigating away

#### Scenario: New project appears in selector
- **WHEN** a project is created in another tab or session
- **THEN** the project selector dropdown includes the new project within the polling interval

#### Scenario: Connection status updates
- **WHEN** a connection is created or modified outside the current view
- **THEN** the connections list reflects the change within the polling interval
