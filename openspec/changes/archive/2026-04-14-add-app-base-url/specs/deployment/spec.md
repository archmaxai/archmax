## ADDED Requirements

### Requirement: APP_BASE_URL Environment Variable

The system SHALL accept an optional `APP_BASE_URL` environment variable that specifies the public-facing URL of the archmax instance (e.g. `https://archmax.example.com`). When `APP_BASE_URL` is set:

- `AUTH_BASE_URL` SHALL default to the value of `APP_BASE_URL` unless `AUTH_BASE_URL` is explicitly set
- `CORS_ORIGINS` SHALL default to the value of `APP_BASE_URL` unless `CORS_ORIGINS` is explicitly set

When `APP_BASE_URL` is not set, existing defaults SHALL be preserved (`AUTH_BASE_URL` defaults to `http://localhost:${PORT}`, `CORS_ORIGINS` defaults to `http://localhost:5173`).

#### Scenario: Cloud deployment with APP_BASE_URL only

- **WHEN** the application starts with `APP_BASE_URL=https://archmax.example.com` and neither `AUTH_BASE_URL` nor `CORS_ORIGINS` is set
- **THEN** Better Auth uses `https://archmax.example.com` as its base URL
- **AND** CORS allows requests from `https://archmax.example.com`
- **AND** Better Auth trusts `https://archmax.example.com` as an origin

#### Scenario: APP_BASE_URL with explicit CORS_ORIGINS override

- **WHEN** the application starts with `APP_BASE_URL=https://archmax.example.com` and `CORS_ORIGINS=https://archmax.example.com,https://other.example.com`
- **THEN** the explicit `CORS_ORIGINS` value is used (both origins allowed)
- **AND** `AUTH_BASE_URL` still derives from `APP_BASE_URL`

#### Scenario: APP_BASE_URL with explicit AUTH_BASE_URL override

- **WHEN** the application starts with `APP_BASE_URL=https://archmax.example.com` and `AUTH_BASE_URL=https://auth.internal:3000`
- **THEN** Better Auth uses `https://auth.internal:3000` as its base URL
- **AND** CORS still derives from `APP_BASE_URL`

#### Scenario: No APP_BASE_URL set (backward compatible)

- **WHEN** the application starts without `APP_BASE_URL` set
- **THEN** `AUTH_BASE_URL` defaults to `http://localhost:${PORT}`
- **AND** `CORS_ORIGINS` defaults to `http://localhost:5173`
- **AND** existing behavior is unchanged

### Requirement: Production Startup Warning for Missing APP_BASE_URL

When `NODE_ENV` is `production` and `APP_BASE_URL` is not set, the application SHALL print a warning to stderr indicating that `APP_BASE_URL` should be set to the public URL to avoid authentication and CORS errors behind a reverse proxy. The warning SHALL NOT prevent the application from starting.

#### Scenario: Production without APP_BASE_URL

- **WHEN** the application starts with `NODE_ENV=production` and no `APP_BASE_URL`
- **THEN** a warning is printed to stderr advising the operator to set `APP_BASE_URL`
- **AND** the application starts normally

#### Scenario: Production with APP_BASE_URL

- **WHEN** the application starts with `NODE_ENV=production` and `APP_BASE_URL` is set
- **THEN** no warning about `APP_BASE_URL` is printed

## MODIFIED Requirements

### Requirement: Docker Compose Production Configuration

The `docker-compose.yml` SHALL use `APP_BASE_URL` (interpolated from the host environment with a default of `http://localhost:8080`) instead of a hardcoded `CORS_ORIGINS` value. The compose file SHALL mount the named volume `archmax-data` to `/data` inside the archmax service container.

#### Scenario: Compose stack starts successfully

- **WHEN** a user runs `docker compose up -d` with required environment variables set
- **THEN** the `archmax-data` volume is mounted at `/data` inside the archmax container

#### Scenario: Compose stack behind a proxy

- **WHEN** a user sets `APP_BASE_URL=https://archmax.example.com` in the host environment and runs `docker compose up -d`
- **THEN** the archmax container receives `APP_BASE_URL=https://archmax.example.com`
- **AND** authentication and CORS work correctly for requests from `https://archmax.example.com`

### Requirement: Deployment Documentation

Data backup instructions MUST explain how to back up the `/data` volume (covering project files, embedded MongoDB data, and DuckDB extensions) and external MongoDB data separately when using Compose.

The Docker reference page volumes section MUST list `/data` as the persistent mount point with `projects/`, `mongodb/`, and `.duckdb/` underneath, and `/tmp/redis` as ephemeral.

The configuration reference MUST document `APP_BASE_URL` as the recommended way to configure the public URL for proxy/cloud deployments, and note that `CORS_ORIGINS` and `AUTH_BASE_URL` are available as advanced overrides.

The configuration reference MUST document the `/data/` layout (`projects/`, `mongodb/`, `.duckdb/`) and the single-volume backup strategy.

#### Scenario: User needs to back up data

- **WHEN** a user reads the self-hosting guide
- **THEN** they find instructions for backing up the `/data` volume (semantic models, embedded MongoDB, and DuckDB extensions)
- **AND** separate guidance for backing up external MongoDB data via the Compose volume or managed service

#### Scenario: User looks up Docker volume configuration

- **WHEN** a user reads the Docker reference page
- **THEN** they find a volumes section listing `/data` as the persistent mount point
- **AND** the section explains that `projects/`, `mongodb/`, and `.duckdb/` live under `/data` and that `/tmp/redis` is ephemeral

#### Scenario: User deploys behind a reverse proxy

- **WHEN** a user reads the configuration reference
- **THEN** they find `APP_BASE_URL` documented as the recommended env var for proxy deployments
- **AND** they understand that setting `APP_BASE_URL` automatically configures CORS and auth origins
