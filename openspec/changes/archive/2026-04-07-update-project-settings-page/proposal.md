# Change: Add project name/slug editing and improve MCP page size input on settings page

## Why
The project settings page is missing controls for editing the project name (title) and slug, even though the backend already supports these updates. Additionally, the MCP Items Per Page number input renders browser-native spinner buttons (up/down arrows) which look out of place in the UI.

## What Changes
- Add a "Project Identity" card to the settings page with editable fields for project name (title) and slug
- Remove the browser-native spinner buttons from the MCP Items Per Page number input (CSS or input type change)

## Impact
- Affected specs: `project-management` (new requirement for settings page UI)
- Affected code: `apps/frontend/src/routes/_auth/$projectId/settings.tsx`, potentially `packages/ui/src/components/input.tsx` or inline CSS
