## ADDED Requirements

### Requirement: Re-explore Schemas Control

The Data Sources page header SHALL display a "Re-explore schemas" button alongside the "New Connection" button. Activating the button SHALL trigger a project-wide refresh that invalidates the cached DuckDB instance and re-attaches every active connection so the data browser, semantic-model agent, and MCP tools observe the current upstream schema. While the refresh is in flight, the button SHALL be disabled and display a loading spinner. On success, the page SHALL show a success toast including the number of tables visible after the refresh (e.g. `Schemas refreshed — 42 tables visible`) and SHALL invalidate the cached connection list query. On failure, the page SHALL show an error toast containing the server-provided error message. When the project has no connections, the button SHALL be disabled.

#### Scenario: Refresh schemas with attached connections

- **WHEN** the user clicks "Re-explore schemas" on a project that has at least one active connection
- **THEN** a `POST` request is sent to `/api/projects/:projectId/connections/reinit`
- **AND** while the request is pending the button is disabled and shows a spinner
- **AND** on a successful response `{ ok: true, tableCount: N }` a success toast displays `Schemas refreshed — N tables visible`
- **AND** the `["connections", projectId]` query cache is invalidated

#### Scenario: Refresh fails when a connection is unreachable

- **WHEN** the user clicks "Re-explore schemas" and the server returns `{ ok: false, error: "..." }` with HTTP 400
- **THEN** an error toast displays the server-provided error message
- **AND** the button returns to its idle state

#### Scenario: Button disabled when there are no connections

- **WHEN** the project has no active connections
- **THEN** the "Re-explore schemas" button is rendered in a disabled state so it cannot be activated
