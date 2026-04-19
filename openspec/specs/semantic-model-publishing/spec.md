# semantic-model-publishing Specification

## Purpose
TBD - created by archiving change add-semantic-model-publishing. Update Purpose after archive.
## Requirements
### Requirement: Publish Event Model

The system SHALL provide a `PublishEvent` Mongoose model with: `project` (ObjectId ref to Project, required, indexed), `message` (string, required — user-provided publish message), `modelNames` (string array — names of models included in the publish), `contentHash` (string — SHA-256 hash of concatenated sorted source YAML content at time of publish), `createdAt` (Date, auto), `updatedAt` (Date, auto).

#### Scenario: Publish event is recorded

- **WHEN** a user publishes semantic models with message "Added customer lifetime value metric"
- **THEN** a `PublishEvent` document is created with the message, the list of model names, and the content hash

#### Scenario: Query publish history

- **WHEN** the publish history for a project is queried
- **THEN** events are returned sorted by `createdAt` descending

### Requirement: Publish API

The API SHALL expose a POST endpoint at `/api/projects/:projectId/publish` that accepts `{ message: string }`. The endpoint SHALL: validate the message is non-empty, invoke the build assembly, ensure the project directory is a Git repository (lazy init if needed), pull/merge upstream changes if a remote is configured (abort on conflicts), stage all changes and create a Git commit with the user-provided message, create a `PublishEvent`, and push to the remote if configured. The endpoint SHALL return the created `PublishEvent` along with any push warnings. Conflict errors SHALL return a 409 status with the list of conflicted file paths.

#### Scenario: Successful publish (local only)

- **WHEN** a POST request is made with `{ message: "Release v2 with new metrics" }` on a project without a remote
- **THEN** source models are assembled into `build/`
- **AND** all changes are staged and committed via `isomorphic-git`
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

The API SHALL expose a GET endpoint at `/api/projects/:projectId/publish/status` that returns `{ hasUnpublishedChanges: boolean, lastPublishedAt: string | null, lastMessage: string | null, hasConflicts: boolean }`. Unpublished changes are detected by comparing a SHA-256 hash of the current source files against the `contentHash` of the most recent `PublishEvent`. The `hasConflicts` field SHALL be `true` if any YAML file in `src/` contains Git conflict markers.

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

- **WHEN** status is requested and a YAML file in `src/` contains `<<<<<<<` conflict markers
- **THEN** `hasConflicts` is `true`

### Requirement: Publish Toolbar

The frontend SHALL display a horizontal toolbar bar on semantic model pages. On the model visualization page (graph/tree/YAML tabs), the toolbar SHALL sit between the tab switcher and the content area, with the publish button aligned to the right. On the chat page, the toolbar SHALL appear at the top with only the publish button aligned to the right.

#### Scenario: Publish button on model visualization page

- **WHEN** a user views a semantic model in graph, tree, or YAML mode
- **THEN** a toolbar is visible with a "Publish" button on the right side

#### Scenario: Publish button on chat page

- **WHEN** a user is on the agent chat page
- **THEN** a toolbar is visible at the top with a "Publish" button on the right side

#### Scenario: Publish button disabled when no changes

- **WHEN** the publish status indicates `hasUnpublishedChanges: false`
- **THEN** the publish button is visually disabled and not clickable

#### Scenario: Publish button enabled when changes exist

- **WHEN** the publish status indicates `hasUnpublishedChanges: true`
- **THEN** the publish button is visually active and clickable

### Requirement: Publish Overlay Dialog

Clicking the publish button SHALL open a modal overlay with: a textarea for the publish message, a "Publish" confirmation button, and a "Cancel" button. The confirmation button SHALL be disabled until the message is non-empty. On confirmation, the publish API is called and the dialog closes on success.

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

### Requirement: GitHub OAuth Integration

The project settings page SHALL display a "GitHub Integration" card. When GitHub is not connected, the card SHALL show a "Connect to GitHub" button that initiates the GitHub OAuth web flow. The OAuth flow SHALL use `@octokit/oauth-app` with the `repo` scope. The API SHALL provide: `GET /api/github/authorize?projectId=:id` to redirect to GitHub, `GET /api/github/callback` to handle the OAuth callback, `GET /api/projects/:projectId/github/repos` to list accessible repositories, and `DELETE /api/projects/:projectId/github` to disconnect. When connected, the card SHALL show the authenticated GitHub username, a repository selector dropdown (populated from the user's accessible repos), a branch input (default `main`), and a "Disconnect" button.

#### Scenario: Initiate GitHub OAuth flow

- **WHEN** the user clicks "Connect to GitHub" in project settings
- **THEN** the browser redirects to GitHub's OAuth authorization page requesting `repo` scope
- **AND** the `state` parameter encodes the project ID for the callback

#### Scenario: OAuth callback exchanges code for token

- **WHEN** GitHub redirects back to `/api/github/callback` with a valid authorization code
- **THEN** `@octokit/oauth-app` exchanges the code for an access token
- **AND** the token is encrypted with AES-256-GCM and stored on the project's `github.encryptedToken` field
- **AND** the authenticated GitHub username is stored in `github.owner`
- **AND** the browser is redirected to the project settings page

#### Scenario: Select target repository

- **WHEN** the user is connected to GitHub and opens the repository selector
- **THEN** a list of repositories the user has push access to is fetched via the GitHub API
- **AND** the user selects a repository which is saved to `github.repo`

#### Scenario: Disconnect GitHub

- **WHEN** the user clicks "Disconnect" in the GitHub integration card
- **THEN** the `github` subdocument is removed from the project
- **AND** the OAuth token is deleted
- **AND** subsequent publishes do not attempt GitHub push

#### Scenario: GitHub not configured (env vars missing)

- **WHEN** `GITHUB_CLIENT_ID` or `GITHUB_CLIENT_SECRET` env vars are not set
- **THEN** the GitHub integration card is hidden from the settings page
- **AND** the OAuth endpoints return 404

