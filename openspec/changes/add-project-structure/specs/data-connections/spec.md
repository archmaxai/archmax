## ADDED Requirements

### Requirement: Connection Model

The system SHALL provide a `Connection` Mongoose model with the following fields: `project` (ObjectId ref to Project, required), `name` (string, required), `type` (enum: postgres, mysql, mssql, sqlite, duckdb, motherduck, other), `connectionConfig` (object with type-specific connection parameters), `description` (string, optional), `isActive` (boolean, default true), `createdAt` (Date), `updatedAt` (Date), `deleted` (boolean, default false), `deletedAt` (Date, optional).

#### Scenario: Create a postgres connection

- **WHEN** a connection is created with `type: "postgres"` and valid connection config (host, port, database, user, password)
- **THEN** a new Connection document is persisted under the specified project

#### Scenario: Unique name within project

- **WHEN** a connection is created with a name that already exists within the same project (among non-deleted connections)
- **THEN** a duplicate key error is returned

#### Scenario: Connection types

- **WHEN** a connection is created with any supported type (postgres, mysql, mssql, sqlite, duckdb, motherduck, other)
- **THEN** the connection is accepted and stored

### Requirement: Connection CRUD API

The API SHALL expose CRUD endpoints for connections at `/api/projects/:projectId/connections`.

#### Scenario: List connections for a project

- **WHEN** a GET request is made to `/api/projects/:projectId/connections`
- **THEN** all non-deleted, active connections for that project are returned

#### Scenario: Create a connection

- **WHEN** a POST request is made to `/api/projects/:projectId/connections` with valid config
- **THEN** the connection is created under the project and returned with status 201

#### Scenario: Update a connection

- **WHEN** a PUT request is made to `/api/projects/:projectId/connections/:id`
- **THEN** the connection is updated and the new version is returned

#### Scenario: Soft-delete a connection

- **WHEN** a DELETE request is made to `/api/projects/:projectId/connections/:id`
- **THEN** the connection is soft-deleted along with its child semantic models, datasets, fields, relationships, and metrics

#### Scenario: Connection not found

- **WHEN** a request targets a non-existent or soft-deleted connection
- **THEN** a 404 error is returned

### Requirement: DuckDB Federation

The system SHALL maintain a DuckDB instance per project that attaches all active connections as named schemas, enabling cross-connection SQL queries.

#### Scenario: Attach a postgres connection

- **WHEN** a postgres connection is activated within a project
- **THEN** the connection is attached to the project's DuckDB instance via the `postgres_scanner` extension using the connection's name as the schema alias

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
