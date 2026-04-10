## MODIFIED Requirements

### Requirement: Data Browser Read-Only Constraint

The data browser SHALL be strictly read-only. No API endpoints or UI controls SHALL allow data insertion, update, deletion, or schema modification. All DuckDB queries issued by the data browser endpoints SHALL be SELECT statements only. All identifier values (database, schema, table names) used in query construction SHALL be validated against the identifier pattern `/^[a-zA-Z_][a-zA-Z0-9_]*$/` before interpolation into SQL. The database name SHALL additionally be verified against the list of attached databases for the project.

#### Scenario: No mutation controls in UI

- **WHEN** the user views the data browser page
- **THEN** no edit, delete, insert, or DDL controls are present

#### Scenario: API rejects non-SELECT queries

- **WHEN** the data browser API constructs a DuckDB query
- **THEN** the query is always a SELECT or metadata query (SHOW, information_schema)

#### Scenario: Invalid identifier rejected

- **WHEN** a data browser API request includes a database, schema, or table name that does not match the identifier pattern
- **THEN** a 400 error is returned before any SQL is executed
