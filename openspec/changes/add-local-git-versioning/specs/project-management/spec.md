## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: GitHub OAuth Integration

**Reason**: Replaced by direct PAT entry in project settings. The OAuth app flow (client ID/secret, authorize redirect, callback endpoint, repo listing) is no longer needed. The new GitHub card in Project Settings UI provides equivalent push/pull functionality with a simple PAT.

**Migration**: Users must re-enter their GitHub credentials as a PAT in the new GitHub settings card. Existing encrypted OAuth tokens cannot be reused as PATs (different token format). The `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` env vars are removed.
