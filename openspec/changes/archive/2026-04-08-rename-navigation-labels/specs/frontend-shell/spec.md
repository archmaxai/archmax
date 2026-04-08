## MODIFIED Requirements
### Requirement: Sidebar Navigation

The sidebar SHALL display navigation items below the project selector. Each item has an icon and a label. Top-level items are: Data Federation, Semantic Models, Testing, MCP Access, and Settings. Data Federation is a collapsible group containing: Data Sources and Browser. The active route is visually highlighted.

#### Scenario: Navigate to Data Sources

- **WHEN** the user clicks the Data Sources nav item under Data Federation
- **THEN** the URL changes to `/<projectId>/connections`
- **AND** the Data Sources item is highlighted as active

#### Scenario: Navigate to Semantic Models

- **WHEN** the user clicks the Semantic Models nav item
- **THEN** the URL changes to `/<projectId>/models`
- **AND** the Semantic Models item is highlighted as active

#### Scenario: Navigate to MCP Access

- **WHEN** the user clicks the MCP Access nav item
- **THEN** the URL changes to `/<projectId>/mcp-access`
- **AND** the MCP Access item is highlighted as active
