# Change: Replace GitHub OAuth with local Git versioning and PAT-based GitHub sync

## Why

The current GitHub integration depends on a full OAuth app flow (client ID + secret, authorization redirect, callback), which is heavyweight for a single-user tool and tightly couples publishing to GitHub's OAuth infrastructure. By initializing each project's file root as a local Git repository and using `isomorphic-git` (pure JS, no CLI wrapper), we get built-in versioning, revert capabilities, and simpler upstream sync via an encrypted PAT — without any GitHub App dependency.

## What Changes

- **BREAKING** Remove the GitHub OAuth workflow entirely (OAuth app endpoints, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` env vars, frontend OAuth flow)
- Each project's data directory (`<ARCHMAX_DATA_DIR>/projects/<projectId>/`) is initialized as a local Git repo on project creation
- Publishing a project creates a Git commit (instead of just recording a `PublishEvent` + pushing via GitHub API)
- Project settings replace the OAuth card with fields for encrypted PAT (using existing `ENCRYPTION_KEY`) and GitHub repository URL
- Add a "Sync" button in project settings to pull/merge upstream changes before committing
- Add 3 revert tools: revert a single file, revert all uncommitted changes, view commit log
- Upstream push happens after commit on publish (single configured branch)
- Transparent error messages for merge conflicts, auth failures, network issues
- Update the semantic model agent prompt to understand Git context and conflict resolution
- YAML files with merge conflict markers still appear in model listings but graph/tree views show a validation error
- File listing APIs and agent filesystem exclude dotfiles/dotdirs (`.git/`, etc.)
- Use `isomorphic-git` as the Git library (pure JavaScript implementation, no CLI wrapper, supports init/commit/push/pull/merge/log)
- All Git commits use a fixed author identity: `archmax <archmax@localhost>`
- Commit history displayed in a section within project settings

## Impact

- Affected specs: `project-management`, `semantic-model-publishing`, `semantic-models`, `semantic-model-agent`, new `project-git-versioning`
- Affected code:
  - `packages/core/src/models/Project.ts` — restructure `github` subdoc (replace `owner`/`repo` with `url`, keep `branch`/`encryptedToken`)
  - `packages/core/src/services/publish.ts` — commit via isomorphic-git instead of hash-only
  - `packages/core/src/services/semantic-model-files.ts` — filter dotfiles from listings
  - `apps/api/src/routes/publish.ts` — remove `pushToGitHub`, use git commit + push
  - `apps/api/src/routes/github.ts` — **delete entirely**
  - `apps/api/src/app.ts` — remove GitHub OAuth route mounts, remove `githubEnabled` from config
  - `apps/frontend/src/routes/_auth/$projectId/settings.tsx` — replace OAuth card with PAT/URL fields + sync button + commit log
  - `packages/core/src/config/env.ts` — remove `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`
  - `packages/core/prompts/semantic-model-agent.md` — add Git awareness section
  - `apps/frontend/src/components/model-visualization/` — show error banner for invalid YAML / conflict markers
  - New: `packages/core/src/services/git.ts` — `GitService` wrapping `isomorphic-git`
