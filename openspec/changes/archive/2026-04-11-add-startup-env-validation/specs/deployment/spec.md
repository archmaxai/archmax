## ADDED Requirements

### Requirement: Entrypoint Environment Pre-flight Check

The Docker entrypoint script SHALL validate that critical environment variables (`BETTER_AUTH_SECRET`, `UI_PASSWORD`) are set before starting Node.js processes. When validation fails, the entrypoint SHALL print a human-readable error message listing each missing variable with a description of its purpose and a fix hint, then execute `sleep infinity` to keep the container running without crash-looping.

The pre-flight check SHALL run after embedded MongoDB/Redis setup (so `MONGODB_URI` and `REDIS_URL` are already resolved) but before spawning the worker or API server.

#### Scenario: Required variable missing in Docker

- **WHEN** the container starts without `BETTER_AUTH_SECRET` set
- **THEN** the entrypoint prints an error banner listing the missing variable and its purpose
- **AND** the container stays running via `sleep infinity` (exit code 0 on SIGTERM)
- **AND** no Node.js process is started

#### Scenario: All required variables present

- **WHEN** the container starts with all required environment variables set
- **THEN** the entrypoint proceeds to start the worker, API server, and nginx as normal

## MODIFIED Requirements

### Requirement: Single Docker Image Deployment

The Dockerfile SHALL create the `archmax` system user with `-m -d /home/archmax` so that `/home/archmax` serves as both the user's `HOME` and the root of all persistent application data.

The entrypoint SHALL validate critical environment variables before starting application processes. When validation fails, the container stays running with a clear error message instead of crash-looping.

#### Scenario: Non-root process execution

- **WHEN** the container starts
- **THEN** the API server, worker, and nginx processes run as the non-root `archmax` user
- **AND** the `/home/archmax/projects` directory is writable by the `archmax` user
- **AND** `HOME` resolves to `/home/archmax` so DuckDB can write its extension cache to `~/.duckdb/`

#### Scenario: Container stays up on bad configuration

- **WHEN** the container starts with missing or invalid required environment variables
- **THEN** the container remains running (does not exit or crash-loop)
- **AND** `docker logs` shows a human-readable error with fix instructions
- **AND** no stack traces or raw JSON error output appear in the logs
