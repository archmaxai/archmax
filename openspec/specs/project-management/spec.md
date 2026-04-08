# project-management Specification

## Purpose
Top-level organizational unit for grouping connections, semantic models, and DuckDB federation instances. Projects provide multi-tenant isolation and cascading lifecycle management with soft-delete semantics.
## Requirements
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

### Requirement: Soft Delete Plugin

The system SHALL provide a shared Mongoose plugin that adds `deleted` (Boolean, default false) and `deletedAt` (Date) fields to any schema, and automatically filters out soft-deleted documents from `find`, `findOne`, and `countDocuments` queries.

#### Scenario: Default query excludes deleted

- **WHEN** a `find()` query is executed on a model using the soft-delete plugin
- **THEN** documents with `deleted: true` are excluded from results automatically

#### Scenario: Explicit include deleted

- **WHEN** a query explicitly sets `{ deleted: true }` or uses a `withDeleted` option
- **THEN** soft-deleted documents are included in results

### Requirement: Project Settings UI

The settings page (`/$projectId/settings`) SHALL display a "Project Identity" card that allows editing the project's `title` and `slug`. The card SHALL appear above the existing settings cards.

The title field SHALL be a text input pre-filled with the current project title. On blur or Enter, the system SHALL save the updated title via the project update API.

The slug field SHALL be a text input pre-filled with the current project slug. It SHALL be validated client-side against the pattern `^[a-z0-9][a-z0-9-]*[a-z0-9]$` (minimum 2 characters). On blur or Enter, the system SHALL save the updated slug via the project update API if valid.

When the title is changed, the slug field SHALL display an auto-generated slug suggestion (derived from the new title), but the user MAY override it before saving.

The MCP Items Per Page input SHALL NOT render browser-native spinner buttons (up/down arrows). The input SHALL accept only numeric values and behave as a plain text field with numeric constraints.

#### Scenario: Edit project title

- **WHEN** the user changes the title field to "My New Name" and presses Enter
- **THEN** a PUT request updates the project title
- **AND** the sidebar project selector reflects the new name

#### Scenario: Edit project slug

- **WHEN** the user changes the slug field to "my-new-slug" and blurs the input
- **THEN** a PUT request updates the project slug if the format is valid and the slug is unique

#### Scenario: Invalid slug rejected client-side

- **WHEN** the user enters a slug with uppercase letters or special characters (e.g. "My Slug!")
- **THEN** the input shows a validation error
- **AND** the value is not submitted to the API

#### Scenario: Title change suggests new slug

- **WHEN** the user edits the title from "Old Name" to "New Name"
- **THEN** the slug field updates to "new-name" as a suggestion
- **AND** the user can accept or further edit the slug before saving

#### Scenario: MCP page size input has no spinner buttons

- **WHEN** the settings page renders the MCP Items Per Page input
- **THEN** no browser-native increment/decrement spinner arrows are visible
- **AND** the input still accepts numeric values via keyboard

