# data-sources Specification

## Purpose
Management of database connection descriptors and their semantic table/column metadata. Data sources are the core entities that describe external databases and their schema semantics.

## Requirements

### Requirement: Data Source CRUD

The API SHALL provide CRUD endpoints for data sources at `/api/data-sources`.

#### Scenario: List all data sources

- **WHEN** a GET request is made to `/api/data-sources`
- **THEN** all data sources are returned sorted by creation date descending

#### Scenario: Create a data source

- **WHEN** a POST request is made to `/api/data-sources` with valid JSON
- **THEN** a new data source is created and returned with status 201

#### Scenario: Update a data source

- **WHEN** a PUT request is made to `/api/data-sources/:id` with partial fields
- **THEN** the data source is updated and the new version is returned

#### Scenario: Delete a data source

- **WHEN** a DELETE request is made to `/api/data-sources/:id`
- **THEN** the data source is removed and `{ "ok": true }` is returned

#### Scenario: Data source not found

- **WHEN** a GET/PUT/DELETE targets a non-existent ID
- **THEN** a 404 error is returned

### Requirement: Data Source Schema

A data source SHALL have the following fields: `name` (unique), `type` (postgres|mysql|mssql|mongodb), `description`, `connectionString`, `tables` (array of table descriptions), `isActive`, timestamps.

#### Scenario: Unique name constraint

- **WHEN** a data source is created with a name that already exists
- **THEN** a duplicate key error is returned

### Requirement: Table Descriptions

Each table description within a data source SHALL include `name`, optional `schema`, `description`, and an array of column descriptions with `name`, `type`, `description`, `isPrimaryKey`, `isForeignKey`, and optional `references`.

#### Scenario: Table with foreign key reference

- **WHEN** a table column has `isForeignKey: true` and `references: { table, column }`
- **THEN** the column's relationship to another table is recorded

### Requirement: Zod Validation

All data source create/update requests SHALL be validated using Zod schemas via `@hono/zod-validator`.

#### Scenario: Invalid create request

- **WHEN** a POST request is missing the required `name` field
- **THEN** a 400 validation error is returned
