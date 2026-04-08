# Change: Rename sidebar navigation labels

## Why
The current "Data Sources" top-level group and "Connections" child label don't clearly communicate the platform's federated querying capability. Renaming the group to "Data Federation" emphasizes the cross-connection federation layer, while promoting "Connections" to "Data Sources" gives users a more intuitive label for where they manage their database connections.

## What Changes
- Sidebar top-level group label: "Data Sources" → "Data Federation"
- Sidebar child menu item label: "Connections" → "Data Sources"
- Default-open group state updated from "Data Sources" to "Data Federation"
- Page heading on the connections page updated from "Data Connections" to "Data Sources" for consistency
- Spec updated to reflect the new navigation labels

## Impact
- Affected specs: `frontend-shell`
- Affected code: `apps/frontend/src/components/layout/app-sidebar.tsx`, `apps/frontend/src/routes/_auth/$projectId/connections/index.tsx`
