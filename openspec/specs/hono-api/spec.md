# hono-api Specification

## Purpose
The API layer built on Hono, serving as the backend for the Semantic Layer application. Provides typed REST routes, CORS, error handling, and cache control.

## Requirements

### Requirement: Health Endpoint

The API SHALL expose a `GET /api/health` endpoint that returns `{ "status": "ok" }`.

#### Scenario: Health check succeeds

- **WHEN** a GET request is made to `/api/health`
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

The API SHALL catch `AppError` instances and return structured JSON with the error message, status code, and optional error code.

#### Scenario: AppError returns structured response

- **WHEN** a route throws an `AppError` with status 404
- **THEN** the response status is 404
- **AND** the body contains `{ "error": "..." }`

### Requirement: Type-Safe Client

The API SHALL export an `AppType` type from `app.ts` so the frontend can create a fully typed Hono RPC client.

#### Scenario: Frontend imports AppType

- **WHEN** the frontend imports `AppType` from `@semlayer/api`
- **THEN** `hc<AppType>` provides full type inference for all API routes
