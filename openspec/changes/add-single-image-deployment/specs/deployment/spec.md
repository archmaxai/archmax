## ADDED Requirements

### Requirement: Single Docker Image Deployment

The system SHALL ship a single Docker image that bundles the API server, BullMQ worker, frontend SPA, and nginx reverse proxy. The image MUST be runnable with `docker run` and a minimal set of environment variables (`BETTER_AUTH_SECRET`, `UI_PASSWORD`). When `MONGODB_URI` is not provided, the container SHALL start an embedded `mongod` process with data stored at `/app/data/mongodb`. When `REDIS_URL` is not provided, the container SHALL start an embedded `redis-server` process with data stored in `/tmp/redis`.

All persistent state MUST reside under `/app/data/` so that a single volume mount (`-v host-path:/app/data`) captures both semantic model files and MongoDB data.

#### Scenario: Zero-dependency startup

- **WHEN** the container starts without `MONGODB_URI` or `REDIS_URL` set
- **THEN** the entrypoint starts embedded `mongod` (binding to `127.0.0.1:27017`, data at `/app/data/mongodb`) and `redis-server` (binding to `127.0.0.1:6379`, data at `/tmp/redis`)
- **AND** sets `MONGODB_URI=mongodb://127.0.0.1:27017/archsem` and `REDIS_URL=redis://127.0.0.1:6379` for the application processes
- **AND** waits for `mongod` to be ready before starting the API and worker

#### Scenario: External MongoDB provided

- **WHEN** `MONGODB_URI` is set to an external MongoDB connection string
- **THEN** the entrypoint does NOT start embedded `mongod`
- **AND** the application connects to the external MongoDB instance

#### Scenario: External Redis provided

- **WHEN** `REDIS_URL` is set to an external Redis connection URL
- **THEN** the entrypoint does NOT start embedded `redis-server`
- **AND** the application uses the external Redis for BullMQ and pub/sub

#### Scenario: Mixed configuration

- **WHEN** `MONGODB_URI` is set but `REDIS_URL` is not (or vice versa)
- **THEN** the entrypoint starts only the missing embedded service
- **AND** the provided external service is used as-is

### Requirement: Unified Data Directory

All persistent application data MUST reside under a single root directory (`/app/data/` in Docker). The directory layout SHALL be:

- `/app/data/projects/` — semantic model YAML files (`ARCHSEM_DATA_DIR`)
- `/app/data/mongodb/` — embedded MongoDB data files (only when using embedded MongoDB)

Redis data SHALL be stored in `/tmp/redis` and is explicitly ephemeral (not backed up).

#### Scenario: Single volume mount captures all persistent data

- **WHEN** a user mounts a single host volume to `/app/data`
- **THEN** both semantic model files and MongoDB data are persisted across container restarts

#### Scenario: Data directory is created on first run

- **WHEN** the container starts for the first time with a fresh volume
- **THEN** the entrypoint creates `/app/data/projects/` and `/app/data/mongodb/` if they do not exist

### Requirement: Docker Compose Production Configuration

The repository SHALL include a `docker-compose.yml` at the project root providing a production-oriented multi-service deployment with separate MongoDB and Redis containers. The Compose file SHALL define:

- A `archsem` service using the project Docker image with `MONGODB_URI` and `REDIS_URL` pointing to companion services
- A `mongo` service using `mongo:7` with a named volume for data persistence
- A `redis` service using `redis:7-alpine` with no persistence
- Named volumes for `archsem-data` and `mongo-data`

#### Scenario: Compose stack starts successfully

- **WHEN** a user runs `docker compose up -d` with required environment variables set
- **THEN** all three services start and the archsem application connects to the external MongoDB and Redis instances
- **AND** the embedded services inside the archsem container are NOT started (because `MONGODB_URI` and `REDIS_URL` are provided)

### Requirement: Deployment Documentation

The documentation site SHALL provide comprehensive deployment guidance across multiple pages:

**Installation page** (`getting-started/installation`):
- The primary `docker run` quick start MUST require only `BETTER_AUTH_SECRET` and `UI_PASSWORD`, with a single volume mount to `/app/data`. External MongoDB MUST NOT be listed as a prerequisite.
- A clear note MUST explain that MongoDB and Redis are embedded automatically when their environment variables are omitted.
- The Docker Compose section MUST reference the repository-root `docker-compose.yml` and show clone-and-run instructions.

