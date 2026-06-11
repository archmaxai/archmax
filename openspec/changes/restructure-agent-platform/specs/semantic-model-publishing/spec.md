## MODIFIED Requirements

### Requirement: Publish Event Model

The system SHALL provide a `PublishEvent` Mongoose model with: `project` (ObjectId ref to Project, required, indexed), `message` (string, required — user-provided publish message), `modelNames` (string array — names of models included in the publish), `contentHash` (string — SHA-256 hash of the project's source content at time of publish, computed over `data_models/` and the agent-scaffold files, excluding derived/internal entries), `createdAt` (Date, auto), `updatedAt` (Date, auto).

#### Scenario: Publish event is recorded

- **WHEN** a user publishes semantic models with message "Added customer lifetime value metric"
- **THEN** a `PublishEvent` document is created with the message, the list of model names, and the content hash

#### Scenario: Query publish history

- **WHEN** the publish history for a project is queried
- **THEN** events are returned sorted by `createdAt` descending

### Requirement: Publish API

The API SHALL expose a POST endpoint at `/api/projects/:projectId/publish` that accepts `{ message: string }`. Publishing creates a **Git commit** that becomes the state served by production MCP — it does NOT assemble or write any `build/` artifact. The endpoint SHALL: validate the message is non-empty, ensure the project directory is a Git repository (lazy init if needed), pull/merge upstream changes if a remote is configured (abort on conflicts), stage all changes and create a Git commit with the user-provided message, create a `PublishEvent`, and push to the remote if configured. The endpoint SHALL return the created `PublishEvent` along with any push warnings. Conflict errors SHALL return a 409 status with the list of conflicted file paths.

#### Scenario: Successful publish (local only)

- **WHEN** a POST request is made with `{ message: "Release v2 with new metrics" }` on a project without a remote
- **THEN** the current `data_models/` and scaffold files are staged and committed via `isomorphic-git` (no `build/` is produced)
- **AND** a `PublishEvent` is created
- **AND** the response includes the event with status 201

#### Scenario: Publish with upstream sync and push

- **WHEN** a publish is triggered on a project with a configured remote
- **THEN** upstream changes are pulled and merged first
- **AND** local changes are committed
- **AND** the commit is pushed to the remote
- **AND** a `PublishEvent` is created

#### Scenario: Publish aborted due to merge conflicts

- **WHEN** a publish is triggered but the upstream pull results in merge conflicts
- **THEN** a 409 error is returned with `{ conflicts: true, files: [...] }`
- **AND** no commit or `PublishEvent` is created
- **AND** the conflicted files remain on disk with conflict markers for manual resolution

#### Scenario: Publish with empty message

- **WHEN** a POST request is made with an empty or missing message
- **THEN** a 400 error is returned

#### Scenario: Push failure does not block publish

- **WHEN** a publish is triggered and the commit succeeds but the push to remote fails
- **THEN** the local commit and `PublishEvent` creation still succeed
- **AND** the response includes a warning about the push failure with the specific error message

### Requirement: Publish Status API

The API SHALL expose a GET endpoint at `/api/projects/:projectId/publish/status` that returns `{ hasUnpublishedChanges: boolean, lastPublishedAt: string | null, lastMessage: string | null, hasConflicts: boolean }`. Unpublished changes are detected by comparing a SHA-256 hash of the current working-directory source content (`data_models/` + scaffold files, excluding derived/internal entries) against the `contentHash` of the most recent `PublishEvent`. The `hasConflicts` field SHALL be `true` if any YAML file in `data_models/` contains Git conflict markers. Because production MCP serves the last published (committed) state, `hasUnpublishedChanges: true` means there are saved models not yet available via production MCP.

#### Scenario: No previous publish

- **WHEN** status is requested for a project that has never been published
- **AND** source models exist
- **THEN** `hasUnpublishedChanges` is `true`, `lastPublishedAt` is `null`, `lastMessage` is `null`

#### Scenario: No changes since last publish

- **WHEN** status is requested and the current source hash matches the last publish event's `contentHash`
- **THEN** `hasUnpublishedChanges` is `false`

#### Scenario: Changes exist since last publish

- **WHEN** status is requested and the current source hash differs from the last publish event's `contentHash`
- **THEN** `hasUnpublishedChanges` is `true`

#### Scenario: No source models exist

- **WHEN** status is requested for a project with no source models
- **THEN** `hasUnpublishedChanges` is `false`

#### Scenario: Conflict markers detected

- **WHEN** status is requested and a YAML file in `data_models/` contains `<<<<<<<` conflict markers
- **THEN** `hasConflicts` is `true`

### Requirement: Publish Overlay Dialog

Clicking the publish button SHALL open a modal overlay with: a textarea for the publish message, a "Publish" confirmation button, and a "Cancel" button. The dialog copy SHALL frame publishing as committing the current models so they become available via production MCP (and pushing to the connected repository when configured). The confirmation button SHALL be disabled until the message is non-empty. On confirmation, the publish API is called and the dialog closes on success.

#### Scenario: Open publish dialog

- **WHEN** the user clicks the enabled publish button
- **THEN** a modal overlay appears with a message textarea, a "Publish" button, and a "Cancel" button

#### Scenario: Submit publish

- **WHEN** the user enters a message and clicks "Publish"
- **THEN** the publish API is called with the entered message
- **AND** on success, the dialog closes, a success toast is shown, and the publish button becomes disabled

#### Scenario: Cancel publish

- **WHEN** the user clicks "Cancel" in the publish dialog
- **THEN** the dialog closes without making any API call

#### Scenario: Publish button disabled during submission

- **WHEN** the publish API call is in progress
- **THEN** the "Publish" button in the dialog shows a loading state and is not clickable
