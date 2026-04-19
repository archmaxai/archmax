## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: GitHub Push on Publish

**Reason**: The Octokit-based tree/blob/commit push via the GitHub API is replaced by `isomorphic-git` push using the configured PAT. Push logic is now part of the `GitService` and the publish flow in `project-git-versioning`. The separate `pushToGitHub` function and its `collectFiles` helper are removed.

**Migration**: Projects that had GitHub configured via OAuth must re-enter a PAT in the new GitHub settings card. The push mechanism changes from GitHub API (Octokit tree/blob/commit) to standard Git HTTPS push via `isomorphic-git`.
