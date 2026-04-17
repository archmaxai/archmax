# frontend-shell Specification

## Purpose
The app shell layout for the admin UI: sidebar with project selector, navigation menu, and user profile menu. Provides project-scoped routing and the visual frame for all authenticated pages.
## Requirements
### Requirement: App Shell Layout

The frontend SHALL render a sidebar-based app shell with a fixed left sidebar and a main content area. The sidebar SHALL contain (top to bottom): the archmax logo with a version badge, a project selector, navigation menu items, and a user profile menu.

The version badge SHALL display the application version (e.g., `v0.3.1`) as a small pill-shaped tag immediately to the right of the "archmax" brand text. The badge SHALL use muted styling (small font size, rounded-full, low-contrast background) to avoid competing with the brand text. The badge SHALL be hidden when the sidebar is collapsed.

The version string SHALL be fetched at runtime from the authenticated `GET /api/version` endpoint. The query SHALL use `staleTime: Infinity` so the version is fetched once per session. If the fetch fails or the version is not available, the badge SHALL not be rendered.

#### Scenario: Authenticated user sees sidebar shell

- **WHEN** an authenticated user navigates to any project-scoped route
- **THEN** the sidebar is rendered on the left
- **AND** the main content area fills the remaining space
- **AND** the archmax logo is displayed at the top of the sidebar with a version badge to its right
- **AND** the browser tab title reads "archmax"

#### Scenario: Unauthenticated user is redirected

- **WHEN** an unauthenticated user navigates to any route
- **THEN** they are redirected to the login page
- **AND** the login page displays "archmax" as the product title

#### Scenario: Version badge shows release version

- **WHEN** the backend reports version `0.4.0` from the authenticated endpoint
- **THEN** the sidebar displays a badge reading "v0.4.0" next to the "archmax" text

#### Scenario: Version badge hidden when sidebar collapsed

- **WHEN** the sidebar is in collapsed state
- **THEN** the version badge is not visible

#### Scenario: Version badge not shown when fetch fails

- **WHEN** the version endpoint returns an error
- **THEN** the sidebar displays "archmax" without a version badge

### Requirement: Project Selector

The sidebar SHALL display a project selector above the navigation menu. The selector shows the currently active project name and allows switching between projects via a dropdown. A "+" button next to the selector SHALL open a dialog to create a new project.

#### Scenario: Switch project

- **WHEN** the user selects a different project from the dropdown
- **THEN** the URL updates to `/<newProjectId>` (the project dashboard)
- **AND** all content reloads for the new project context

#### Scenario: Create project via selector

- **WHEN** the user clicks the "+" button in the project selector
- **THEN** a dialog opens for entering project title and description
- **AND** on submission, the new project is created via the API
- **AND** the user is navigated to the new project

#### Scenario: No projects exist

- **WHEN** the user has no projects
- **THEN** the project selector shows a prompt to create the first project

### Requirement: Sidebar Navigation

The sidebar SHALL display navigation items below the project selector. Each item has an icon and a label. The top-level items are: Home, Data Federation, Semantic Models, Testing, MCP Access, and Settings. The active route is visually highlighted.

The Home item SHALL be a leaf link pointing to `/$projectId` (the project dashboard). It SHALL use exact-match active detection so it is only highlighted when the user is on the dashboard, not on any sub-route.

The Data Federation item SHALL be a collapsible group with two sub-items: Data Sources (`/$projectId/connections`) and Browser (`/$projectId/connections/data`).

The Testing item SHALL be a collapsible group with four sub-items: Test Agents (`/$projectId/testing/agents`), Test Cases (`/$projectId/testing/cases`), Test Runs (`/$projectId/testing/runs`), and Playground (`/$projectId/testing/playground`). The group expands automatically when the active route is within the testing section. Clicking the Testing label toggles the group open/closed.

The MCP Access item SHALL be a collapsible group with two sub-items: Tokens (`/$projectId/mcp-access`) and Log (`/$projectId/monitoring`).

#### Scenario: Navigate to Home

- **WHEN** the user clicks the Home nav item
- **THEN** the URL changes to `/<projectId>`
- **AND** the Home item is highlighted as active

#### Scenario: Home not active on sub-routes

- **WHEN** the user is on `/<projectId>/connections`
- **THEN** the Home item is not highlighted
- **AND** the Data Federation group is highlighted instead

#### Scenario: Navigate to Data Connections

- **WHEN** the user clicks the Data Connections nav item
- **THEN** the URL changes to `/<projectId>/connections`
- **AND** the Data Connections item is highlighted as active

#### Scenario: Navigate to Semantic Models

- **WHEN** the user clicks the Semantic Models nav item
- **THEN** the URL changes to `/<projectId>/models`
- **AND** the Semantic Models item is highlighted as active

#### Scenario: Navigate to MCP Access

- **WHEN** the user clicks the MCP Access nav item
- **THEN** the URL changes to `/<projectId>/mcp-access`
- **AND** the MCP Access item is highlighted as active

#### Scenario: Navigate to Testing sub-item

- **WHEN** the user clicks a Testing sub-item (Test Agents, Test Cases, Test Runs, or Playground)
- **THEN** the URL changes to the corresponding route (e.g. `/<projectId>/testing/runs`)
- **AND** the sub-item is highlighted as active
- **AND** the Testing group is expanded

#### Scenario: Testing group auto-expands on active route

- **WHEN** the user navigates to any `/<projectId>/testing/*` route
- **THEN** the Testing group is automatically expanded
- **AND** the matching sub-item is highlighted

#### Scenario: Collapse Testing group

- **WHEN** the user clicks the Testing group label while it is expanded
- **THEN** the sub-items are hidden
- **AND** clicking again re-expands the group

### Requirement: User Profile Menu

The sidebar SHALL display a user profile menu at the bottom. It shows the user's avatar and name. Clicking it opens a dropdown with theme selection (light/dark/system) and a logout option.

#### Scenario: User logs out via menu

- **WHEN** the user clicks "Sign out" in the profile dropdown
- **THEN** the session is terminated
- **AND** the user is redirected to the login page

#### Scenario: User switches theme

- **WHEN** the user selects a theme option (light, dark, system)
- **THEN** the theme class on the HTML element updates accordingly

### Requirement: Project-Scoped Routing

All main content routes SHALL be scoped under `/$projectId/`. A layout route at `/_auth/$projectId` SHALL fetch the project data and provide it via React context, plus render the sidebar shell.

#### Scenario: Invalid project ID in URL

- **WHEN** the user navigates to a URL with a non-existent project ID
- **THEN** a 404 or redirect to project selection is shown

