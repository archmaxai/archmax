## 1. Compose and fixtures

- [x] 1.1 Add Postgres, MySQL, and MSSQL services to `docker-compose.ci.yml` on a shared Docker network with the `app` service; use official images (`postgres`, `mysql`, `mcr.microsoft.com/mssql/server` with `ACCEPT_EULA` and a strong `MSSQL_SA_PASSWORD` per Microsoft's container docs).
- [x] 1.2 Provide minimal seed data (schemas/tables/rows) via init scripts or image entrypoints so E2E can assert predictable object names.
- [x] 1.3 Add a SQLite database file fixture committed to the repo (or generated in a one-shot init container) and mount it into the `app` container at a fixed path documented for tests.
- [x] 1.4 Wire `depends_on` / healthchecks so the E2E job waits for databases that need warm-up (especially MSSQL) before starting Playwright.

## 2. Connection UI (SQLite / DuckDB)

- [x] 2.1 In Connection Details mode, for types `sqlite` and `duckdb`, show a single path field (clear label: database file path) and omit host, port, user, and password fields; keep the Connection URI tab unchanged.
- [x] 2.2 Ensure the submitted `connectionConfig` still maps to the backend attach string (`database` path for SQLite; DuckDB native path as already implemented).

## 3. Playwright

- [x] 3.1 Add a spec (or extend `smoke.spec.ts`) that creates a project if none exists, then creates four connections (postgres, mysql, mssql, sqlite) using compose service hostnames and the mounted SQLite path.
- [x] 3.2 For each connection, run **Test Connection** from the UI (or assert equivalent API health) and verify success.
- [x] ~~3.3 Optionally open Data Browser and confirm seeded table(s) appear for at least one engine to exercise attach + discovery.~~ (cancelled — deferred to keep initial E2E runtime bounded)
- [x] 3.4 Use stable `data-testid` or role-based selectors where the UI is ambiguous; avoid sleeps except where unavoidable for MSSQL readiness.

## 4. Local parity and CI

- [x] 4.1 Ensure `pnpm --filter @archmax/e2e test` with `docker compose -f docker-compose.ci.yml up -d` (and correct `APP_IMAGE`) matches CI behavior; update `playwright.config.ts` webServer or document manual stack start if needed.
- [x] 4.2 Update the PR workflow E2E job to pull/up the expanded compose stack and pass any new env vars required by tests.

## 5. Unified data directory (`/home/archmax`)

- [x] 5.1 Update `Dockerfile` to create `archmax` user with `-m -d /home/archmax`; `mkdir -p /home/archmax/projects /home/archmax/mongodb /tmp/redis`.
- [x] 5.2 Update `entrypoint.sh` to default `ARCHMAX_DATA_DIR` to `/home/archmax/projects` and use `/home/archmax/mongodb` for embedded MongoDB.
- [x] 5.3 Update `docker-compose.yml` volume mount from `archmax-data:/app/data` to `archmax-data:/home/archmax`.
- [x] 5.4 Update `README.md` volume mount from `-v ~/.archmax:/app/data` to `-v ~/.archmax:/home/archmax`.
- [x] 5.5 Update live deployment spec (`openspec/specs/deployment/spec.md`) with `/home/archmax` layout.
- [x] 5.6 Update docs: Docker reference, configuration, self-hosting, and installation pages to reflect `/home/archmax` layout and backup instructions.

## 6. Documentation

- [x] 6.1 Update `CONTRIBUTING.md` and the docs site contributing / development page with step-by-step local E2E instructions, including database services, credential env vars, and `docker compose ... down -v` teardown.
- [x] 6.2 Note MSSQL resource expectations (memory) and that the canonical pull target is MCR (`mcr.microsoft.com/mssql/server`), not a deprecated Hub-only name.
