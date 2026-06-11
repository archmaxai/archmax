## MODIFIED Requirements

### Requirement: Sidebar Navigation

The sidebar SHALL display navigation items below the project selector. Each item has an icon and a label. The top-level items are, in order: Home, Connections, Builder, Agent, Testing, MCP Access, and Settings. The active route is visually highlighted.

The Home item SHALL be a leaf link pointing to `/$projectId` (the project dashboard). It SHALL use exact-match active detection so it is only highlighted when the user is on the dashboard, not on any sub-route.

The Connections item SHALL be a collapsible group with two sub-items: **Data Sources** (`/$projectId/connections`) and **APIs**. The APIs sub-item SHALL be rendered greyed out (muted/disabled styling), SHALL display a small "soon" tag, and SHALL NOT be clickable or navigate anywhere. Browser and Console SHALL NOT appear in the sidebar (they are reachable from the Data Sources page header).

The Builder item SHALL be a leaf link pointing to `/$projectId/models` (the former "Semantic Models" entry, renamed).

The Agent item SHALL be a leaf link pointing to `/$projectId/agent` (the agent playground).

The Testing item SHALL be a collapsible group with two sub-items: Test Cases (`/$projectId/testing/cases`) and Test Runs (`/$projectId/testing/runs`). The group expands automatically when the active route is within the testing section. Clicking the Testing label toggles the group open/closed. Test Agents and Playground SHALL NOT appear under Testing.

The MCP Access item SHALL be a collapsible group with two sub-items: Tokens (`/$projectId/mcp-access`) and Log (`/$projectId/monitoring`).

The Settings item SHALL be a collapsible group with three sub-items: General (`/$projectId/settings`), Builder (`/$projectId/settings/builder`), and Agent (`/$projectId/settings/agent`). The group expands automatically when the active route is within the settings section.

Removed or moved routes SHALL redirect: `/$projectId/testing/playground` → `/$projectId/agent`, `/$projectId/testing/agents` → `/$projectId/settings/agent`, `/$projectId/connections/data` → `/$projectId/connections?tool=browser`, `/$projectId/connections/console` → `/$projectId/connections?tool=console`, and the legacy `/$projectId/data` → `/$projectId/connections?tool=browser`.

#### Scenario: Navigate to Home

- **WHEN** the user clicks the Home nav item
- **THEN** the URL changes to `/<projectId>`
- **AND** the Home item is highlighted as active

#### Scenario: Home not active on sub-routes

- **WHEN** the user is on `/<projectId>/connections`
- **THEN** the Home item is not highlighted
- **AND** the Connections group is highlighted instead

#### Scenario: Navigate to Data Sources

- **WHEN** the user clicks the Data Sources sub-item under Connections
- **THEN** the URL changes to `/<projectId>/connections`
- **AND** the Data Sources item is highlighted as active

#### Scenario: APIs entry is inactive with soon tag

- **WHEN** the user views the expanded Connections group
- **THEN** an APIs entry is shown in greyed-out styling with a "soon" tag
- **AND** clicking it does not navigate or change the URL

#### Scenario: Navigate to Builder

- **WHEN** the user clicks the Builder nav item
- **THEN** the URL changes to `/<projectId>/models`
- **AND** the Builder item is highlighted as active

#### Scenario: Navigate to Agent

- **WHEN** the user clicks the Agent nav item
- **THEN** the URL changes to `/<projectId>/agent`
- **AND** the Agent item is highlighted as active

#### Scenario: Navigate to MCP Access

- **WHEN** the user clicks the MCP Access nav item
- **THEN** the URL changes to `/<projectId>/mcp-access`
- **AND** the MCP Access item is highlighted as active

#### Scenario: Navigate to Testing sub-item

- **WHEN** the user clicks a Testing sub-item (Test Cases or Test Runs)
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

#### Scenario: Navigate to Settings sub-item

- **WHEN** the user clicks the Agent sub-item under Settings
- **THEN** the URL changes to `/<projectId>/settings/agent`
- **AND** the sub-item is highlighted and the Settings group is expanded

#### Scenario: Legacy playground route redirects

- **WHEN** the user navigates to `/<projectId>/testing/playground`
- **THEN** they are redirected to `/<projectId>/agent`

#### Scenario: Legacy test agents route redirects

- **WHEN** the user navigates to `/<projectId>/testing/agents`
- **THEN** they are redirected to `/<projectId>/settings/agent`
