## MODIFIED Requirements

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
