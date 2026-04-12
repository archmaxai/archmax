## MODIFIED Requirements

### Requirement: Connection List View

The Data Connections page SHALL display a list of all connections for the selected project. Each connection shows its name, slug (monospace), type (badge), description (truncated teaser, or a muted "No description" placeholder if empty), and active status.

#### Scenario: List connections for a project

- **WHEN** the user navigates to `/<projectId>/connections`
- **THEN** all non-deleted connections for that project are listed
- **AND** each connection displays its name, slug in monospace, type badge, description teaser, and status

#### Scenario: Empty state

- **WHEN** a project has no connections
- **THEN** an empty state message is shown with a prompt to create the first connection

#### Scenario: Connection with description

- **WHEN** a connection has a non-empty description
- **THEN** the description column shows a truncated teaser of the description text

#### Scenario: Connection without description

- **WHEN** a connection has an empty or missing description
- **THEN** the description column shows a muted "No description" placeholder
