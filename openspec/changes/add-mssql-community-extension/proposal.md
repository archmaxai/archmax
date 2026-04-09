# Change: Add MSSQL Community Extension Support for DuckDB

## Why

The current MSSQL connection code uses `INSTALL mssql` (core registry) and a Postgres-style key=value attach string (`host=X port=Y dbname=Z …`), which does not match the [DuckDB MSSQL community extension](https://duckdb.org/community_extensions/extensions/mssql) API. The community extension requires `INSTALL mssql FROM community` and expects either an ADO.NET connection string, a URI, or DuckDB secrets — meaning all MSSQL ATTACH operations currently fail at runtime. Additionally, MSSQL-specific connection parameters like TLS encryption (`encrypt`) are not exposed in the UI.

## What Changes

- Update `duckdb.ts` to install the MSSQL extension from the community registry (`INSTALL mssql FROM community`)
- Rewrite `buildAttachString` for MSSQL to produce a valid ADO.NET connection string (`Server=host,port;Database=db;User Id=user;Password=pass;Encrypt=yes`)
- Add `encrypt` boolean to `IConnectionConfig` for MSSQL TLS encryption toggle (defaults to `true` per the extension's default)
- Surface the `encrypt` toggle in the frontend connection form when `type === "mssql"`
- Accept `encrypt` in the API connection config schema

## Impact

- Affected specs: `data-connections`
- Affected code:
  - `packages/core/src/services/duckdb.ts` — extension install path and attach string builder
  - `packages/core/src/models/Connection.ts` — `IConnectionConfig` type (already `strict: false` so no schema change needed)
  - `apps/api/src/routes/connections.ts` — Zod schema for connection config
  - `apps/frontend/src/routes/_auth/$projectId/connections/index.tsx` — MSSQL-specific form fields
  - `apps/docs/` — documentation update for MSSQL connections
