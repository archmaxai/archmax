# project-management Specification

## Purpose
Top-level organizational unit for grouping connections, semantic models, and DuckDB federation instances. Projects provide multi-tenant isolation and cascading lifecycle management with soft-delete semantics.
## Requirements
### Requirement: Project Model

The system SHALL provide a `Project` Mongoose model with the following fields: `title` (string, required, unique), `slug` (string, required, unique, indexed), `description` (string, optional), `ensureReadonly` (boolean, default `true`), `mcpPageSize` (number, default 50, min 10, max 200), `github` (optional subdocument with `owner` string, `repo` string, `branch` string default `"main"`, `encryptedToken` string), `createdAt` (Date), `updatedAt` (Date), `deleted` (boolean, default false), `deletedAt` (Date, optional).

The `slug` field SHALL be auto-generated from the `title` on creation by lowercasing, replacing non-alphanumeric characters with hyphens, collapsing consecutive hyphens, and trimming leading/trailing hyphens. If the generated slug collides with an existing project's slug, a numeric suffix SHALL be appended (e.g. `my-project-2`). The slug MAY be manually edited via the update API.

When `ensureReadonly` is `true` (the default), all SQL queries executed against the project's DuckDB instance MUST be validated as read-only before execution, and external database connections MUST be attached in read-only mode.

When `ensureReadonly` is `false`, application-level SQL validation is skipped and connections are attached without the `READ_ONLY` constraint, allowing write operations through DuckDB.

The `github` subdocument stores the GitHub OAuth integration state. The `owner` field stores the authenticated GitHub username. The `encryptedToken` field stores an AES-256-GCM encrypted OAuth access token. The plain-text token SHALL never be persisted or returned via API responses.

#### Scenario: Create a project with auto-generated slug

- **WHEN** a project is created with title `"My Shopify Store"`
- **THEN** a slug `"my-shopify-store"` is auto-generated
- **AND** the project is persisted with the title, slug, `ensureReadonly: true`, and `deleted: false`

#### Scenario: Slug collision appends suffix

- **WHEN** a project is created with title `"Analytics"` and a project with slug `"analytics"` already exists
- **THEN** the new project receives slug `"analytics-2"`

#### Scenario: Update project slug

- **WHEN** a PUT request updates the slug to `"store-prod"`
- **THEN** the project's slug is updated if the new slug is unique and valid

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

#### Scenario: GitHub OAuth connection stored on project

- **WHEN** a GitHub OAuth flow completes successfully for a project
- **THEN** the `github.owner` is set to the authenticated GitHub username
- **AND** the `github.encryptedToken` is stored as an AES-256-GCM encrypted value
- **AND** the plain-text token is not persisted

#### Scenario: Read project with GitHub connected

- **WHEN** a GET request retrieves a project with GitHub settings
- **THEN** the response includes `github.owner`, `github.repo`, and `github.branch`
- **AND** the response includes `github.connected: true`
- **AND** the encrypted token is never included in the response

#### Scenario: Disconnect GitHub

- **WHEN** a DELETE request is made to the GitHub disconnect endpoint for a project
- **THEN** the `github` subdocument is removed from the project
- **AND** subsequent publishes do not attempt GitHub push

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

### Requirement: Delete Project UI

The settings page (`/$projectId/settings`) SHALL display a "Danger Zone" card at the bottom of the page containing a destructive "Delete project" button.

When the user clicks the delete button, a confirmation dialog SHALL appear. The dialog SHALL require the user to type the exact project name into a text input before the delete action is enabled. The confirmation button SHALL remain disabled until the typed text matches the project title exactly (case-sensitive).

Upon confirmation, the system SHALL call `DELETE /api/projects/:id` to soft-delete the project with cascading deletes to connections and MCP tokens. On success, the user SHALL be redirected to the root project list (`/`) and a success toast SHALL be shown. On failure, an error toast SHALL be displayed and the dialog SHALL remain open.

#### Scenario: Delete button appears in danger zone

- **WHEN** the user opens the settings page for a project
- **THEN** a "Danger Zone" card is displayed below all other settings cards
- **AND** the card contains a destructive "Delete project" button

#### Scenario: Confirmation dialog requires project name

- **WHEN** the user clicks "Delete project"
- **THEN** a confirmation dialog appears asking the user to type the project name
- **AND** the confirm button is disabled until the input matches the project title exactly

#### Scenario: Successful project deletion

- **WHEN** the user types the correct project name and confirms deletion
- **THEN** the project is soft-deleted via `DELETE /api/projects/:id`
- **AND** the user is redirected to `/`
- **AND** a success toast is displayed

#### Scenario: Failed project deletion

- **WHEN** the delete API call fails
- **THEN** an error toast is displayed with the failure reason
- **AND** the dialog remains open for retry

