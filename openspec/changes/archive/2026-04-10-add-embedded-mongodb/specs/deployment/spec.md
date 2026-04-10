## MODIFIED Requirements

### Requirement: Single Docker Image Deployment

The system SHALL ship a single Docker image that bundles the API server, BullMQ worker, frontend SPA, and nginx reverse proxy. The image MUST be runnable with `docker run` and the following environment variables: `BETTER_AUTH_SECRET` and `UI_PASSWORD`.

When `MONGODB_URI` is not provided, the container SHALL start an embedded `mongod` process with data stored at `/app/data/mongodb` and set `MONGODB_URI=mongodb://127.0.0.1:27017/archmax` for the application processes. When `MONGODB_URI` is provided, the embedded `mongod` SHALL NOT start.

When `REDIS_URL` is not provided, the container SHALL start an embedded `redis-server` process with data stored in `/tmp/redis`.

#### Scenario: Startup with all embedded services

- **WHEN** the container starts without `MONGODB_URI` or `REDIS_URL` set
- **THEN** the entrypoint starts embedded `mongod` (binding to `127.0.0.1:27017`, data at `/app/data/mongodb`) and `redis-server` (binding to `127.0.0.1:6379`, data at `/tmp/redis`)
- **AND** sets `MONGODB_URI=mongodb://127.0.0.1:27017/archmax` and `REDIS_URL=redis://127.0.0.1:6379` for the application processes

#### Scenario: External MongoDB provided

- **WHEN** `MONGODB_URI` is set to an external MongoDB connection string
- **THEN** the entrypoint does NOT start embedded `mongod`
- **AND** the application connects to the external MongoDB instance

#### Scenario: External Redis provided

- **WHEN** `REDIS_URL` is set to an external Redis connection URL
- **THEN** the entrypoint does NOT start embedded `redis-server`
- **AND** the application uses the external Redis for BullMQ and pub/sub

#### Scenario: Mixed embedded and external services

- **WHEN** `MONGODB_URI` is set but `REDIS_URL` is not (or vice versa)
- **THEN** only the missing service is started in embedded mode
- **AND** the provided external service is used as-is

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
