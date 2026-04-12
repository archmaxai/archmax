# connection-management-ui Specification

## Purpose
Frontend UI for managing database connections within a project. Provides list, create, edit, delete, and test-connectivity views for the Data Connections page.
## Requirements
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

### Requirement: Create Connection

The page SHALL provide a button to create a new connection. Clicking it opens a form (dialog or inline) where the user enters connection details: name, slug (optional, auto-generated from name if empty), type (dropdown), connection config (host, port, database, user, password, or URI), and description.

#### Scenario: Create a new Postgres connection with explicit slug

- **WHEN** the user fills in the form with name "Shopify Production", slug "shopify_prod", type "postgres", and valid connection config
- **THEN** a POST request is sent to `/api/projects/:projectId/connections` with the provided slug
- **AND** on success, the new connection appears in the list

#### Scenario: Create with auto-generated slug

- **WHEN** the user fills in the form with name "My Analytics DB" and leaves the slug field empty
- **THEN** the slug field shows a preview of the auto-generated slug (e.g. `my_analytics_db`)
- **AND** the POST request includes the auto-generated slug

#### Scenario: Validation error on create

- **WHEN** the user submits the form with missing required fields or an invalid slug
- **THEN** validation errors are displayed inline

### Requirement: Edit Connection

The page SHALL allow editing an existing connection. The user can update the name, type, connection config, description, and active status. The password field SHALL be write-only: it is always shown as empty when editing, and the form SHALL only include password in the request payload when the user explicitly enters a new value.

#### Scenario: Edit connection config
- **WHEN** the user modifies a connection's host and saves
- **THEN** a PUT request is sent to `/api/projects/:projectId/connections/:id`
- **AND** the updated connection is reflected in the list

#### Scenario: Edit without changing password
- **WHEN** the user edits a connection without entering a new password
- **THEN** the PUT request omits the password field (or sends empty)
- **AND** the server preserves the existing stored password

#### Scenario: Edit with new password
- **WHEN** the user enters a new password in the edit form and saves
- **THEN** the PUT request includes the new password
- **AND** the server updates the stored password to the new value

### Requirement: Delete Connection

The page SHALL allow deleting a connection via a confirmation dialog. Deletion is soft-delete.

#### Scenario: Delete a connection

- **WHEN** the user confirms deletion of a connection
- **THEN** a DELETE request is sent to the API
- **AND** the connection is removed from the list

### Requirement: Test Connection

The page SHALL provide a "Test" action for each connection to verify connectivity by running a lightweight query via DuckDB. The "Test Connection" button SHALL be available in both create and edit mode within the connection form dialog. When triggered during creation (before the connection is persisted), the dialog SHALL first save the connection via a POST request; on success it SHALL transition to edit mode with the returned entity and then execute the connectivity test. If the save fails, the test is aborted and validation errors are displayed. When triggered during editing, the test executes immediately against the existing connection (current behavior). The button SHALL be disabled while a save or test operation is in progress and SHALL display a loading indicator.

#### Scenario: Test a healthy connection

- **WHEN** the user clicks "Test" on an active Postgres connection
- **THEN** the backend attaches the connection to DuckDB and runs `SELECT 1`
- **AND** a success indicator is shown

#### Scenario: Test connection during creation

- **WHEN** the user clicks "Test Connection" while creating a new connection and all required fields are filled
- **THEN** the connection is saved via POST first
- **AND** the dialog transitions to edit mode with the newly created connection
- **AND** the connectivity test executes against the saved connection
- **AND** a success or error indicator is shown

#### Scenario: Test connection during creation with validation error

- **WHEN** the user clicks "Test Connection" while creating a new connection with missing or invalid fields
- **THEN** the save fails with validation errors
- **AND** the connectivity test is not attempted
- **AND** the validation errors are displayed inline

#### Scenario: Test connection button disabled during operation

- **WHEN** a save or test operation is in progress
- **THEN** the "Test Connection" button is disabled and shows a loading spinner

### Requirement: File-backed database connection details

For connection types `sqlite` and `duckdb`, when the user selects **Connection Details** (structured fields) rather than **Connection URI**, the form SHALL present a single primary input for the database file path with a clear label (e.g. **Database file path**). The form SHALL NOT display Host, Port, User, or Password fields for these types in Details mode. Shared fields (name, slug, description, schema controls if applicable) SHALL behave as for other types. The **Connection URI** tab SHALL remain available and unchanged.

#### Scenario: SQLite uses path-only details

- **WHEN** the user creates a connection with type `sqlite` and the Connection Details tab
- **THEN** Host, Port, User, and Password inputs are not shown
- **AND** the user enters a file path that is stored in `connectionConfig` such that the backend can attach the database (e.g. `database` holds the path)

#### Scenario: DuckDB file uses path-only details

- **WHEN** the user creates a connection with type `duckdb` and the Connection Details tab
- **THEN** Host, Port, User, and Password inputs are not shown
- **AND** the user enters a file path suitable for DuckDB native attachment

