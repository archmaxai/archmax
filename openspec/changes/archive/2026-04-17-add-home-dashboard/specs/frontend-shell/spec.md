## MODIFIED Requirements

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
