## MODIFIED Requirements

### Requirement: Project Model

The system SHALL provide a `Project` Mongoose model with the following fields: `title` (string, required, unique), `description` (string, optional), `ensureReadonly` (boolean, default `true`), `mcpPageSize` (number, optional, default `50`, min `10`, max `200`), `createdAt` (Date), `updatedAt` (Date), `deleted` (boolean, default false), `deletedAt` (Date, optional).

When `ensureReadonly` is `true` (the default), all SQL queries executed against the project's DuckDB instance MUST be validated as read-only before execution, and external database connections MUST be attached in read-only mode.

When `ensureReadonly` is `false`, application-level SQL validation is skipped and connections are attached without the `READ_ONLY` constraint, allowing write operations through DuckDB.

The `mcpPageSize` field controls how many items per page the MCP tools return when paginating semantic model overviews and dataset fields. When not set, the system SHALL default to `50`.

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

#### Scenario: Default MCP page size

- **WHEN** a project is created without specifying `mcpPageSize`
- **THEN** the project's MCP pagination uses the default of `50` items per page

#### Scenario: Custom MCP page size

- **WHEN** a project is created or updated with `mcpPageSize: 100`
- **THEN** the project's MCP tools paginate at `100` items per page

#### Scenario: MCP page size validation

- **WHEN** a project is created or updated with `mcpPageSize` outside the range `10–200`
- **THEN** a validation error is returned

### Requirement: Project CRUD API

The API SHALL expose CRUD endpoints for projects at `/api/projects`. The `ensureReadonly` and `mcpPageSize` fields SHALL be accepted in create and update payloads and returned in all read responses.

#### Scenario: List projects

- **WHEN** a GET request is made to `/api/projects`
- **THEN** all non-deleted projects are returned sorted by `createdAt` descending
- **AND** each project includes the `ensureReadonly` and `mcpPageSize` fields

#### Scenario: Get a single project

- **WHEN** a GET request is made to `/api/projects/:id`
- **THEN** the project is returned if it exists and is not soft-deleted

#### Scenario: Create a project

- **WHEN** a POST request is made to `/api/projects` with a valid `title`
- **THEN** the project is created and returned with status 201

#### Scenario: Update a project

- **WHEN** a PUT request is made to `/api/projects/:id` with `{ mcpPageSize: 75 }`
- **THEN** the project's `mcpPageSize` is set to `75`
- **AND** subsequent MCP tool calls for this project paginate at `75` items per page

#### Scenario: Soft-delete a project

- **WHEN** a DELETE request is made to `/api/projects/:id`
- **THEN** the project's `deleted` flag is set to `true` and `deletedAt` is set to the current timestamp
- **AND** all child connections and their semantic models are cascade soft-deleted

#### Scenario: Project not found

- **WHEN** a GET/PUT/DELETE targets a non-existent or soft-deleted project ID
- **THEN** a 404 error is returned
