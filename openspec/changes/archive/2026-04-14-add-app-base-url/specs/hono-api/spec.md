## MODIFIED Requirements

### Requirement: CORS Configuration

The API SHALL apply CORS middleware to all `/api/*` routes, allowing origins defined in the `CORS_ORIGINS` environment variable. When `CORS_ORIGINS` is not explicitly set but `APP_BASE_URL` is, the CORS allowed origins SHALL default to the `APP_BASE_URL` value.

#### Scenario: CORS allows configured origin

- **WHEN** a request arrives from an origin listed in `CORS_ORIGINS`
- **THEN** appropriate CORS headers are returned

#### Scenario: CORS derives from APP_BASE_URL

- **WHEN** `CORS_ORIGINS` is not explicitly set
- **AND** `APP_BASE_URL` is set to `https://archmax.example.com`
- **AND** a request arrives from `https://archmax.example.com`
- **THEN** appropriate CORS headers are returned

### Requirement: Graceful Startup on Invalid Environment

The API server and worker processes SHALL validate environment variables at startup using the Zod env schema. When validation fails, the process SHALL:

1. Print a clean, human-readable error banner to stderr listing each missing or invalid variable, what it expects, and how to fix it
2. Enter an infinite sleep loop (`setInterval`) to keep the process alive
3. NOT print raw Zod error JSON, stack traces, or unhandled rejection warnings

The error output SHALL use ANSI color formatting (red, bold, dim) for terminal readability while remaining legible in plain-text log viewers (e.g. `docker logs`).

The sleep behavior ensures Docker containers do not crash-loop, giving operators time to inspect logs and correct the configuration.

When `NODE_ENV` is `production` and `APP_BASE_URL` is not set, the process SHALL print a warning (not an error) to stderr advising the operator to set `APP_BASE_URL` to avoid authentication and CORS issues behind reverse proxies. This warning SHALL NOT prevent startup.

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

#### Scenario: Production without APP_BASE_URL

- **WHEN** the API server starts with `NODE_ENV=production` and no `APP_BASE_URL`
- **THEN** a warning is printed to stderr advising the operator to set `APP_BASE_URL`
- **AND** the server starts normally
