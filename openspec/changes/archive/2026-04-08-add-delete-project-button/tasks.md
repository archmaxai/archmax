## 1. Frontend Implementation

- [x] 1.1 Add a "Danger Zone" card at the bottom of the settings page (`settings.tsx`) with a destructive "Delete project" button
- [x] 1.2 Implement a confirmation dialog that requires typing the project name to enable the delete action
- [x] 1.3 Wire up the delete mutation calling `DELETE /api/projects/:id`
- [x] 1.4 On successful deletion, invalidate project queries and redirect to `/`
- [x] 1.5 Show toast notification on success/error

## 2. Validation

- [x] 2.1 Verify the confirmation dialog blocks deletion until the project name is typed correctly
- [x] 2.2 Verify navigation redirects to the project list after deletion
- [x] 2.3 Verify cascaded soft-delete of connections and MCP tokens still works end-to-end
