## MODIFIED Requirements

### Requirement: Data Browser Frontend Page

The frontend SHALL render the data browser inside a full-width/full-height overlay dialog opened from the Data Sources page header (Browser button, or deep link `/$projectId/connections?tool=browser`). The browser SHALL display the project's attached databases and their tables in a navigable layout: the left panel SHALL list databases as expandable sections, each showing its tables; selecting a table SHALL display its data in a paginated table on the right.

The previous standalone routes (`/$projectId/data` and `/$projectId/connections/data`) SHALL no longer render their own pages and SHALL redirect to `/$projectId/connections?tool=browser`.

#### Scenario: View databases and tables

- **WHEN** the user opens the Browser dialog from the Data Sources page
- **THEN** the left panel lists all attached databases
- **AND** expanding a database reveals its tables

#### Scenario: Select table and view data

- **WHEN** the user clicks on a table name
- **THEN** the right panel displays the table's data in a paginated table
- **AND** column headers show column names and types
- **AND** pagination controls are visible at the bottom

#### Scenario: Navigate between pages

- **WHEN** the user clicks a pagination control (next, previous, or page number)
- **THEN** the table data updates to show the corresponding page

#### Scenario: No connections

- **WHEN** the project has no active connections
- **THEN** an empty state message is displayed indicating no databases are available

#### Scenario: Legacy browser routes redirect

- **WHEN** the user navigates to `/$projectId/data` or `/$projectId/connections/data`
- **THEN** they are redirected to `/$projectId/connections?tool=browser`
- **AND** the Browser dialog opens automatically
