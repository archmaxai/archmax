# deployment Specification

## Purpose
TBD - created by archiving change add-single-image-deployment. Update Purpose after archive.
## Requirements
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

### Requirement: Unified Data Directory

`ARCHMAX_DATA_DIR` SHALL be the root directory for all persistent application data (default `/data` in Docker). All persistent application data MUST reside under `ARCHMAX_DATA_DIR`. The directory layout SHALL be:

- `/data/projects/` — semantic model YAML files (`ARCHMAX_DATA_DIR/projects`)
- `/data/mongodb/` — embedded MongoDB data files (only when using embedded MongoDB; under `ARCHMAX_DATA_DIR/mongodb`)
- `/data/.duckdb/` — DuckDB extension cache (created automatically; under `ARCHMAX_DATA_DIR/.duckdb/` via `HOME=$ARCHMAX_DATA_DIR`)

Redis data SHALL be stored in `/tmp/redis` and is explicitly ephemeral (not backed up). When using an external MongoDB via `MONGODB_URI`, the `/data/mongodb/` directory is unused.

A single bind mount (`-v ~/.archmax:/data`) captures all persistent state: project files, embedded MongoDB data, and the DuckDB extension cache.

#### Scenario: Single volume mount captures all persistent data

- **WHEN** a user mounts a single host volume to `/data`
- **THEN** semantic model files, embedded MongoDB data, and DuckDB extension cache are persisted across container restarts

#### Scenario: Data directory is created on first run

- **WHEN** the container starts for the first time with a fresh volume
- **THEN** the entrypoint creates `$ARCHMAX_DATA_DIR/projects/` and `$ARCHMAX_DATA_DIR/mongodb/` if they do not exist

### Requirement: Docker Compose Production Configuration

The `docker-compose.yml` SHALL mount the named volume `archmax-data` to `/data` inside the archmax service container.

#### Scenario: Compose stack starts successfully

- **WHEN** a user runs `docker compose up -d` with required environment variables set
- **THEN** the `archmax-data` volume is mounted at `/data` inside the archmax container

### Requirement: Deployment Documentation

Data backup instructions MUST explain how to back up the `/data` volume (covering project files, embedded MongoDB data, and DuckDB extensions) and external MongoDB data separately when using Compose.

The Docker reference page volumes section MUST list `/data` as the persistent mount point with `projects/`, `mongodb/`, and `.duckdb/` underneath, and `/tmp/redis` as ephemeral.

The configuration reference MUST document the `/data/` layout (`projects/`, `mongodb/`, `.duckdb/`) and the single-volume backup strategy.

#### Scenario: User needs to back up data

- **WHEN** a user reads the self-hosting guide
- **THEN** they find instructions for backing up the `/data` volume (semantic models, embedded MongoDB, and DuckDB extensions)
- **AND** separate guidance for backing up external MongoDB data via the Compose volume or managed service

#### Scenario: User looks up Docker volume configuration

- **WHEN** a user reads the Docker reference page
- **THEN** they find a volumes section listing `/data` as the persistent mount point
- **AND** the section explains that `projects/`, `mongodb/`, and `.duckdb/` live under `/data` and that `/tmp/redis` is ephemeral

### Requirement: Docker Reference Page

The documentation site SHALL include a dedicated Docker reference page (`reference/docker`) that serves as the canonical, in-depth resource for running archmax via Docker. The page MUST cover:

- **Image contents**: what is bundled (API server, BullMQ worker, frontend SPA, nginx reverse proxy, embedded MongoDB, embedded Redis)
- **Exposed ports**: `8080` (nginx -> API + SPA)
- **Environment variables**: a complete table listing every variable the image accepts, its default value, whether it is required or optional, and Docker-specific behavior notes (e.g. `MONGODB_URI` — omit to use embedded MongoDB, `REDIS_URL` — omit to use embedded Redis)
- **Volumes**: `/data` (persistent — `projects/`, `mongodb/`, `.duckdb/`), `/tmp/redis` (ephemeral)
- **Entrypoint behavior**: the decision tree for starting embedded MongoDB and/or Redis vs. using external, startup ordering (mongod -> redis-server -> worker -> API -> nginx), and how `MONGODB_URI` / `REDIS_URL` gate the embedded services
- **Docker Compose reference**: explanation of the repo-root `docker-compose.yml` services, volumes, and networking
- **Health checks**: recommended Docker `HEALTHCHECK` or liveness probe commands
- **Resource recommendations**: minimum RAM and disk for small and medium deployments
- **Troubleshooting**: common issues (port conflicts, volume permissions, MongoDB/Redis connection failures, log locations)

The page MUST be linked in the documentation sidebar under "Reference".

#### Scenario: User looks up Docker volume configuration

- **WHEN** a user reads the Docker reference page
- **THEN** they find a volumes section listing `/data` as the persistent mount point
- **AND** the section explains that `projects/`, `mongodb/`, and `.duckdb/` live under `/data` and that `/tmp/redis` is ephemeral

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

### Requirement: Playwright E2E Tests in CI

The CI pipeline SHALL run Playwright end-to-end browser tests against the Docker image on every pull request. The E2E test infrastructure SHALL:

