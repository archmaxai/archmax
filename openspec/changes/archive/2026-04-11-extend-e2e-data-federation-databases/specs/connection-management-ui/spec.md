## ADDED Requirements

### Requirement: File-backed database connection details

For connection types `sqlite` and `duckdb`, when the user selects **Connection Details** (structured fields) rather than **Connection URI**, the form SHALL present a single primary input for the database file path with a clear label (e.g. **Database file path**). The form SHALL NOT display Host, Port, User, or Password fields for these types in Details mode. Shared fields (name, slug, description, schema controls if applicable) SHALL behave as for other types. The **Connection URI** tab SHALL remain available and unchanged.

#### Scenario: SQLite uses path-only details

- **WHEN** the user creates a connection with type `sqlite` and the Connection Details tab
- **THEN** Host, Port, User, and Password inputs are not shown
- **AND** the user enters a file path that is stored in `connectionConfig` such that the backend can attach the database (e.g. `database` holds the path)

#### Scenario: DuckDB file uses path-only details

- **WHEN** the user creates a connection with type `duckdb` and the Connection Details tab
- **THEN** Host, Port, User, and Password inputs are not shown
- **AND** the user enters a file path suitable for DuckDB native attachment
