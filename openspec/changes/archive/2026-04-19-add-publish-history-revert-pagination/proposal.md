# Change: Add revert-to-commit button and pagination to publish history

## Why

The publish history card in project settings shows recent commits but provides no way to act on them. Users need the ability to revert their project to a previous publish state (e.g., after an accidental or broken publish) without manually restoring files. The history is also capped at 10 entries with no way to browse older commits.

## What Changes

- Add a `revertToCommit(oid)` method to `GitService` that restores the working directory to a target commit's file state and creates a new commit recording the revert (preserving linear history)
- Add `POST /api/projects/:projectId/git/revert-to-commit` API endpoint accepting `{ oid: string }`
- Add a `page` query parameter to `GET /api/projects/:projectId/git/log` for offset-based pagination (returns `{ entries, total }`)
- Add a revert icon button (Lucide `Undo2`) on each publish history entry that triggers a confirmation dialog before reverting
- Add subtle pagination controls below the history list (chevron buttons + page indicator, matching the project's table pagination convention)
- Add `useGitRevertToCommit()` mutation hook in `use-git.ts`
- Update `useGitLog()` to support paginated fetching

## Impact

- Affected specs: `project-git-versioning` (new revert-to-commit capability, paginated log)
- Affected code:
  - `packages/core/src/services/git.ts` — new `revertToCommit(oid)` method
  - `apps/api/src/routes/git.ts` — new revert endpoint, paginated log response
  - `apps/frontend/src/lib/use-git.ts` — new hook, updated log hook
  - `apps/frontend/src/routes/_auth/$projectId/settings.tsx` — revert button + pagination in `PublishHistoryCard`