**Configuration reference** (`reference/configuration`):
- `MONGODB_URI` MUST be documented as optional with a note that the Docker image provides an embedded fallback.
- A "Data Directory" section MUST document the `/app/data/` layout (`projects/`, `mongodb/`) and the single-volume backup strategy.
- `REDIS_URL` MUST include a note that the Docker image embeds Redis when unset.

**Self-hosting guide** (`guides/self-hosting`):
- A dedicated page MUST cover deployment modes (single image, Docker Compose, production recommendations).
- Data backup instructions MUST explain how to back up the `/app/data` volume.
- Guidance on when to use external MongoDB vs. embedded MUST be provided.
- The page MUST be linked in the documentation sidebar.

#### Scenario: User follows single-image quickstart

- **WHEN** a new user reads the installation documentation
- **THEN** they find a `docker run` command requiring only `BETTER_AUTH_SECRET` and `UI_PASSWORD`
- **AND** the guide explains that MongoDB and Redis are embedded automatically
- **AND** MongoDB is NOT listed as a prerequisite

#### Scenario: User follows Compose setup for production

- **WHEN** a user reads the production deployment guide
- **THEN** they find the `docker-compose.yml` referenced from the repository root
- **AND** instructions for setting environment variables via `.env` file

#### Scenario: User looks up MONGODB_URI in configuration reference

- **WHEN** a user reads the configuration reference
- **THEN** `MONGODB_URI` is listed as optional
- **AND** a note explains that the Docker image embeds MongoDB when the variable is unset

#### Scenario: User needs to back up data

- **WHEN** a user reads the self-hosting guide
- **THEN** they find instructions for backing up the single `/app/data` volume
- **AND** the guide explains what data lives in `projects/` vs `mongodb/`

### Requirement: Docker Reference Page

The documentation site SHALL include a dedicated Docker reference page (`reference/docker`) that serves as the canonical, in-depth resource for running archsem via Docker. The page MUST cover:

- **Image contents**: what is bundled (API server, BullMQ worker, frontend SPA, nginx reverse proxy, embedded MongoDB 7.x, embedded Redis)
- **Exposed ports**: `8080` (nginx → API + SPA)
- **Environment variables**: a complete table listing every variable the image accepts, its default value, whether it is required or optional, and Docker-specific behavior notes (e.g. embedded fallback when omitted)
- **Volumes**: `/app/data` (persistent — projects and embedded MongoDB data), `/tmp/redis` (ephemeral), log paths
- **Entrypoint behavior**: the decision tree for starting embedded vs. external services, startup ordering (mongod → readiness check → redis-server → worker → API → nginx), and how each env var gates each embedded service
- **Docker Compose reference**: explanation of the repo-root `docker-compose.yml` services, volumes, and networking
- **Health checks**: recommended Docker `HEALTHCHECK` or liveness probe commands
- **Resource recommendations**: minimum RAM and disk for small and medium deployments
- **Troubleshooting**: common issues (port conflicts, volume permissions, embedded mongod startup failures, log locations)

The page MUST be linked in the documentation sidebar under "Reference".

#### Scenario: User looks up Docker volume configuration

- **WHEN** a user reads the Docker reference page
- **THEN** they find a volumes section listing `/app/data` as the persistent mount point
- **AND** the section explains what subdirectories exist (`projects/`, `mongodb/`) and that `/tmp/redis` is ephemeral

#### Scenario: User looks up entrypoint behavior

- **WHEN** a user reads the Docker reference page
- **THEN** they find a section explaining the startup decision tree
- **AND** it documents that omitting `MONGODB_URI` triggers embedded `mongod` and omitting `REDIS_URL` triggers embedded `redis-server`
- **AND** the startup order is clearly listed

#### Scenario: User troubleshoots container startup failure

- **WHEN** a user's container fails to start and they consult the Docker reference
- **THEN** they find a troubleshooting section with common issues and remedies
- **AND** log file locations (`/var/log/mongod.log`) are documented
