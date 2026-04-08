# data-browser Specification

## Purpose
TBD - created by archiving change add-data-browser. Update Purpose after archive.
## Requirements
### Requirement: List Databases API

The API SHALL expose a `GET /api/projects/:projectId/data-browser/databases` endpoint that returns the list of attached DuckDB databases (schemas) for the project. Each entry SHALL include the database name (connection slug). The endpoint SHALL require authentication.

#### Scenario: List databases for a project with connections

- **WHEN** a GET request is made to `/api/projects/:projectId/data-browser/databases` for a project with active connections
- **THEN** the response contains an array of database objects, each with a `name` field corresponding to the connection slug
- **AND** only databases from active, non-deleted connections are included

#### Scenario: List databases for a project with no connections

- **WHEN** a GET request is made to `/api/projects/:projectId/data-browser/databases` for a project with no active connections
- **THEN** the response contains an empty array

#### Scenario: Invalid project ID

- **WHEN** a GET request is made with a non-existent project ID
- **THEN** a 404 error is returned

### Requirement: List Tables API

The API SHALL expose a `GET /api/projects/:projectId/data-browser/databases/:database/tables` endpoint that returns the list of tables within the specified attached database. Each entry SHALL include the table name and schema name. The endpoint SHALL require authentication.

#### Scenario: List tables for a valid database

- **WHEN** a GET request is made to `/api/projects/:projectId/data-browser/databases/:database/tables`
- **THEN** the response contains an array of table objects with `name` and `schema` fields

#### Scenario: Database not found

- **WHEN** a GET request targets a database name that is not attached to the project's DuckDB instance
- **THEN** a 404 error is returned

### Requirement: Paginated Table Data API

The API SHALL expose a `GET /api/projects/:projectId/data-browser/databases/:database/tables/:schema/:table/data` endpoint that returns paginated row data from the specified table. The endpoint SHALL accept `page` (default 1) and `pageSize` (default 50, max 500) query parameters. The response SHALL include `rows` (array of row objects), `columns` (array of column metadata with name and type), `total` (total row count), `page`, and `pageSize`. The endpoint SHALL require authentication and SHALL be read-only.

#### Scenario: Fetch first page of table data

- **WHEN** a GET request is made to the table data endpoint without pagination parameters
- **THEN** the response contains up to 50 rows from the table
- **AND** the response includes column metadata, total row count, page number 1, and page size 50

#### Scenario: Fetch specific page

- **WHEN** a GET request is made with `page=3&pageSize=20`
- **THEN** the response contains up to 20 rows starting at offset 40
- **AND** the `page` field is 3 and `pageSize` is 20

#### Scenario: Page size exceeds maximum

- **WHEN** a GET request is made with `pageSize=1000`
- **THEN** the page size is clamped to 500

#### Scenario: Table not found

- **WHEN** a GET request targets a table that does not exist in the specified database
- **THEN** a 404 error is returned

### Requirement: Data Browser Frontend Page

The frontend SHALL render a data browser page at `/$projectId/data` that displays the project's attached databases and their tables in a navigable layout. The left panel SHALL list databases as expandable sections, each showing its tables. Selecting a table SHALL display its data in a paginated table on the right.

#### Scenario: View databases and tables

- **WHEN** the user navigates to `/$projectId/data`
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

### Requirement: Data Browser Read-Only Constraint

The data browser SHALL be strictly read-only. No API endpoints or UI controls SHALL allow data insertion, update, deletion, or schema modification. All DuckDB queries issued by the data browser endpoints SHALL be SELECT statements only.

#### Scenario: No mutation controls in UI

- **WHEN** the user views the data browser page
- **THEN** no edit, delete, insert, or DDL controls are present

#### Scenario: API rejects non-SELECT queries

- **WHEN** the data browser API constructs a DuckDB query
- **THEN** the query is always a SELECT or metadata query (SHOW, information_schema)

