## MODIFIED Requirements
### Requirement: DuckDB Federation

The system SHALL maintain a DuckDB instance per project that attaches all active connections as named schemas, enabling cross-connection SQL queries. When the owning project has `ensureReadonly: true`, connections MUST be attached with the `READ_ONLY` flag. When `ensureReadonly: false`, connections SHALL be attached without the `READ_ONLY` flag.

#### Scenario: Attach a postgres connection (readonly project)

- **WHEN** a postgres connection is activated within a project that has `ensureReadonly: true`
- **THEN** the connection is attached to the project's DuckDB instance via the `postgres_scanner` extension with the `READ_ONLY` flag using the connection's name as the schema alias

#### Scenario: Attach a postgres connection (writable project)

- **WHEN** a postgres connection is activated within a project that has `ensureReadonly: false`
- **THEN** the connection is attached to the project's DuckDB instance via the `postgres_scanner` extension without the `READ_ONLY` flag

#### Scenario: Attach a mysql connection

- **WHEN** a mysql connection is activated within a project
- **THEN** the connection is attached via the `mysql_scanner` extension

#### Scenario: Remove connection from DuckDB

- **WHEN** a connection is soft-deleted or deactivated
- **THEN** the corresponding schema is detached from the project's DuckDB instance

#### Scenario: Lazy initialization

- **WHEN** the first query is made against a project's DuckDB instance
- **THEN** the DuckDB instance is created and all active connections are attached
- **AND** subsequent queries reuse the existing instance

#### Scenario: Readonly setting change invalidates DuckDB instance

- **WHEN** a project's `ensureReadonly` setting is toggled
- **THEN** the existing DuckDB instance for that project is destroyed
- **AND** the next query triggers re-creation with the new attachment mode
