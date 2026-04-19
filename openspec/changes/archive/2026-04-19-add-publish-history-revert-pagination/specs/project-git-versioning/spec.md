## ADDED Requirements

### Requirement: Revert to Commit

The system SHALL provide a `revertToCommit(oid: string)` method on `GitService` that restores the entire working directory to the file state of a target commit and creates a new commit recording the revert. The method SHALL: resolve the target commit OID, read its full file tree, write those files to the working directory, remove files that exist in the current tree but not in the target, stage all changes, and commit with the message `Revert to: <original commit message>`. HEAD SHALL remain on the current branch (no detached HEAD). If the target OID does not exist, the method SHALL throw an error.

#### Scenario: Revert to a previous commit

- **WHEN** `revertToCommit("abc123")` is called and commit `abc123` has message "Release v2"
- **THEN** the working directory matches the file state of commit `abc123`
- **AND** a new commit is created with message `Revert to: Release v2`
- **AND** HEAD remains on the current branch

#### Scenario: Revert to a non-existent commit

- **WHEN** `revertToCommit("nonexistent")` is called
- **THEN** an error is thrown indicating the commit was not found

#### Scenario: Revert to the current HEAD (no-op)

- **WHEN** `revertToCommit` is called with the OID of the current HEAD commit
- **THEN** no new commit is created (the working directory already matches)
- **AND** a success response is returned

### Requirement: Revert to Commit API

The system SHALL provide an API endpoint `POST /api/projects/:projectId/git/revert-to-commit` accepting `{ oid: string }` that calls `GitService.revertToCommit()`. On success, the response SHALL include the new commit OID and message. On failure (invalid OID, no commits), the endpoint SHALL return a 400 or 404 error with a descriptive message. After a successful revert, the publish status and semantic model caches SHALL be invalidated.

#### Scenario: Successful revert via API

- **WHEN** a POST request is made with `{ oid: "abc123" }`
- **THEN** the working directory is reverted to commit `abc123`
- **AND** a new commit is created
- **AND** the response includes `{ oid: "<new-commit>", message: "Revert to: ..." }`

#### Scenario: Invalid OID

- **WHEN** a POST request is made with an OID that does not exist
- **THEN** a 400 error is returned with a descriptive message

### Requirement: Publish History UI

The project settings page SHALL display a "Publish History" card showing paginated Git commit history. Each history entry SHALL display the commit message (first line, truncated) and a relative timestamp. Each entry SHALL include a revert icon button (Lucide `Undo2`) that, when clicked, opens a confirmation dialog. The confirmation dialog SHALL display the commit message and ask the user to confirm the revert. On confirmation, `POST /git/revert-to-commit` is called with the entry's OID. On success, a toast confirms the revert, the history list refreshes, and related caches (publish status, semantic models) are invalidated. Pagination controls SHALL appear below the list only when `total` exceeds the page size, using the project's standard pagination pattern: left-aligned total count (`text-xs text-muted-foreground`), right-aligned chevron buttons with page indicator (`tabular-nums`).

#### Scenario: Revert button on each entry

- **WHEN** the publish history card displays commit entries
- **THEN** each entry shows an `Undo2` icon button on the right side

#### Scenario: Revert confirmation dialog

- **WHEN** the user clicks the revert button on an entry with message "Added customer metrics"
- **THEN** a confirmation dialog appears with the message "Revert to this version?" and displays "Added customer metrics"
- **AND** the dialog has "Revert" and "Cancel" buttons

#### Scenario: Successful revert

- **WHEN** the user confirms a revert
- **THEN** the revert API is called
- **AND** on success, a toast shows "Reverted to: Added customer metrics"
- **AND** the history list refreshes to show the new revert commit

#### Scenario: Pagination visible

- **WHEN** the project has more commits than the page size
- **THEN** pagination controls appear below the history list

#### Scenario: Pagination hidden

- **WHEN** the project has fewer commits than the page size
- **THEN** no pagination controls are shown

#### Scenario: Revert button disabled for most recent commit

- **WHEN** the most recent commit is displayed (first entry on page 1)
- **THEN** the revert button is hidden or disabled (reverting to HEAD is a no-op)

## MODIFIED Requirements

### Requirement: Commit History

The system SHALL provide an API endpoint `GET /api/projects/:projectId/git/log` accepting optional `limit` (default 10, max 100) and `page` (default 1) query parameters that returns paginated commit history. The response SHALL be `{ entries: GitLogEntry[], total: number, page: number, limit: number }`. Each entry SHALL include `oid` (commit hash), `message`, `author` (name + email), and `timestamp` (ISO 8601). Entries SHALL be returned in reverse chronological order.

#### Scenario: Retrieve first page of commit history

- **WHEN** a log request is made with default parameters for a project with 25 commits
- **THEN** 10 entries are returned (default limit) for page 1
- **AND** `total` is 25

#### Scenario: Retrieve second page

- **WHEN** a log request is made with `page=2&limit=10` for a project with 25 commits
- **THEN** 10 entries are returned for page 2 (commits 11–20)
- **AND** `total` is 25

#### Scenario: Empty repository

- **WHEN** a log request is made for a project with no commits
- **THEN** `entries` is an empty array and `total` is 0
