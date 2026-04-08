## ADDED Requirements

### Requirement: Project Model

The system SHALL provide a `Project` Mongoose model with the following fields: `title` (string, required, unique), `description` (string, optional), `createdAt` (Date), `updatedAt` (Date), `deleted` (boolean, default false), `deletedAt` (Date, optional).

#### Scenario: Create a project

- **WHEN** a project is created with a title
- **THEN** a new Project document is persisted with `deleted: false` and `createdAt`/`updatedAt` set automatically

#### Scenario: Unique title enforcement

- **WHEN** a project is created with a title that already exists (among non-deleted projects)
- **THEN** a duplicate key error is returned

### Requirement: Project CRUD API

The API SHALL expose CRUD endpoints for projects at `/api/projects`.

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

- **WHEN** a PUT request is made to `/api/projects/:id` with partial fields
- **THEN** the project is updated and the new version is returned

#### Scenario: Soft-delete a project

- **WHEN** a DELETE request is made to `/api/projects/:id`
- **THEN** the project's `deleted` flag is set to `true` and `deletedAt` is set to the current timestamp
- **AND** all child connections and their semantic models are cascade soft-deleted

#### Scenario: Project not found

- **WHEN** a GET/PUT/DELETE targets a non-existent or soft-deleted project ID
- **THEN** a 404 error is returned

### Requirement: Soft Delete Plugin

The system SHALL provide a shared Mongoose plugin that adds `deleted` (Boolean, default false) and `deletedAt` (Date) fields to any schema, and automatically filters out soft-deleted documents from `find`, `findOne`, and `countDocuments` queries.

#### Scenario: Default query excludes deleted

- **WHEN** a `find()` query is executed on a model using the soft-delete plugin
- **THEN** documents with `deleted: true` are excluded from results automatically

#### Scenario: Explicit include deleted

- **WHEN** a query explicitly sets `{ deleted: true }` or uses a `withDeleted` option
- **THEN** soft-deleted documents are included in results
