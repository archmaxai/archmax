## ADDED Requirements

### Requirement: E2E Docker Compose stack documentation

The project SHALL document how to run Playwright E2E tests locally using `docker-compose.ci.yml` with the same services as CI: the application image, MongoDB, Redis, PostgreSQL, MySQL, Microsoft SQL Server, and the SQLite file mount. The documentation SHALL include: setting `APP_IMAGE` (or building a local tag), aligning `E2E_USERNAME` and `E2E_PASSWORD` with `UI_USERNAME` and `UI_PASSWORD` in compose, installing Playwright browsers (`pnpm --filter @archmax/e2e exec playwright install --with-deps chromium`), running tests, and tearing down with `docker compose ... down -v`. It SHALL note MSSQL container resource expectations and that the supported image is pulled from `mcr.microsoft.com/mssql/server`.

#### Scenario: Contributor runs federated E2E before CI

- **WHEN** a contributor follows the documented steps on a clean machine with Docker and pnpm
- **THEN** they can start the full stack and execute the E2E suite successfully
- **AND** federated-database tests behave the same as in GitHub Actions
