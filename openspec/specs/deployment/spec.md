# deployment Specification

## Purpose
TBD - created by archiving change add-single-image-deployment. Update Purpose after archive.
## Requirements
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

### Requirement: Unified Data Directory

All persistent application data MUST reside under a single root directory (`/app/data/` in Docker). The directory layout SHALL be:

- `/app/data/projects/` — semantic model YAML files (`ARCHMAX_DATA_DIR`)
- `/app/data/mongodb/` — embedded MongoDB data files (only when using embedded MongoDB)

Redis data SHALL be stored in `/tmp/redis` and is explicitly ephemeral (not backed up). When using an external MongoDB via `MONGODB_URI`, the `/app/data/mongodb/` directory is unused.

#### Scenario: Single volume mount captures all persistent data

- **WHEN** a user mounts a single host volume to `/app/data`
- **THEN** both semantic model files and embedded MongoDB data are persisted across container restarts

#### Scenario: Data directory is created on first run

- **WHEN** the container starts for the first time with a fresh volume
- **THEN** the entrypoint creates `/app/data/projects/` and `/app/data/mongodb/` if they do not exist

### Requirement: Docker Compose Production Configuration

The repository SHALL include a `docker-compose.yml` at the project root as the recommended deployment method. The Compose file SHALL define:

- An `archmax` service using the project Docker image with `MONGODB_URI` and `REDIS_URL` pointing to companion services
- A `mongo` service using `mongo:8` with a named volume for data persistence
- A `redis` service using `redis:8-alpine` with no persistence
- Named volumes for `archmax-data` and `mongo-data`

The `docker-compose.yml` SHALL be the primary quick-start method documented in the installation guide.

#### Scenario: Compose stack starts successfully

- **WHEN** a user runs `docker compose up -d` with required environment variables set
- **THEN** all three services start and the archmax application connects to the external MongoDB and Redis instances
- **AND** the embedded Redis inside the archmax container is NOT started (because `REDIS_URL` is provided)

### Requirement: Deployment Documentation

The documentation site SHALL provide comprehensive deployment guidance across multiple pages:

**Installation page** (`getting-started/installation`):
- The primary quick start MUST use `docker compose up` with the repository-root `docker-compose.yml`, requiring `BETTER_AUTH_SECRET`, `UI_PASSWORD`, and a MongoDB connection.
- A `docker run` section MUST document the standalone approach, noting that only `BETTER_AUTH_SECRET` and `UI_PASSWORD` are required (MongoDB and Redis are embedded automatically).
- A clear note MUST explain that MongoDB is embedded automatically when `MONGODB_URI` is omitted, and Redis is embedded automatically when `REDIS_URL` is omitted.

**Configuration reference** (`reference/configuration`):
- `MONGODB_URI` MUST be documented as optional with a note that the Docker image embeds MongoDB when unset.
- A "Data Directory" section MUST document the `/app/data/` layout (`projects/`, `mongodb/`) and the single-volume backup strategy.
- `REDIS_URL` MUST include a note that the Docker image embeds Redis when unset.

**Self-hosting guide** (`guides/self-hosting`):
- A dedicated page MUST cover deployment modes (Docker Compose as recommended for production, standalone `docker run` with embedded services for simple setups).
- Data backup instructions MUST explain how to back up the `/app/data` volume (covering both project files and embedded MongoDB data) and external MongoDB data separately when using Compose.
- The page MUST be linked in the documentation sidebar.

#### Scenario: User follows Compose quickstart

- **WHEN** a new user reads the installation documentation
- **THEN** they find `docker compose up` as the primary quick-start method
- **AND** the guide shows how to set required environment variables
- **AND** MongoDB is listed as provided by the Compose stack (not embedded)

#### Scenario: User follows standalone docker run

- **WHEN** a user reads the standalone Docker section
- **THEN** they find a `docker run` command listing only `BETTER_AUTH_SECRET` and `UI_PASSWORD` as required
- **AND** a note explains that `MONGODB_URI` and `REDIS_URL` are optional (embedded fallbacks available)

#### Scenario: User looks up MONGODB_URI in configuration reference

- **WHEN** a user reads the configuration reference
- **THEN** `MONGODB_URI` is listed as optional
- **AND** a note explains that the Docker image embeds MongoDB when unset

#### Scenario: User needs to back up data

- **WHEN** a user reads the self-hosting guide
- **THEN** they find instructions for backing up the `/app/data` volume (semantic models and embedded MongoDB)
- **AND** separate guidance for backing up external MongoDB data via the Compose volume or managed service

### Requirement: Docker Reference Page

The documentation site SHALL include a dedicated Docker reference page (`reference/docker`) that serves as the canonical, in-depth resource for running archmax via Docker. The page MUST cover:

