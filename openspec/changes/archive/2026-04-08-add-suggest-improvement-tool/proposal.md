# Change: Add `suggest_improvement` MCP tool for external improvement suggestions

## Why

External AI agents consuming the semantic layer via MCP currently have no way to feed back quality issues — e.g. "this field is misnamed", "this relationship is missing", or "the description is wrong". A lightweight feedback loop lets agents (and their users) suggest improvements without needing admin UI access, while keeping the human in the loop for implementation.

## What Changes

- **New MCP tool** `suggest_improvement` — accepts `modelName`, `title`, and `description`; persists an `Improvement` document scoped to the project and model
- **New Mongoose model** `Improvement` — stores the suggestion with status tracking (`pending` / `implemented`)
- **New API endpoints** — CRUD for improvements (list by project, get by id, mark as implemented)
- **New frontend accordion section** "Improvements" in the Semantic Models sidebar (below History) showing pending/implemented items with count badge
- **Improvement detail view** — when clicking an improvement, the main content area shows title, description, and an "Implement" button that opens a new chat pre-filled with the improvement description; clicking "Implement" marks the improvement as `implemented`

## Impact

- Affected specs: `mcp-server`, `semantic-models`
- Affected code:
  - `packages/core/src/models/Improvement.ts` (new model)
  - `apps/api/src/mcp/semlayer-server.ts` (new tool registration)
  - `apps/api/src/routes/improvements.ts` (new API routes)
  - `apps/frontend/src/routes/_auth/$projectId/models.tsx` (sidebar accordion)
  - `apps/frontend/src/routes/_auth/$projectId/models/improvement.$improvementId.tsx` (detail view)
