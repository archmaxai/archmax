# Change: Add delete project button under settings

## Why

There is no way for users to delete a project from the UI. The backend API already supports soft-deleting projects (with cascading deletes to connections and MCP tokens), but the settings page does not expose this action. Users should be able to remove projects they no longer need.

## What Changes

- Add a "Danger Zone" card at the bottom of the settings page with a delete project button
- Show a confirmation dialog requiring the user to type the project name before deletion proceeds
- After successful deletion, redirect to the project list (root `/`)
- No backend changes needed — the existing `DELETE /api/projects/:id` endpoint already handles soft-delete with cascade

## Impact

- Affected specs: `project-management` (adds a new UI requirement for deletion)
- Affected code: `apps/frontend/src/routes/_auth/$projectId/settings.tsx`
