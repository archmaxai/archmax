# Change: Add Iceberg REST Catalog connections via DuckDB

## Why

Users need to query data stored in Apache Iceberg tables exposed through REST Catalogs (Lakekeeper, Polaris, Cloudflare R2, etc.). DuckDB's `iceberg` extension natively supports attaching REST Catalogs, making this a natural extension of our existing federation layer. Bearer token auth covers the immediate need; OAuth2 should be designed in from the start for future enablement.

## What Changes

- Add `iceberg` as a new connection type alongside postgres, mysql, mssql, sqlite, duckdb
- Extend `connectionConfig` schema with iceberg-specific fields: `endpoint`, `warehouse`, `token`, `authorizationType`
- Implement a new DuckDB attach flow for iceberg: `CREATE SECRET` + `ATTACH ... (TYPE iceberg)` with `httpfs` loaded
- Pre-install `iceberg` and `httpfs` extensions in the Docker image
- Add Lakekeeper (Iceberg REST Catalog) and MinIO (S3-compatible object storage) services to `docker-compose.ci.yml` for E2E testing
- Apply existing credential encryption/redaction to the `token` field
- Add E2E test coverage for iceberg connection creation, test, and querying

## Impact

- Affected specs: `data-connections`, `test-infrastructure`
- Affected code:
  - `packages/core/src/models/Connection.ts` — add `iceberg` to `CONNECTION_TYPES`
  - `packages/core/src/services/duckdb.ts` — iceberg attach flow (secret + attach), extension loading
  - `apps/api/src/routes/connections.ts` — Zod schema for iceberg config fields
  - `apps/frontend/src/routes/_auth/$projectId/connections/` — iceberg connection form
  - `Dockerfile` — pre-install iceberg + httpfs extensions
  - `docker-compose.ci.yml` — add lakekeeper, minio, iceberg-init services
  - `apps/e2e/` — new iceberg E2E tests
