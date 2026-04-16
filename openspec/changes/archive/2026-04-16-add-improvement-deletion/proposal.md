# Change: Add improvement request deletion

## Why

Users have no way to remove improvement requests they no longer need. Once submitted via MCP, items accumulate in the sidebar with no cleanup path. A delete action lets users keep the list focused on actionable items.

## What Changes

- Add a `DELETE /:id` API endpoint that soft-deletes an improvement (leveraging the existing `softDeletePlugin` already on the model)
- Add a delete button (trash icon on hover) to each improvement row in the sidebar, matching the existing conversation delete pattern
- Add a delete action on the improvement detail page header

## Impact

- Affected specs: `semantic-models` (Improvement API Endpoints, Improvements UI in Semantic Models Sidebar, Improvement Detail View)
- Affected code: `apps/api/src/routes/improvements.ts`, `apps/frontend/src/routes/_auth/$projectId/models.tsx`, `apps/frontend/src/routes/_auth/$projectId/models/improvement/$improvementId.tsx`
