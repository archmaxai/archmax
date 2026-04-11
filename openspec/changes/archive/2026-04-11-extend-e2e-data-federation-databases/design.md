## Context

Data federation attaches external databases to a per-project DuckDB instance (`packages/core/src/services/duckdb.ts`). E2E runs the full app in Docker (`docker-compose.ci.yml`) with Playwright hitting nginx on port 8080. The user wants Postgres, MySQL, SQLite, and MSSQL covered in E2E, with the same compose stack runnable locally before CI.

## Goals / Non-Goals

- Goals: One compose file for CI and local E2E; seeded data in each engine; tests that prove attach + connectivity from the UI; clarify SQLite/DuckDB “file path only” in Connection Details.
- Non-Goals: Performance testing, full cross-engine SQL federation queries in the browser, or replacing Vitest integration tests for the connections API.

## Decisions

- **SQL Server image**: Use `mcr.microsoft.com/mssql/server:2022-latest` (or another supported 2022 tag) with `ACCEPT_EULA=Y` and `MSSQL_SA_PASSWORD` meeting Microsoft’s complexity rules, as documented on [Docker Hub / Microsoft SQL Server image overview](https://hub.docker.com/r/microsoft/mssql-server). The DuckDB MSSQL extension uses `Encrypt=yes` by default for structured params; for Docker-internal SQL Server without proper TLS, tests SHOULD use `encrypt: false` in connection config (or URI) so attach matches typical local-dev practice.
- **Service discovery**: Connections from the app container use compose service names as `host` (e.g. `postgres`, `mysql`, `mssql`) and default ports inside the network.
- **SQLite path**: The app process must see the same path configured on the `Connection` document. Prefer a bind-mounted directory (e.g. `./apps/e2e/fixtures/sqlite:/e2e-fixtures:ro`) and a committed minimal `.db` file, with the connection `database` field set to `/e2e-fixtures/<name>.db` inside the container.
- **Readiness**: Postgres/MySQL can use `healthcheck` with a trivial query; MSSQL may need a longer `start_period` and/or retry loop in the workflow before Playwright, consistent with Microsoft’s container startup time.
- **Project bootstrap**: Fresh databases have no default project; E2E MUST create a project through the UI (or document a future API shortcut) before opening the connections page.

## Risks / Trade-offs

- **CI time and RAM**: MSSQL is heavy; mitigations include a single small database, health-gated startup, and documenting `--scale` or profile overrides if developers run on low-memory machines.
- **Flaky MSSQL startup**: Mitigate with compose healthchecks and workflow retry before `pnpm test`.
- **ARM runners**: If multi-arch image pulls differ, pin platform where needed for the MSSQL service (often `linux/amd64` only); call out in docs if Apple Silicon local users must use `--platform linux/amd64` for MSSQL.

## Open Questions

- Whether to assert **Data Browser** for all four engines or only **Test Connection** for some to keep runtime bounded (implementation can choose minimal stable coverage).
- Whether API-based seeding of connections is acceptable as a faster alternative to full UI entry (proposal prefers UI for true E2E; can be revisited).
