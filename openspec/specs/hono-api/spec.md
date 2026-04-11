# hono-api Specification

## Purpose
The API layer built on Hono, providing typed REST routes, middleware (CORS, cache control, logging), error handling, and type-safe client export. Auth-specific behavior is covered in the `auth` spec.
## Requirements
### Requirement: Health Endpoint

The API SHALL expose a `GET /api/health` endpoint that probes system dependencies and returns a structured JSON response. This endpoint SHALL NOT require authentication.

The response body SHALL contain:
- `status` — one of `"healthy"` or `"unhealthy"`
- `checks` — an object with per-component results for `mongodb`, `redis`, `env`, and `dataDir`
- `timestamp` — ISO 8601 timestamp of the check

The endpoint SHALL return HTTP 200 when `status` is `"healthy"` and HTTP 503 when `status` is `"unhealthy"`. Any single check failure SHALL result in `"unhealthy"`.

**Checks** (all critical — any failure → `unhealthy`):
- MongoDB connectivity (`ping` command)
- Redis connectivity (`PING` command)
- Required environment variables (`BETTER_AUTH_SECRET`, `UI_PASSWORD`)
- Data directory writability (`ARCHMAX_DATA_DIR`)

Each individual probe SHALL time out within 2 seconds. All probes SHALL run concurrently.

#### Scenario: All systems healthy

- **WHEN** a GET request is made to `/api/health` without a session cookie
- **AND** MongoDB is reachable, Redis is reachable, env vars are valid, and data dir is writable
- **THEN** the response status is 200
- **AND** the body contains `{ "status": "healthy", "checks": { ... }, "timestamp": "..." }`

#### Scenario: MongoDB is unreachable

- **WHEN** a GET request is made to `/api/health`
- **AND** the MongoDB ping fails or times out
- **THEN** the response status is 503
- **AND** `status` is `"unhealthy"`
- **AND** `checks.mongodb.status` is `"down"`

#### Scenario: Redis is unreachable

- **WHEN** a GET request is made to `/api/health`
- **AND** the Redis PING fails or times out
- **THEN** the response status is 503
- **AND** `status` is `"unhealthy"`
- **AND** `checks.redis.status` is `"down"`

#### Scenario: Data directory is not writable

- **WHEN** a GET request is made to `/api/health`
- **AND** the data directory cannot be written to
- **THEN** the response status is 503
- **AND** `status` is `"unhealthy"`
- **AND** `checks.dataDir.status` is `"error"`

#### Scenario: Required env var is missing

- **WHEN** a GET request is made to `/api/health`
- **AND** a required environment variable is not set
- **THEN** the response status is 503
- **AND** `status` is `"unhealthy"`
- **AND** `checks.env.status` is `"missing"`

### Requirement: CORS Configuration

The API SHALL apply CORS middleware to all `/api/*` routes, allowing origins defined in the `CORS_ORIGINS` environment variable.

#### Scenario: CORS allows configured origin

- **WHEN** a request arrives from an origin listed in `CORS_ORIGINS`
- **THEN** appropriate CORS headers are returned

### Requirement: Cache Control

The API SHALL set `Cache-Control: no-store` on all `/api/*` responses that do not already have a Cache-Control header.

#### Scenario: Default no-store header

- **WHEN** an API response does not set Cache-Control
- **THEN** the middleware sets `Cache-Control: no-store`

### Requirement: Error Handling

The API SHALL catch `AppError` instances and return structured JSON with the error message, status code, and optional error code. Unhandled errors SHALL return a 500 response with `{ "error": "Internal server error" }`.

#### Scenario: AppError returns structured response

- **WHEN** a route throws an `AppError` with status 404
- **THEN** the response status is 404
- **AND** the body contains `{ "error": "..." }`

#### Scenario: Unhandled error returns 500

- **WHEN** a route throws an unexpected error
- **THEN** the response status is 500
- **AND** the body is `{ "error": "Internal server error" }`

