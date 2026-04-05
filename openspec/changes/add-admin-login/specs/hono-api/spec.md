## ADDED Requirements

### Requirement: Auth Login Endpoint

The API SHALL expose a `POST /api/auth/login` endpoint that accepts `{ username, password }` JSON and validates them against the `UI_USERNAME` and `UI_PASSWORD` environment variables. On success, it SHALL set an httpOnly session cookie and return `{ ok: true }`. On failure, it SHALL return 401.

#### Scenario: Successful login

- **WHEN** a POST request to `/api/auth/login` contains the correct username and password
- **THEN** the response status is 200
- **AND** an httpOnly cookie named `session` is set
- **AND** the body is `{ "ok": true }`

#### Scenario: Invalid credentials

- **WHEN** a POST request to `/api/auth/login` contains incorrect credentials
- **THEN** the response status is 401
- **AND** no session cookie is set

### Requirement: Auth Logout Endpoint

The API SHALL expose a `POST /api/auth/logout` endpoint that clears the session cookie and invalidates the server-side session token.

#### Scenario: Successful logout

- **WHEN** an authenticated user sends a POST request to `/api/auth/logout`
- **THEN** the session cookie is cleared
- **AND** the session token is removed from the server-side store

### Requirement: Auth Me Endpoint

The API SHALL expose a `GET /api/auth/me` endpoint that returns `{ authenticated: true }` if the request has a valid session cookie, or 401 otherwise.

#### Scenario: Authenticated check

- **WHEN** a request with a valid session cookie is sent to `/api/auth/me`
- **THEN** the response status is 200
- **AND** the body contains `{ "authenticated": true }`

#### Scenario: Unauthenticated check

- **WHEN** a request without a valid session cookie is sent to `/api/auth/me`
- **THEN** the response status is 401

## MODIFIED Requirements

### Requirement: Health Endpoint

The API SHALL expose a `GET /api/health` endpoint that returns `{ "status": "ok" }`. This endpoint SHALL NOT require authentication.

#### Scenario: Health check succeeds without auth

- **WHEN** a GET request is made to `/api/health` without a session cookie
- **THEN** the response status is 200
- **AND** the body is `{ "status": "ok" }`

### Requirement: Type-Safe Client

The API SHALL export an `AppType` type from `app.ts` so the frontend can create a fully typed Hono RPC client. The auth endpoints SHALL be included in the type.

#### Scenario: Frontend imports AppType

- **WHEN** the frontend imports `AppType` from `@semlayer/api`
- **THEN** `hc<AppType>` provides full type inference for all API routes including auth endpoints
