# project-management Specification

## Purpose
Top-level organizational unit for grouping connections, semantic models, and DuckDB federation instances. Projects provide multi-tenant isolation and cascading lifecycle management with soft-delete semantics.
## Requirements
### Requirement: Project Model

The system SHALL store projects in MongoDB with the following fields: `title` (string, required), `slug` (string, required, matching `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/`), `description` (string, default empty), `mcpPageSize` (number, default 50, min 10, max 200), `github` (optional subdocument: `url` (string, required — full HTTPS URL of the GitHub repository, e.g. `https://github.com/owner/repo.git`), `branch` (string, default `"main"`), `encryptedToken` (string, required — AES-256-GCM encrypted GitHub PAT using `ENCRYPTION_KEY`)), `_schemaVersion` (number, default 0), `createdAt` (Date, auto), `updatedAt` (Date, auto). The previous `github` subdocument fields `owner` and `repo` are removed and replaced by a single `url` field. Slugs SHALL be unique among non-deleted projects and auto-generated from the title on creation.

#### Scenario: Create a project

- **WHEN** a project is created with title "Sales Analytics"
- **THEN** a slug is generated as "sales-analytics"
- **AND** the project is stored with default `mcpPageSize: 50` and no `github`

#### Scenario: Project with GitHub configured

- **WHEN** a project has `github` set with `url: "https://github.com/myorg/semlayer-models.git"`, `branch: "main"`, and an encrypted PAT
- **THEN** publish operations push to that repository
- **AND** sync operations pull from that repository

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

The project settings page SHALL display: a "Project Identity" card with title and slug fields, an "MCP Page Size" input (10–200, no spinner arrows), a "GitHub" card for upstream configuration, a "Publish History" card showing recent commits, and a "Danger Zone" card for project deletion.

The "GitHub" card SHALL contain: a text input for the repository URL (placeholder: `https://github.com/owner/repo.git`), a password input for the Personal Access Token (masked, placeholder: `ghp_...`), a text input for the branch name (default: `main`), a "Save" button to persist the configuration, a "Remove" button to clear the GitHub configuration (shown only when configured), and a "Sync Now" button (shown only when configured) that triggers a pull/merge from the remote. The PAT SHALL be encrypted using `ENCRYPTION_KEY` before storage. The PAT input SHALL show a masked placeholder when a token is already stored (never expose the actual token).

When the project does not yet have Git initialized (determined by `GET /api/projects/:projectId/git/status` returning `initialized: false`), the settings page SHALL display a "Version Control" card with an informational message explaining that this project has not been migrated to Git versioning yet, and a "Initialize Git" button. Clicking the button SHALL call `POST /api/projects/:projectId/git/init`, show a success toast on completion, and replace the migration card with the normal GitHub and Publish History cards. While Git is not initialized, the GitHub card and Publish History card SHALL be hidden (they require a Git repo to function).

The "Publish History" card SHALL display a list of recent commits from the local Git repository (fetched from `GET /api/projects/:projectId/git/log`). Each entry SHALL show the commit message and a human-readable relative timestamp (e.g. "2 hours ago"). The list SHALL show the most recent 10 commits. If the project has no commits yet, the card SHALL display a placeholder message such as "No publish history yet."

#### Scenario: Configure GitHub

- **WHEN** the user enters a repository URL, PAT, and branch in the GitHub card and clicks "Save"
- **THEN** the PAT is encrypted and stored in `github.encryptedToken`
- **AND** the URL and branch are stored in `github.url` and `github.branch`
- **AND** a success toast is shown

#### Scenario: Sync from settings

- **WHEN** the user clicks "Sync Now" in the GitHub card
- **THEN** the system pulls and merges upstream changes
- **AND** on success, a toast shows the sync result
- **AND** on conflict, a toast shows the conflicted file paths

#### Scenario: Remove GitHub configuration

- **WHEN** the user clicks "Remove" in the GitHub card
- **THEN** the `github` subdocument is removed from the project
- **AND** subsequent publishes only create local commits without pushing

#### Scenario: Sync button disabled during operation

- **WHEN** a sync operation is in progress
- **THEN** the "Sync Now" button shows a loading state and is not clickable

#### Scenario: View publish history

- **WHEN** the user views the project settings page for a project with 5 commits
- **THEN** the "Publish History" card lists all 5 commits with messages and relative timestamps
- **AND** the most recent commit appears first

#### Scenario: Empty publish history

- **WHEN** the user views project settings for a project with no commits
- **THEN** the "Publish History" card shows "No publish history yet."

#### Scenario: Existing project without Git shows migration prompt

- **WHEN** the user views project settings for a project that has not been migrated to Git
- **THEN** a "Version Control" card is shown with an explanation and an "Initialize Git" button
- **AND** the GitHub card and Publish History card are hidden

#### Scenario: User migrates project to Git

- **WHEN** the user clicks "Initialize Git" on the migration card
- **THEN** the system initializes a Git repository with all existing files
- **AND** a success toast is shown ("Git repository initialized")
- **AND** the migration card is replaced by the GitHub and Publish History cards

#### Scenario: Migration button shows loading state

- **WHEN** the Git initialization is in progress
- **THEN** the "Initialize Git" button shows a loading state and is not clickable

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

