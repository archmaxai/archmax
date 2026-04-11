# Change: Extend E2E tests with federated databases and local CI parity

## Why

End-to-end tests today exercise auth and health against the Docker image with MongoDB and Redis only. Data federation (Postgres, MySQL, MSSQL, SQLite via DuckDB attach) is core product behavior and is not covered in E2E, so regressions in connection attach or the connections UI can slip through. Contributors also need a single, documented path to run the same stack locally before pushing, matching what GitHub Actions runs.

## What Changes

- Extend `docker-compose.ci.yml` (and the E2E job) with containerized **PostgreSQL**, **MySQL**, **Microsoft SQL Server** (official Linux image from [Microsoft Container Registry](https://hub.docker.com/r/microsoft/mssql-server)), and a **SQLite** database file supplied via a bind mount or named volume so the app container can read a stable filesystem path.
- Add Playwright coverage that logs in, ensures a project exists (create via UI if needed), registers one connection per engine using connection parameters aligned with the compose network, and asserts federation-related behavior (e.g. **Test Connection** success and/or Data Browser visibility of seeded objects).
- Document local execution: same compose file, required env vars (`APP_IMAGE` / build flow, `E2E_USERNAME` / `E2E_PASSWORD` aligned with `UI_*` in compose), optional `pnpm --filter @archmax/e2e test`, and teardown.
- Adjust the **Connection Details** form for **SQLite** and **DuckDB** so users only see a **file path** (and URI tab remains available), instead of host/port/user/password fields that do not apply to file-backed engines.
- Unify all persistent application data under `/home/archmax` (the container user's home directory) instead of the previous `/app/data`. A single bind mount (`-v ~/.archmax:/home/archmax`) now captures project files, embedded MongoDB data, and the DuckDB extension cache. The `Dockerfile`, `entrypoint.sh`, `docker-compose.yml`, and all documentation are updated to reflect this layout.

## Impact

- Affected specs: `deployment`, `connection-management-ui`, `test-infrastructure`, `documentation-site`
- Affected code (implementation phase): `docker-compose.ci.yml`, `.github/workflows/pr-docker-build.yml` (or equivalent E2E job), `apps/e2e/` (tests and possibly fixtures), `apps/frontend/.../connections/index.tsx`, seed SQL or small SQLite fixture under `apps/e2e/` or `e2e/fixtures/`, contributor docs (`CONTRIBUTING.md`, `apps/docs/.../development.mdx` or similar)
