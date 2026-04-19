## ADDED Requirements

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

The system SHALL provide an API endpoint `GET /api/projects/:projectId/git/log` accepting an optional `limit` query parameter (default 20) that returns the most recent commits. Each entry SHALL include `oid` (commit hash), `message`, `author` (name + email), and `timestamp` (ISO 8601).

#### Scenario: Retrieve commit history

- **WHEN** a log request is made for a project with 5 commits
- **THEN** up to 5 commit entries are returned in reverse chronological order
- **AND** each entry includes oid, message, author, and timestamp

#### Scenario: Empty repository

- **WHEN** a log request is made for a project with no commits
- **THEN** an empty array is returned

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
