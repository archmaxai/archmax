## MODIFIED Requirements

### Requirement: Project Model

The system SHALL provide a `Project` Mongoose model with the following fields: `title` (string, required, unique), `slug` (string, required, unique, indexed), `description` (string, optional), `mcpPageSize` (number, optional, default `50`, min `10`, max `200`), `createdAt` (Date), `updatedAt` (Date), `deleted` (boolean, default false), `deletedAt` (Date, optional).

The `slug` field SHALL be auto-generated from the `title` on creation by lowercasing, replacing non-alphanumeric characters with hyphens, collapsing consecutive hyphens, and trimming leading/trailing hyphens. If the generated slug collides with an existing project's slug, a numeric suffix SHALL be appended (e.g. `my-project-2`). The slug MAY be manually edited via the update API.

All SQL queries executed against the project's DuckDB instance are always validated as read-only, and external database connections are always attached in read-only mode. There is no per-project toggle for this behavior.

#### Scenario: Create a project with auto-generated slug

- **WHEN** a project is created with title `"My Shopify Store"`
- **THEN** a slug `"my-shopify-store"` is auto-generated
- **AND** the project is persisted with the title, slug, and `deleted: false`

#### Scenario: Slug collision appends suffix

- **WHEN** a project is created with title `"Analytics"` and a project with slug `"analytics"` already exists
- **THEN** the new project receives slug `"analytics-2"`

#### Scenario: Update project slug

- **WHEN** a PUT request updates the slug to `"store-prod"`
- **THEN** the project's slug is updated if the new slug is unique and valid

#### Scenario: Unique title enforcement

- **WHEN** a project is created with a title that already exists (among non-deleted projects)
- **THEN** a duplicate key error is returned

### Requirement: Project CRUD API

The API SHALL expose CRUD endpoints for projects at `/api/projects`. The `mcpPageSize` field SHALL be accepted in create and update payloads and returned in all read responses.

#### Scenario: List projects

- **WHEN** a GET request is made to `/api/projects`
- **THEN** all non-deleted projects are returned sorted by `createdAt` descending

#### Scenario: Get a single project

- **WHEN** a GET request is made to `/api/projects/:id`
- **THEN** the project is returned if it exists and is not soft-deleted

#### Scenario: Create a project

- **WHEN** a POST request is made to `/api/projects` with a valid `title`
- **THEN** the project is created and returned with status 201

#### Scenario: Update a project

- **WHEN** a PUT request is made to `/api/projects/:id` with `{ mcpPageSize: 100 }`
- **THEN** the project's `mcpPageSize` is updated

#### Scenario: Soft-delete a project

- **WHEN** a DELETE request is made to `/api/projects/:id`
- **THEN** the project's `deleted` flag is set to `true` and `deletedAt` is set to the current timestamp
- **AND** all child connections and their semantic models are cascade soft-deleted

#### Scenario: Project not found

- **WHEN** a GET/PUT/DELETE targets a non-existent or soft-deleted project ID
- **THEN** a 404 error is returned