- Live in a dedicated `apps/e2e/` workspace package with `@playwright/test`
- Use a `docker-compose.ci.yml` that starts the application Docker image alongside MongoDB and Redis
- Run after the Docker image is built and pushed to GHCR
- Execute tests against `localhost:8080` (the nginx entrypoint of the Docker image)
- Upload Playwright HTML reports and failure screenshots as GitHub Actions artifacts
- Block the PR from merging if any E2E test fails

The CI workflow SHALL generate random `UI_USERNAME` and `UI_PASSWORD` values at runtime and inject them into the Docker Compose stack and the Playwright test environment via `E2E_USERNAME` and `E2E_PASSWORD` env vars. Credentials MUST NOT be hardcoded in any committed file (compose file, test file, or workflow).

`docker-compose.ci.yml` SHALL use environment variable interpolation (`${UI_USERNAME}`, `${UI_PASSWORD}`) instead of hardcoded credential values.

The E2E test suite SHALL read login credentials exclusively from `E2E_USERNAME` and `E2E_PASSWORD` environment variables and MUST NOT contain hardcoded usernames or passwords.

The test suite SHALL cover at minimum:
- Health endpoint returns healthy
- Unauthenticated redirect to login page
- Login page renders correctly (heading, username field, password field, sign-in button)
- Successful login with valid randomly-generated credentials
- Failed login with empty password
- Failed login with correct username and wrong password
- Failed login with wrong username and wrong password

#### Scenario: PR with passing E2E tests

- **WHEN** a pull request is opened or updated
- **AND** the Docker image builds successfully
- **THEN** the E2E job generates random `UI_USERNAME` and `UI_PASSWORD` values
- **AND** starts the Docker image with the generated credentials via Docker Compose
- **AND** waits for the health endpoint to return healthy
- **AND** runs Playwright tests with `E2E_USERNAME` and `E2E_PASSWORD` set to the generated values
- **AND** the GitHub check is marked as successful

#### Scenario: PR with failing E2E tests

- **WHEN** a Playwright test fails (e.g., login page does not render, navigation error)
- **THEN** the GitHub check is marked as failed
- **AND** the Playwright HTML report and failure screenshots are uploaded as artifacts
- **AND** the PR is blocked from merging

#### Scenario: Docker image fails to start

- **WHEN** the Docker image starts but the health endpoint does not return healthy within 60 seconds
- **THEN** the E2E job fails without running Playwright tests
- **AND** the container logs are captured for debugging

#### Scenario: Empty password rejected at login

- **WHEN** the e2e test submits the correct username with an empty password
- **THEN** the login form shows an error
- **AND** the user remains on the login page

#### Scenario: Wrong password rejected at login

- **WHEN** the e2e test submits the correct username with an incorrect password
- **THEN** the login form shows an error banner
- **AND** the user remains on the login page

#### Scenario: Wrong username and password rejected at login

- **WHEN** the e2e test submits an unknown username with an incorrect password
- **THEN** the login form shows an error banner
- **AND** the user remains on the login page

### Requirement: Agent API Configuration Guidance in .env.example

The `.env.example` file SHALL clearly communicate that `AGENT_API_KEY` is required for all AI agent features (Semantic Model Builder, Testing Playground, conversation title generation). The comment block for the `AGENT_*` variables MUST:

- State that `AGENT_API_KEY` is required (not optional) for agent functionality
- List supported providers (OpenRouter, OpenAI, Azure OpenAI, Ollama, or any OpenAI-compatible endpoint)
- Note that `AGENT_API_BASE_URL` defaults to OpenRouter and should be changed when using a different provider
- Note that `AGENT_MODEL` should match the provider's model naming convention

The `docker-compose.yml` SHALL include a comment on the `AGENT_API_KEY` line indicating that it is required for agent features.

#### Scenario: New user reads .env.example

- **WHEN** a new user opens `.env.example` to configure the application
- **THEN** they find a clearly marked section explaining that `AGENT_API_KEY` must be set for the AI agent to work
- **AND** they understand which providers are supported and how to obtain a key

#### Scenario: User deploys without AGENT_API_KEY

- **WHEN** a user starts the application without setting `AGENT_API_KEY`
- **THEN** the application starts successfully (the key is not required for startup)
- **AND** agent features are unavailable until the key is configured

### Requirement: Agent Configuration Status in Config Endpoint

The `/api/config` endpoint SHALL include an `agentConfigured` boolean field that indicates whether the agent API key is set. The endpoint MUST NOT expose the actual key value or any secret material. The field SHALL be `true` when `AGENT_API_KEY` is a non-empty string, and `false` otherwise.

#### Scenario: Agent is configured

- **WHEN** `AGENT_API_KEY` is set to a non-empty value
- **AND** a client requests `GET /api/config`
- **THEN** the response includes `"agentConfigured": true`

#### Scenario: Agent is not configured

- **WHEN** `AGENT_API_KEY` is not set or is empty
- **AND** a client requests `GET /api/config`
- **THEN** the response includes `"agentConfigured": false`
- **AND** no secret values are leaked in the response

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

