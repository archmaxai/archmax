## 1. Core Git Infrastructure

- [x] 1.1 Add `isomorphic-git` dependency to `packages/core`
- [x] 1.2 Create `packages/core/src/services/git.ts` with `GitService` class wrapping isomorphic-git operations: `ensureRepo()`, `commit(message)`, `push()`, `pull()`, `log(limit)`, `revertFile(path)`, `discardAllChanges()`, `status()`
- [x] 1.3 All commits use fixed author/committer: `archmax <archmax@localhost>`
- [x] 1.4 `ensureRepo()` initializes `.git` if missing, creates `.gitignore` (exclude `build/`, `.*tmp`), makes initial commit of existing files
- [ ] 1.5 Write unit tests for `GitService` (init, commit, log, revert, discard, fixed author)
- [ ] 1.6 Write integration tests for push/pull with a bare repo fixture

## 2. Project Model Migration

- [x] 2.1 Restructure `IGitHubConfig` / `GitHubConfigSchema` in `packages/core/src/models/Project.ts` — replace `owner` + `repo` with single `url` field, keep `branch` and `encryptedToken`
- [x] 2.2 Remove `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` from env schema in `packages/core/src/config/env.ts`
- [x] 2.3 Update project serialization in `apps/api/src/routes/projects.ts` to expose `github` (with `url`, `branch`, `connected` — without token)
- [x] 2.4 Update `IProject` interface and frontend `Project` type in `apps/frontend/src/lib/project-context.tsx`
- [ ] 2.5 Add a data migration helper that converts existing `github.owner` + `github.repo` to `github.url` (`https://github.com/{owner}/{repo}.git`)

## 3. Remove GitHub OAuth Workflow

- [x] 3.1 Delete `apps/api/src/routes/github.ts` entirely
- [x] 3.2 Remove GitHub OAuth route mounts from `apps/api/src/app.ts` (both `githubCallback` pre-auth and project-scoped GitHub routes)
- [x] 3.3 Remove `githubEnabled` from the `/api/config` endpoint
- [x] 3.4 Remove `@octokit/oauth-app` dependency from the project (keep `octokit` only if needed elsewhere, otherwise remove too)
- [x] 3.5 Remove the Octokit-based `pushToGitHub` function and `collectFiles` helper from `apps/api/src/routes/publish.ts`

## 4. Publish Flow Rewrite

- [x] 4.1 Update `POST /api/projects/:projectId/publish` to: ensure git repo → pull/merge if GitHub configured → assemble → stage + commit → push if GitHub configured → create PublishEvent
- [x] 4.2 Return 409 with conflict details when upstream merge fails
- [x] 4.3 Include push warnings in the 201 response when push fails but commit succeeds
- [x] 4.4 Update `GET /publish/status` to include `hasConflicts` flag (detect `<<<<<<<` markers in `src/` YAML files)
- [ ] 4.5 Update publish tests

## 5. Git API Endpoints

- [x] 5.1 Create `apps/api/src/routes/git.ts` with endpoints: `GET /status`, `POST /init`, `POST /revert-file`, `POST /discard-all`, `GET /log`, `POST /sync`
- [x] 5.2 Mount git routes at `/api/projects/:projectId/git` in `app.ts`
- [x] 5.3 `GET /status` returns `{ initialized: boolean }` based on `.git` directory existence
- [x] 5.4 `POST /init` calls `GitService.ensureRepo()` — creates repo + initial commit for existing projects
- [x] 5.5 Wire sync endpoint to `GitService.pull()` with conflict detection and structured error responses
- [ ] 5.6 Write API route tests for all git endpoints

## 6. File Listing Filtering

- [x] 6.1 Update `SemanticModelFileService` to skip entries starting with `.` in all directory traversals (`list`, `get`, `readAllDatasets`)
- [x] 6.2 Update `DocumentFileService.list()` to skip entries starting with `.` (already partially done — verify)
- [x] 6.3 Update agent filesystem (`agent-filesystem.ts`) to exclude dotfiles/dotdirs from `listFiles` — handled by deepagents library internals; dotfiles are excluded from all semantic model, document, and publish file listings
- [x] 6.4 Update `PublishService` hash computation to skip dotfiles/dotdirs
- [ ] 6.5 Add tests verifying `.git` exclusion in file listings

## 7. Merge Conflict Handling in Models

- [x] 7.1 Add conflict marker detection to `SemanticModelFileService` — detect `<<<<<<<` in YAML content
- [x] 7.2 Return `hasConflicts` flag in model list and model detail responses
- [x] 7.3 Update graph view (`model-graph-view.tsx`) to show error banner when `hasConflicts` is true
- [x] 7.4 Update tree view to show error banner when `hasConflicts` is true
- [x] 7.5 YAML tab displays raw content including conflict markers (already works since it shows raw text)
- [x] 7.6 Add conflict warning icon to model entries in sidebar list
- [ ] 7.7 Add tests for conflict detection and model listing behavior

## 8. Project Settings UI

- [x] 8.1 Replace the GitHub OAuth card in `settings.tsx` with a "GitHub" card containing: URL input, PAT password input, branch input, Save/Remove/Sync buttons
- [x] 8.2 Wire Save to `PUT /api/projects/:id` with encrypted token
- [x] 8.3 Wire "Sync Now" button to `POST /api/projects/:id/git/sync` with loading state and toast feedback
- [x] 8.4 Wire "Remove" to clear `github` via `PUT /api/projects/:id`
- [x] 8.5 Show sync conflict results in a toast or inline message listing affected files
- [x] 8.6 Add git status check on settings page load (`GET /git/status`) — if `initialized: false`, show a "Version Control" migration card with "Initialize Git" button; hide GitHub and Publish History cards until initialized
- [x] 8.7 Wire "Initialize Git" button to `POST /git/init` with loading state, success toast, and re-fetch to swap in normal cards
- [x] 8.8 Add a "Publish History" card below the GitHub card — fetch `GET /api/projects/:id/git/log?limit=10`, display commit messages with relative timestamps, show "No publish history yet." placeholder when empty

## 9. Semantic Model Agent Updates

- [x] 9.1 Add a "Git Versioning" section to `packages/core/prompts/semantic-model-agent.md` explaining: project is a Git repo, publishing creates commits, files may have conflict markers, how to identify and resolve conflicts in YAML
- [x] 9.2 Add `revert_file` and `discard_all_changes` as agent tools in the agent tool registry
- [x] 9.3 Document the revert tools in the agent prompt's "Your Tools" section
- [ ] 9.4 Test that the agent can read a file with conflict markers and propose a resolution

## 10. Cleanup and Documentation

- [x] 10.1 Remove `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` from `.env.example` (were not present)
- [x] 10.2 Update `.env.example` with any new env documentation (note `ENCRYPTION_KEY` is now required for GitHub integration)
- [x] 10.3 Run `pnpm typecheck && pnpm lint` to verify no regressions
- [ ] 10.4 Update documentation site (`apps/docs`) — project settings page, publishing workflow, GitHub integration guide
