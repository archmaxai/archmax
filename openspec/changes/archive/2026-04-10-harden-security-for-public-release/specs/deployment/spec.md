## MODIFIED Requirements

### Requirement: Single Docker Image Deployment

The system SHALL ship a single Docker image that bundles the API server, BullMQ worker, frontend SPA, and nginx reverse proxy. The image MUST be runnable with `docker run` and the following environment variables: `BETTER_AUTH_SECRET`, `UI_PASSWORD`, and `MONGODB_URI`.

The image SHALL NOT include MongoDB. `MONGODB_URI` is a required environment variable pointing to an external MongoDB instance.

When `REDIS_URL` is not provided, the container SHALL start an embedded `redis-server` process with data stored in `/tmp/redis`.

The production Docker image SHALL run all application processes as a non-root user. The Dockerfile SHALL create a dedicated system user (e.g., `archmax`) and switch to it via the `USER` directive before the entrypoint. Only initial setup steps (package installation, directory creation) SHALL run as root.

#### Scenario: Startup with external MongoDB and embedded Redis

- **WHEN** the container starts with `MONGODB_URI` set and `REDIS_URL` not set
- **THEN** the entrypoint starts embedded `redis-server` (binding to `127.0.0.1:6379`, data at `/tmp/redis`)
- **AND** sets `REDIS_URL=redis://127.0.0.1:6379` for the application processes
- **AND** connects to the external MongoDB instance via `MONGODB_URI`

#### Scenario: Startup with all external services

- **WHEN** the container starts with both `MONGODB_URI` and `REDIS_URL` set
- **THEN** the entrypoint does NOT start embedded `redis-server`
- **AND** the application connects to the external MongoDB and Redis instances

#### Scenario: Missing MONGODB_URI

- **WHEN** the container starts without `MONGODB_URI` set
- **THEN** the application fails with a clear error message indicating that `MONGODB_URI` is required

#### Scenario: External Redis provided

- **WHEN** `REDIS_URL` is set to an external Redis connection URL
- **THEN** the entrypoint does NOT start embedded `redis-server`
- **AND** the application uses the external Redis for BullMQ and pub/sub

#### Scenario: Non-root process execution

- **WHEN** the container starts
- **THEN** the API server, worker, and nginx processes run as the non-root `archmax` user
- **AND** the `/app/data/projects` directory is writable by the `archmax` user