### Requirement: Type-Safe Client

The API SHALL export an `AppType` type from `app.ts` so the frontend can create a fully typed Hono RPC client via `hc<AppType>`.

#### Scenario: Frontend imports AppType

- **WHEN** the frontend imports `AppType` from `@archmax/api`
- **THEN** `hc<AppType>` provides full type inference for all API routes

### Requirement: JSON Content-Type Enforcement

All state-changing `/api/*` routes (POST, PUT, PATCH, DELETE) SHALL reject requests that do not include a `Content-Type: application/json` header (or a multipart content type for file upload endpoints). This prevents cross-site form submissions that bypass CORS preflight. Requests with missing or invalid content types on mutation endpoints SHALL receive a 415 Unsupported Media Type response.

#### Scenario: JSON content type accepted

- **WHEN** a POST request to `/api/projects` includes `Content-Type: application/json`
- **THEN** the request is processed normally

#### Scenario: Form-encoded content type rejected

- **WHEN** a POST request to `/api/projects` includes `Content-Type: application/x-www-form-urlencoded`
- **THEN** a 415 response is returned

#### Scenario: File upload with multipart accepted

- **WHEN** a POST request to a file upload endpoint includes `Content-Type: multipart/form-data`
- **THEN** the request is processed normally

### Requirement: Security Response Headers

All responses served through the nginx reverse proxy SHALL include the following security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=(), microphone=(), geolocation=()`. These headers SHALL be set in the nginx configuration and apply to all response paths (API, SPA, static assets).

#### Scenario: Security headers present on API response

- **WHEN** an API response is returned through nginx
- **THEN** the response includes `X-Content-Type-Options: nosniff`
- **AND** the response includes `X-Frame-Options: DENY`
- **AND** the response includes `Referrer-Policy: strict-origin-when-cross-origin`

#### Scenario: Security headers present on SPA response

- **WHEN** the frontend SPA `index.html` is served
- **THEN** all four security headers are present in the response

### Requirement: Graceful Startup on Invalid Environment

The API server and worker processes SHALL validate environment variables at startup using the Zod env schema. When validation fails, the process SHALL:

1. Print a clean, human-readable error banner to stderr listing each missing or invalid variable, what it expects, and how to fix it
2. Enter an infinite sleep loop (`setInterval`) to keep the process alive
3. NOT print raw Zod error JSON, stack traces, or unhandled rejection warnings

The error output SHALL use ANSI color formatting (red, bold, dim) for terminal readability while remaining legible in plain-text log viewers (e.g. `docker logs`).

The sleep behavior ensures Docker containers do not crash-loop, giving operators time to inspect logs and correct the configuration.

#### Scenario: API server started without BETTER_AUTH_SECRET

- **WHEN** the API server starts without `BETTER_AUTH_SECRET` set
- **THEN** stderr shows a boxed error message stating that `BETTER_AUTH_SECRET` is required, must be at least 32 characters, and can be generated with `openssl rand -base64 32`
- **AND** the process remains alive (does not exit)
- **AND** no Zod JSON or stack trace appears in the output

#### Scenario: API server started without UI_PASSWORD

- **WHEN** the API server starts without `UI_PASSWORD` set
- **THEN** stderr shows a boxed error message stating that `UI_PASSWORD` is required and must be at least 8 characters
- **AND** the process remains alive

#### Scenario: Multiple variables missing

- **WHEN** the API server starts without both `BETTER_AUTH_SECRET` and `UI_PASSWORD`
- **THEN** the error banner lists both missing variables in a single output
- **AND** the process remains alive

#### Scenario: Worker started with invalid environment

- **WHEN** the BullMQ worker starts with invalid environment configuration
- **THEN** the same clean error banner is displayed
- **AND** the worker process remains alive instead of exiting with code 1

#### Scenario: All variables valid

- **WHEN** all required environment variables pass Zod validation
- **THEN** the server starts normally and prints the startup banner

