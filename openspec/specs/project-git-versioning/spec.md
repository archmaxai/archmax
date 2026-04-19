# project-git-versioning Specification

## Purpose
TBD - created by archiving change add-local-git-versioning. Update Purpose after archive.
## Requirements
### Requirement: Git Library

The system SHALL use `isomorphic-git` (pure JavaScript Git implementation) for all Git operations. No CLI wrappers or native Git bindings SHALL be used. The library SHALL be imported as individual functions for tree-shakeability.

#### Scenario: Git operations use isomorphic-git

- **WHEN** any Git operation (init, add, commit, push, pull, log) is performed
- **THEN** it is executed via `isomorphic-git` using `node:fs` as the filesystem backend

### Requirement: Fixed Commit Author

All Git commits created by the system SHALL use the fixed author identity `archmax <archmax@localhost>` for both the author and committer fields. This identity is not configurable.

#### Scenario: Commit uses fixed author

- **WHEN** a Git commit is created (via publish, sync merge commit, or initial commit)
- **THEN** the commit's author and committer are both `archmax <archmax@localhost>`

### Requirement: GitService

The system SHALL provide a `GitService` class in `packages/core/src/services/git.ts` that encapsulates all Git operations for a project directory. The service SHALL accept a project directory path and provide methods for: `ensureRepo()`, `commit(message)`, `push()`, `pull()`, `log(limit)`, `revertFile(path)`, `discardAllChanges()`, and `status()`. The service SHALL use `isomorphic-git` with `node:fs` and configure HTTP via `isomorphic-git/http/node`.

#### Scenario: GitService initializes on construction

- **WHEN** a `GitService` is created for a project directory
- **THEN** it stores the directory path and is ready for operations without immediate I/O

### Requirement: Automatic Repository Initialization

Each project's data directory (`<ARCHMAX_DATA_DIR>/projects/<projectId>/`) SHALL be a Git repository. If the `.git` directory does not exist when a Git operation is attempted, the system SHALL initialize it with `git init`, create a `.gitignore` (excluding `build/` and temp files), and create an initial commit with all existing files.

#### Scenario: New project gets a Git repo

- **WHEN** a new project is created
- **THEN** the project directory is initialized as a Git repository
- **AND** a `.gitignore` file is created excluding `build/` and `.*tmp` patterns
- **AND** an initial commit is created if any files exist

#### Scenario: Existing project without Git repo (migration)

- **WHEN** a publish or sync is attempted on a project that lacks a `.git` directory
- **THEN** the system initializes the repository with all existing files as an initial commit
- **AND** subsequent operations proceed normally

### Requirement: Git Status API

The system SHALL provide an API endpoint `GET /api/projects/:projectId/git/status` that returns `{ initialized: boolean }`. The `initialized` field SHALL be `true` if the project directory contains a `.git` directory (i.e., is a Git repository), and `false` otherwise. This endpoint is used by the frontend to determine whether to show the migration prompt.

#### Scenario: Project with Git initialized

- **WHEN** a git status request is made for a project whose directory contains `.git`
- **THEN** the response is `{ initialized: true }`

#### Scenario: Project without Git initialized

- **WHEN** a git status request is made for a project whose directory does not contain `.git`
- **THEN** the response is `{ initialized: false }`

### Requirement: Initialize Git Repository API

The system SHALL provide an API endpoint `POST /api/projects/:projectId/git/init` that explicitly initializes a Git repository for an existing project. The endpoint SHALL call `GitService.ensureRepo()` which creates `.git`, writes `.gitignore`, and creates an initial commit with all existing files. If the repository is already initialized, the endpoint SHALL return a success response (no-op). The response SHALL include `{ initialized: true, message: string }`.

#### Scenario: Initialize Git for an existing project

- **WHEN** an init request is made for a project that has YAML files but no `.git` directory
- **THEN** the project directory is initialized as a Git repository
- **AND** all existing files are committed as the initial commit
- **AND** the response is `{ initialized: true, message: "Repository initialized with initial commit" }`

#### Scenario: Initialize Git for an already-initialized project

- **WHEN** an init request is made for a project that already has a `.git` directory
- **THEN** no changes are made
- **AND** the response is `{ initialized: true, message: "Repository already initialized" }`

### Requirement: Revert File

The system SHALL provide an API endpoint `POST /api/projects/:projectId/git/revert-file` accepting `{ path: string }` that restores a single file to its state at the last commit (HEAD). If the file does not exist at HEAD, it SHALL be deleted from the working directory.

