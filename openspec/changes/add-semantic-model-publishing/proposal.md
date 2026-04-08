# Change: Add Semantic Model Publishing with GitHub Sync

## Why
Semantic models are currently editable in real-time and immediately visible to MCP consumers. There is no concept of a stable, reviewed version — any in-progress agent edit is instantly served to AI tools. A publishing workflow gives teams a controlled release gate with audit trail (publish messages) and optional GitHub-backed version control.

## What Changes
- **BREAKING**: Restructure per-project data directory to use `src/` for semantic model source files and `uploads/` for documents (currently models live directly under `<projectId>/`)
- Add a publish workflow that assembles source models into a `build/` directory and records a publish event with a user-provided message
- MCP server serves from the published `build/` snapshot, not from live source files
- Add a "Publish" button to the semantic model visualization toolbar and the chat window toolbar, enabled when unpublished changes exist
- Add a publish overlay dialog with a message textarea and confirm/cancel actions
- Add GitHub OAuth integration (via `@octokit/oauth-app`) to project settings — connect, select repo, disconnect
- On publish, optionally push the project directory (`src/`, `uploads/`, `build/`) to the connected GitHub repository

## Impact
- Affected specs: `semantic-models`, `mcp-server`, `project-management`, `semantic-model-publishing` (new)
- Affected code:
  - `packages/core/src/services/semantic-model-files.ts` — update base paths to `src/` subdirectory, add migration
  - `packages/core/src/services/publish.ts` (new) — build assembly + publish record + GitHub push
  - `packages/core/src/models/Project.ts` — add GitHub OAuth subdocument
  - `packages/core/src/models/PublishEvent.ts` (new) — publish audit log model
  - `apps/api/src/routes/publish.ts` (new) — publish API endpoint
  - `apps/api/src/routes/github.ts` (new) — OAuth authorize/callback endpoints, repo listing, disconnect
  - `apps/api/src/routes/projects.ts` — accept GitHub repo/branch selection in update
  - `apps/api/src/mcp/semlayer-server.ts` — read from `build/` instead of source
  - `apps/frontend/src/components/publish-toolbar.tsx` (new) — shared publish button + overlay
  - `apps/frontend/src/routes/_auth/$projectId/settings.tsx` — GitHub settings card
  - `apps/frontend/src/components/model-visualization/model-visualization.tsx` — add toolbar
  - `apps/frontend/src/routes/_auth/$projectId/models/chat/$conversationId.tsx` — add toolbar
