## ADDED Requirements

### Requirement: Development documentation for E2E federation stack

The documentation site SHALL describe the local E2E workflow (Docker Compose services including federated databases, environment variables, Playwright install, run, and teardown) in the Contributing or Development section so contributors discover it without relying only on the repository README or `CONTRIBUTING.md`.

#### Scenario: Docs mention federated databases for E2E

- **WHEN** a contributor opens the contributing / development documentation in `apps/docs`
- **THEN** they find instructions that reference PostgreSQL, MySQL, MSSQL, and SQLite alongside the app, MongoDB, and Redis for E2E
- **AND** the steps align with `docker-compose.ci.yml` used in CI
