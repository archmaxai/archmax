## ADDED Requirements

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
