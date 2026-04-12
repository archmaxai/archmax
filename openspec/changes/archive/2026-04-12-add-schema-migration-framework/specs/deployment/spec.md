## MODIFIED Requirements

### Requirement: Single Docker Image Deployment

The Dockerfile SHALL create the `archmax` system user and a dedicated `/data` directory (owned by `archmax`) as the root of all persistent application data, with `HOME=/data`.

The entrypoint SHALL validate critical environment variables before starting application processes. When validation fails, the container stays running with a clear error message instead of crash-looping.

The API server SHALL await database connection, schema migrations, and admin seeding to complete before accepting HTTP traffic. The worker SHALL await database connection and schema migrations before processing jobs.

#### Scenario: Non-root process execution

- **WHEN** the container starts
- **THEN** the API server, worker, and nginx processes run as the non-root `archmax` user
- **AND** `ARCHMAX_DATA_DIR/projects` is writable by the `archmax` user
- **AND** `HOME` is set to `ARCHMAX_DATA_DIR` so DuckDB can write its extension cache to `~/.duckdb/` (i.e. `$ARCHMAX_DATA_DIR/.duckdb/`)

#### Scenario: Container stays up on bad configuration

- **WHEN** the container starts with missing or invalid required environment variables
- **THEN** the container remains running (does not exit or crash-loop)
- **AND** `docker logs` shows a human-readable error with fix instructions
- **AND** no stack traces or raw JSON error output appear in the logs

#### Scenario: Migrations complete before traffic

- **WHEN** the API server starts
- **THEN** database connection, schema migrations, and admin seeding complete before the HTTP server begins accepting requests
