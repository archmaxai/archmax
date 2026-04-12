## ADDED Requirements

### Requirement: CSV Data Source E2E Tests

The E2E test suite SHALL include tests that verify CSV data source functionality end-to-end. Tests SHALL run against the Docker Compose stack alongside existing database federation tests. A CSV fixture file SHALL be included in the E2E fixtures. Tests SHALL cover: uploading a CSV file, creating a CSV connection referencing the uploaded file, testing the CSV connection, and querying CSV data through the data browser or API.

#### Scenario: E2E CSV upload and connection creation

- **WHEN** the E2E test uploads a CSV fixture file to a project via the document upload API
- **AND** creates a CSV connection referencing that file
- **THEN** the connection appears in the connections list with type `csv`

#### Scenario: E2E CSV connection test

- **WHEN** the E2E test triggers a connection test for the CSV connection
- **THEN** the test reports success (`{ ok: true }`)

#### Scenario: E2E CSV query via API

- **WHEN** the E2E test executes a SQL query against the CSV connection's schema (e.g., `SELECT COUNT(*) FROM <slug>.<table>`)
- **THEN** the query returns results with the expected row count from the fixture CSV

### Requirement: CSV Data Source Unit and Integration Tests

The test suite SHALL include unit tests for CSV-specific DuckDB attach logic and integration tests for the CSV connection API routes. Unit tests SHALL cover: file path resolution and validation, `read_csv` parameter building, table name sanitization from filenames, and error handling for missing or malformed CSV files. Integration tests SHALL cover: creating a CSV connection with valid config, creating a CSV connection with a nonexistent file (400 error), creating a CSV connection with path traversal attempt (400 error), and testing a CSV connection.

#### Scenario: Unit test for CSV attach to DuckDB

- **WHEN** a unit test calls the CSV attach function with a valid CSV file path
- **THEN** the function creates a DuckDB schema and materializes the CSV into a table
- **AND** the table is queryable

#### Scenario: Unit test for filename sanitization

- **WHEN** a unit test passes filenames with various characters (spaces, dots, hyphens, unicode)
- **THEN** the sanitization function returns valid SQL identifiers

#### Scenario: Integration test for CSV connection creation

- **WHEN** an integration test POSTs to create a CSV connection with `type: "csv"` and `filename: "test.csv"`
- **AND** the file exists in the project's uploads directory
- **THEN** a 201 response is returned with the connection details

#### Scenario: Integration test for missing CSV file

- **WHEN** an integration test POSTs to create a CSV connection with a filename that does not exist
- **THEN** a 400 response is returned with an error message
