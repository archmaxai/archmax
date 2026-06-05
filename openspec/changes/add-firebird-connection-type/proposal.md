# Change: Add an env-gated Firebird connection type backed by an unsigned DuckDB extension

## Why

Firebird databases are only reachable from DuckDB through a custom, **unsigned** extension hosted at `https://archmaxai.github.io/duckdb_firebird` (the upstream DuckDB project supports Firebird only via ODBC). The recently-added `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` gate already lets opted-in self-hosters load unsigned extensions, but there is no first-class way to add a Firebird data source: it is not in the connection-type enum, the federation pipeline has no Firebird attach path, and the install requires `SET custom_extension_repository` + plain `INSTALL firebird` rather than the `INSTALL <ext> FROM '<source>'` shape the console already supports. Operators who run Firebird want to attach it like any other source (Postgres/MySQL) with parameters defined in the UI.

## What Changes

- Add an opt-in env var `DUCKDB_ENABLE_FIREBIRD` (default off). It only takes effect when `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` is also truthy (Firebird is an unsigned extension); if `DUCKDB_ENABLE_FIREBIRD` is set while unsigned extensions are disabled, Firebird stays inactive and a startup warning is logged.
- Add an optional `DUCKDB_FIREBIRD_EXTENSION_REPOSITORY` env var (default `https://archmaxai.github.io/duckdb_firebird`) so operators can point at a mirror.
- Add `firebird` to the `Connection` type enum (model + API + frontend), with the same structured `host`/`port`/`database`/`user`/`password` (and optional `schema`, `uri`) parameters as Postgres/MySQL and a default port of `3050`.
- When Firebird is active, the project DuckDB pipeline SHALL automatically install and load the Firebird extension from the custom repository (`SET custom_extension_repository = '<repo>'; INSTALL firebird; LOAD firebird;`) with no console action, and attach Firebird connections via `TYPE firebird` so they participate in federation, the data browser, connection tests, and MCP queries.
- Expose a server capability flag so the connection-management UI lists **Firebird** in the type dropdown (and defaults its port to `3050`) only when Firebird is active.
- When Firebird is **not** active, the API SHALL reject `type: "firebird"` connection create/update with 400, and the UI SHALL omit Firebird from the dropdown — preserving current behavior exactly.
- Document the new variables in `.env.example`, the Docker reference env table, and the data-federation guide, including a security note that Firebird is an unsigned extension running arbitrary native code.

## Impact

- Affected specs:
  - `deployment` — ADDED requirement (Firebird env configuration)
  - `data-connections` — MODIFIED `Connection Model` (add `firebird` to type enum), ADDED requirement (env-gated Firebird federation + capability flag)
  - `connection-management-ui` — ADDED requirement (Firebird connection form, conditional on the capability flag)
- Affected code:
  - `packages/core/src/config/env.ts` — `DUCKDB_ENABLE_FIREBIRD`, `DUCKDB_FIREBIRD_EXTENSION_REPOSITORY`, `firebirdEnabled()` helper
  - `packages/core/src/models/Connection.ts` — add `firebird` to `CONNECTION_TYPES`
  - `packages/core/src/services/duckdb.ts` — `extensionForType`, `buildAttachString`, firebird install branch in `installAndLoadExtension`, `createDuckDBInstance` unsigned-when-firebird, `testSingleConnection`
  - `packages/core/src/services/duckdb-console.ts` — `extensionTypeLabel` firebird case
  - `apps/api/src/routes/connections.ts` — reject `firebird` when inactive
  - `apps/api/src/routes/` — small capability/config endpoint exposing `firebirdEnabled`
  - `apps/frontend/src/routes/_auth/$projectId/connections/index.tsx` — conditional dropdown entry, default port `3050`
  - `.env.example`, `apps/docs` Docker reference + data-federation guide
- Security: enabling Firebird loads an unsigned native extension (arbitrary code execution surface); off by default, requires the unsigned-extensions gate, and clearly documented. Builds on the pending `add-unsigned-duckdb-extensions` change.
