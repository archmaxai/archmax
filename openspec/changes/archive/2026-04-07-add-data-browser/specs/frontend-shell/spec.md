## MODIFIED Requirements

### Requirement: Sidebar Navigation

The sidebar SHALL display navigation items below the project selector. Each item has an icon and a label. The items are: Data Connections, Semantic Models, Data Browser, Monitoring, and Settings. The active route is visually highlighted.

#### Scenario: Navigate to Data Connections

- **WHEN** the user clicks the Data Connections nav item
- **THEN** the URL changes to `/<projectId>/connections`
- **AND** the Data Connections item is highlighted as active

#### Scenario: Navigate to Semantic Models

- **WHEN** the user clicks the Semantic Models nav item
- **THEN** the URL changes to `/<projectId>/models`
- **AND** the Semantic Models item is highlighted as active

#### Scenario: Navigate to Data Browser

- **WHEN** the user clicks the Data Browser nav item
- **THEN** the URL changes to `/<projectId>/data`
- **AND** the Data Browser item is highlighted as active
