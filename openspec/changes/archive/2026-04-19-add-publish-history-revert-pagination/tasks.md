## 1. Backend — GitService revert method

- [x] 1.1 Add `revertToCommit(oid: string)` method to `GitService` in `packages/core/src/services/git.ts`: resolve OID, read target tree, write files to working dir, remove files absent in target, stage all, commit with `Revert to: <message>`; skip commit if working dir already matches target
- [x] 1.2 Add unit tests for `revertToCommit` (success, invalid OID, no-op when HEAD matches)

## 2. Backend — Paginated log endpoint

- [x] 2.1 Update `GitService.log()` to accept `{ limit, page }` and return `{ entries, total }` — fetch full depth for count, slice for page window
- [x] 2.2 Update `GET /git/log` route in `apps/api/src/routes/git.ts` to accept `page` query param and return `{ entries, total, page, limit }`
- [x] 2.3 Update existing log endpoint tests for new response shape

## 3. Backend — Revert-to-commit endpoint

- [x] 3.1 Add `POST /git/revert-to-commit` route in `apps/api/src/routes/git.ts` accepting `{ oid: string }`, calling `gitSvc.revertToCommit(oid)`, returning `{ oid, message }` on success
- [x] 3.2 Add route tests for revert endpoint (success, invalid OID, error handling)

## 4. Frontend — Hooks

- [x] 4.1 Add `useGitRevertToCommit()` mutation hook in `apps/frontend/src/lib/use-git.ts` — calls the revert endpoint, invalidates `git-log`, `publish-status`, and `semantic-models` query keys, shows success/error toasts
- [x] 4.2 Update `useGitLog()` to accept `{ limit, page }` and return the paginated response shape `{ entries, total, page, limit }`

## 5. Frontend — Publish History Card

- [x] 5.1 Add `page` state to `PublishHistoryCard`, wire `useGitLog` with page/limit params
- [x] 5.2 Add `Undo2` icon button on each history entry (hidden/disabled on the first entry of page 1)
- [x] 5.3 Add confirmation dialog for revert: shows commit message, "Revert" + "Cancel" buttons, loading state during mutation
- [x] 5.4 Add pagination controls below the list when `total > limit`: total count label + chevron prev/next buttons with page indicator
- [x] 5.5 Verify UI matches project conventions (ghost icon button, `text-xs`, `tabular-nums`, `variant="outline" size="sm"` for pagination)
