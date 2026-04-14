## ADDED Requirements

### Requirement: Build-Time Version Injection

The Dockerfile SHALL accept an `APP_VERSION` build argument (defaulting to `dev`) and set it as the `APP_VERSION` environment variable in the production stage.

The release workflow SHALL pass the resolved semver version (without `v` prefix) as the `APP_VERSION` build arg when building and pushing the Docker image.

The PR Docker build workflow SHALL pass `pr-<number>` as the `APP_VERSION` build arg.

#### Scenario: Release build embeds semver version

- **WHEN** the release workflow builds the Docker image after creating tag `v0.4.0`
- **THEN** the image is built with `APP_VERSION=0.4.0`
- **AND** the API process has `APP_VERSION=0.4.0` in its environment

#### Scenario: PR build embeds PR identifier

- **WHEN** the PR workflow builds the Docker image for PR #42
- **THEN** the image is built with `APP_VERSION=pr-42`

#### Scenario: Local development without build arg

- **WHEN** a developer builds the Docker image locally without passing `APP_VERSION`
- **THEN** the version defaults to `dev`

### Requirement: Authenticated Version Endpoint

The API SHALL expose an authenticated `GET /api/version` endpoint that returns the application version. The endpoint SHALL sit behind the session auth middleware so that only authenticated users can access it.

The response SHALL be a JSON object with a `version` field containing the value of the `APP_VERSION` environment variable. When `APP_VERSION` is not set, the field SHALL default to `"dev"`.

The version MUST NOT be exposed on unauthenticated endpoints (`/api/health`, `/api/config`).

#### Scenario: Authenticated user requests version

- **WHEN** an authenticated user requests `GET /api/version` on a container built with `APP_VERSION=0.4.0`
- **THEN** the response JSON is `{ "version": "0.4.0" }`

#### Scenario: Unauthenticated request is rejected

- **WHEN** an unauthenticated client requests `GET /api/version`
- **THEN** the response is `401 Unauthorized`

#### Scenario: Version endpoint returns dev fallback

- **WHEN** an authenticated user requests `GET /api/version` on a local dev server without `APP_VERSION` set
- **THEN** the response JSON is `{ "version": "dev" }`
