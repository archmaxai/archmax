# hono-api Specification

## Purpose
The API layer built on Hono, providing typed REST routes, middleware (CORS, cache control, logging), error handling, and type-safe client export. Auth-specific behavior is covered in the `auth` spec.

## Requirements

### Requirement: Health Endpoint

The API SHALL expose a `GET /api/health` endpoint that returns `{ "status": "ok" }`. This endpoint SHALL NOT require authentication.

#### Scenario: Health check succeeds without auth

- **WHEN** a GET request is made to `/api/health` without a session cookie
- **THEN** the response status is 200
- **AND** the body is `{ "status": "ok" }`

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
