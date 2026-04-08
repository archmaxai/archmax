## ADDED Requirements

### Requirement: Connection List View

The Data Connections page SHALL display a list of all connections for the selected project. Each connection shows its name, type (badge), description, and active status.

#### Scenario: List connections for a project

- **WHEN** the user navigates to `/<projectId>/connections`
- **THEN** all non-deleted connections for that project are listed
- **AND** each connection displays its name, type badge, and status

#### Scenario: Empty state

- **WHEN** a project has no connections
- **THEN** an empty state message is shown with a prompt to create the first connection

### Requirement: Create Connection

The page SHALL provide a button to create a new connection. Clicking it opens a form (dialog or inline) where the user enters connection details: name, type (dropdown), connection config (host, port, database, user, password, or URI), and description.

#### Scenario: Create a new Postgres connection

- **WHEN** the user fills in the form with type "postgres", host, port, database, user, password
- **THEN** a POST request is sent to `/api/projects/:projectId/connections`
- **AND** on success, the new connection appears in the list

#### Scenario: Validation error on create

- **WHEN** the user submits the form with missing required fields
- **THEN** validation errors are displayed inline

### Requirement: Edit Connection

The page SHALL allow editing an existing connection. The user can update the name, type, connection config, description, and active status.

#### Scenario: Edit connection config

- **WHEN** the user modifies a connection's host and saves
- **THEN** a PUT request is sent to `/api/projects/:projectId/connections/:id`
- **AND** the updated connection is reflected in the list

### Requirement: Delete Connection

The page SHALL allow deleting a connection via a confirmation dialog. Deletion is soft-delete.

#### Scenario: Delete a connection

- **WHEN** the user confirms deletion of a connection
- **THEN** a DELETE request is sent to the API
- **AND** the connection is removed from the list

### Requirement: Test Connection

The page SHALL provide a "Test" action for each connection to verify connectivity by running a lightweight query via DuckDB.

#### Scenario: Test a healthy connection

- **WHEN** the user clicks "Test" on an active Postgres connection
- **THEN** the backend attaches the connection to DuckDB and runs `SELECT 1`
- **AND** a success indicator is shown
