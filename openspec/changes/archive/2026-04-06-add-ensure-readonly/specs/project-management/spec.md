## MODIFIED Requirements
### Requirement: Project Model

The system SHALL provide a `Project` Mongoose model with the following fields: `title` (string, required, unique), `description` (string, optional), `ensureReadonly` (boolean, default `true`), `createdAt` (Date), `updatedAt` (Date), `deleted` (boolean, default false), `deletedAt` (Date, optional).

When `ensureReadonly` is `true` (the default), all SQL queries executed against the project's DuckDB instance MUST be validated as read-only before execution, and external database connections MUST be attached in read-only mode.

When `ensureReadonly` is `false`, application-level SQL validation is skipped and connections are attached without the `READ_ONLY` constraint, allowing write operations through DuckDB.

#### Scenario: Create a project with default ensureReadonly

- **WHEN** a project is created with a title and no `ensureReadonly` value
- **THEN** a new Project document is persisted with `ensureReadonly: true`, `deleted: false`, and `createdAt`/`updatedAt` set automatically

#### Scenario: Create a project with ensureReadonly disabled

- **WHEN** a project is created with `ensureReadonly: false`
- **THEN** the project is persisted with `ensureReadonly: false`
- **AND** queries against this project's DuckDB instance are not subject to read-only validation

#### Scenario: Unique title enforcement

- **WHEN** a project is created with a title that already exists (among non-deleted projects)
- **THEN** a duplicate key error is returned

### Requirement: Project CRUD API

The API SHALL expose CRUD endpoints for projects at `/api/projects`. The `ensureReadonly` field SHALL be accepted in create and update payloads and returned in all read responses.

#### Scenario: List projects

- **WHEN** a GET request is made to `/api/projects`
- **THEN** all non-deleted projects are returned sorted by `createdAt` descending
- **AND** each project includes the `ensureReadonly` field

#### Scenario: Get a single project

- **WHEN** a GET request is made to `/api/projects/:id`
- **THEN** the project is returned if it exists and is not soft-deleted

#### Scenario: Create a project

- **WHEN** a POST request is made to `/api/projects` with a valid `title`
- **THEN** the project is created and returned with status 201

#### Scenario: Update a project

- **WHEN** a PUT request is made to `/api/projects/:id` with `{ ensureReadonly: false }`
- **THEN** the project's `ensureReadonly` is set to `false`
- **AND** subsequent DuckDB queries for this project skip read-only validation

#### Scenario: Soft-delete a project

- **WHEN** a DELETE request is made to `/api/projects/:id`
- **THEN** the project's `deleted` flag is set to `true` and `deletedAt` is set to the current timestamp
- **AND** all child connections and their semantic models are cascade soft-deleted

#### Scenario: Project not found

- **WHEN** a GET/PUT/DELETE targets a non-existent or soft-deleted project ID
- **THEN** a 404 error is returned
