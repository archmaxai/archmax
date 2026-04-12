## MODIFIED Requirements

### Requirement: E2E Docker Compose stack documentation

The project SHALL document how to run Playwright E2E tests locally using `docker-compose.ci.yml` with the same services as CI: the application image, MongoDB, Redis, PostgreSQL, MySQL, Microsoft SQL Server, and the SQLite file mount. The documentation SHALL include: setting `APP_IMAGE` (or building a local tag), aligning `E2E_USERNAME` and `E2E_PASSWORD` with `UI_USERNAME` and `UI_PASSWORD` in compose, installing Playwright browsers (`pnpm --filter @archmax/e2e exec playwright install --with-deps chromium`), running tests, and tearing down with `docker compose ... down -v`. It SHALL note MSSQL container resource expectations and that the supported image is pulled from `mcr.microsoft.com/mssql/server`. The `docker-compose.ci.yml` app service SHALL provide a writable `ARCHMAX_DATA_DIR` (`/data`) via tmpfs so the application can write semantic model files and published builds required by the MCP E2E tests.

#### Scenario: Contributor runs federated E2E before CI

- **WHEN** a contributor follows the documented steps on a clean machine with Docker and pnpm
- **THEN** they can start the full stack and execute the E2E suite successfully
- **AND** federated-database tests behave the same as in GitHub Actions

#### Scenario: MCP E2E tests use writable data volume

- **WHEN** the Docker Compose stack is started
- **THEN** the app container has a writable data directory at `/data`
- **AND** semantic models created via the API are persisted and available to the MCP endpoint after publish