- **Image contents**: what is bundled (API server, BullMQ worker, frontend SPA, nginx reverse proxy, embedded MongoDB, embedded Redis)
- **Exposed ports**: `8080` (nginx -> API + SPA)
- **Environment variables**: a complete table listing every variable the image accepts, its default value, whether it is required or optional, and Docker-specific behavior notes (e.g. `MONGODB_URI` — omit to use embedded MongoDB, `REDIS_URL` — omit to use embedded Redis)
- **Volumes**: `/app/data` (persistent — `projects/` and `mongodb/`), `/tmp/redis` (ephemeral)
- **Entrypoint behavior**: the decision tree for starting embedded MongoDB and/or Redis vs. using external, startup ordering (mongod -> redis-server -> worker -> API -> nginx), and how `MONGODB_URI` / `REDIS_URL` gate the embedded services
- **Docker Compose reference**: explanation of the repo-root `docker-compose.yml` services, volumes, and networking
- **Health checks**: recommended Docker `HEALTHCHECK` or liveness probe commands
- **Resource recommendations**: minimum RAM and disk for small and medium deployments
- **Troubleshooting**: common issues (port conflicts, volume permissions, MongoDB/Redis connection failures, log locations)

The page MUST be linked in the documentation sidebar under "Reference".

#### Scenario: User looks up Docker volume configuration

- **WHEN** a user reads the Docker reference page
- **THEN** they find a volumes section listing `/app/data` as the persistent mount point
- **AND** the section explains that `projects/` and `mongodb/` live under `/app/data` and that `/tmp/redis` is ephemeral

#### Scenario: User looks up entrypoint behavior

- **WHEN** a user reads the Docker reference page
- **THEN** they find a section explaining the startup decision tree
- **AND** it documents that omitting `MONGODB_URI` triggers embedded `mongod` and omitting `REDIS_URL` triggers embedded `redis-server`

#### Scenario: User troubleshoots container startup failure

- **WHEN** a user's container fails to start and they consult the Docker reference
- **THEN** they find a troubleshooting section with common issues and remedies
- **AND** MongoDB connection errors are covered with guidance on verifying `MONGODB_URI` or checking embedded `mongod` logs

### Requirement: CI Docker Image Builds

The CI pipeline SHALL build the Docker image on every pull request to catch build failures before merge. A dedicated GitHub Actions workflow (`.github/workflows/pr-docker-build.yml`) SHALL:

- Trigger on `pull_request` events (`opened`, `synchronize`) targeting `main`
- Build the Docker image using BuildKit with GitHub Actions layer caching (`type=gha`)
- Push the image to `ghcr.io/<repository>:pr-<number>` so reviewers can test the exact PR build
- Post (or update) a comment on the PR with the `docker pull` command for the built image

On release (merged PR with a `release` label), a separate workflow SHALL build and push the final image tagged with both `latest` and the semver version (`ghcr.io/<repository>:<version>`).

#### Scenario: PR opened or updated

- **WHEN** a pull request is opened or a new commit is pushed to a PR targeting `main`
- **THEN** the CI workflow builds the Docker image
- **AND** pushes it to `ghcr.io/<repository>:pr-<pr-number>`
- **AND** posts a comment on the PR with the pull command

#### Scenario: PR comment is updated on subsequent pushes

- **WHEN** a PR already has a Docker image comment from a previous push
- **AND** a new commit is pushed to the PR
- **THEN** the existing comment is updated (not duplicated) with the latest image reference

#### Scenario: Release build on merge

- **WHEN** a PR with a `release`, `release:minor`, or `release:major` label is merged to `main`
- **THEN** the release workflow creates a GitHub release with a semver tag
- **AND** builds and pushes the Docker image tagged as `latest` and `<version>` to ghcr.io

### Requirement: Docker Health Check

The Dockerfile SHALL include a `HEALTHCHECK` instruction that probes the API health endpoint to provide native container health status to Docker and orchestrators.

The `HEALTHCHECK` SHALL:
- Use `curl -sf http://127.0.0.1:3000/api/health` to hit the API directly (bypassing nginx)
- Poll every 30 seconds with a 5-second timeout
- Allow a 15-second start period for embedded services (MongoDB, Redis) to boot
- Retry 3 times before marking the container as unhealthy

#### Scenario: Container reports healthy after startup

- **WHEN** the container starts and all services (API, MongoDB, Redis) are ready
- **AND** the Docker health check runs after the start period
- **THEN** `docker inspect` shows the container health as `healthy`

#### Scenario: Container reports unhealthy when API is down

- **WHEN** the API process crashes or MongoDB becomes unreachable
- **AND** the health endpoint returns HTTP 503 or is unreachable
- **THEN** after 3 consecutive failed checks, `docker inspect` shows the container health as `unhealthy`