#### Scenario: Revert a modified file

- **WHEN** a revert-file request is made for `src/sales.yaml` which has uncommitted changes
- **THEN** the file content is restored to the HEAD commit version
- **AND** a success response with the reverted file path is returned

#### Scenario: Revert a file that is new (untracked)

- **WHEN** a revert-file request is made for a file that does not exist in HEAD
- **THEN** the file is deleted from the working directory
- **AND** a success response indicates the file was removed

#### Scenario: Revert a file that doesn't exist

- **WHEN** a revert-file request is made for a file path that doesn't exist on disk or in HEAD
- **THEN** a 404 error is returned

### Requirement: Discard All Changes

The system SHALL provide an API endpoint `POST /api/projects/:projectId/git/discard-all` that restores the entire working directory to the state at HEAD. All uncommitted modifications, additions, and deletions SHALL be reverted.

#### Scenario: Discard all uncommitted changes

- **WHEN** a discard-all request is made on a project with multiple modified and new files
- **THEN** all files are restored to their HEAD state
- **AND** untracked files that are not in HEAD are deleted
- **AND** a success response is returned

#### Scenario: Discard when no changes exist

- **WHEN** a discard-all request is made but the working directory matches HEAD
- **THEN** a success response is returned (no-op)

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

### Requirement: Upstream Sync (Pull and Merge)

The system SHALL provide an API endpoint `POST /api/projects/:projectId/git/sync` that fetches from the configured remote and merges into the local branch. The endpoint SHALL: validate that a remote is configured, fetch the latest changes, attempt a merge, and report the result. If the merge results in conflicts, the response SHALL include the list of conflicted file paths and a `conflicts: true` flag.

#### Scenario: Sync with no remote configured

- **WHEN** a sync is attempted on a project without a configured remote
- **THEN** a 400 error is returned with message "No remote repository configured"

#### Scenario: Sync with fast-forward merge

- **WHEN** a sync is attempted and the remote has new commits that fast-forward cleanly
- **THEN** the local branch is updated to match the remote
- **AND** a success response with `conflicts: false` and the number of new commits is returned

#### Scenario: Sync with merge conflicts

- **WHEN** a sync is attempted and the merge results in conflicts
- **THEN** the conflicted files are written with standard Git conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
- **AND** the response includes `conflicts: true` and an array of conflicted file paths
- **AND** the response message instructs the user to resolve conflicts before publishing

#### Scenario: Sync with authentication failure

- **WHEN** a sync is attempted but the PAT is invalid or revoked
- **THEN** a 401 error is returned with a clear message about the authentication failure

#### Scenario: Sync with network failure

- **WHEN** a sync is attempted but the remote host is unreachable
- **THEN** an error is returned with a clear message about the network issue

### Requirement: Pre-Publish Sync

When a publish (commit) is triggered on a project with a configured remote, the system SHALL automatically attempt to pull/merge upstream changes before creating the commit. If the pull results in merge conflicts, the publish SHALL be aborted and the conflicts SHALL be reported to the user.

#### Scenario: Publish with clean upstream sync

- **WHEN** a publish is triggered and the remote has new commits
- **THEN** the remote changes are merged first
- **AND** then the local changes are committed on top
- **AND** the commit is pushed to the remote

#### Scenario: Publish aborted due to conflicts

- **WHEN** a publish is triggered but the upstream sync results in conflicts
- **THEN** the publish is aborted (no commit is created)
- **AND** the response includes the list of conflicted files
- **AND** the user is instructed to resolve conflicts manually or via the agent

### Requirement: Upstream Push on Publish

After a successful commit, if a remote is configured, the system SHALL push the commit to the remote repository on the configured branch. Push failures SHALL be reported but SHALL NOT roll back the local commit.

#### Scenario: Successful push after publish

- **WHEN** a publish creates a commit and a remote is configured
- **THEN** the commit is pushed to the remote branch
- **AND** the publish response indicates push success

#### Scenario: Push failure (non-fast-forward)

- **WHEN** the push fails because the remote has diverged
- **THEN** the local commit still succeeds
- **AND** the response includes a warning that the push failed with instructions to sync first

#### Scenario: Push failure (auth error)

- **WHEN** the push fails due to an invalid PAT
- **THEN** the local commit still succeeds
- **AND** the response includes a clear error about the authentication failure

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

