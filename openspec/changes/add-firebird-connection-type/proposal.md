# Change: Add an env-gated Firebird connection type backed by a custom unsigned DuckDB extension

## Why

Firebird databases are only reachable from DuckDB through a custom, **unsigned** extension hosted at `https://archmaxai.github.io/duckdb_firebird` (the upstream DuckDB project supports Firebird only via ODBC). There is no first-class way to add a Firebird data source: it is not in the connection-type enum, the federation pipeline has no Firebird attach path, and the install requires `SET custom_extension_repository` + plain `INSTALL firebird` rather than the `INSTALL <ext> FROM '<source>'` shape the console supports. Operators who run Firebird want to attach it like any other source (Postgres/MySQL) with parameters defined in the UI.

## What Changes

- Add a single opt-in env var `DUCKDB_ENABLE_CUSTOM_FIREBIRD` (default off). When truthy (`true`/`1`, case-insensitive) it activates the Firebird connection type **and** causes project DuckDB instances to be created with `allow_unsigned_extensions` (the custom Firebird extension is unsigned). This is the only switch that enables unsigned-extension support; the federation console never installs unsigned extensions from arbitrary custom sources.
- The Firebird extension is installed from a fixed archmax-hosted repository (`https://archmaxai.github.io/duckdb_firebird`); this repository is not configurable.
- Add `firebird` to the `Connection` type enum (model + API + frontend). A Firebird connection's `connectionConfig` supports these UI-definable parameters: `host`, `port` (default `3050`), `database` (the database path or alias **as seen on the Firebird host machine**, e.g. `C:\firebird.fdb`), `user`, `password`, and `charset` (default `UTF8`). A pass-through `uri` is also accepted.
- When Firebird is active, the project DuckDB pipeline SHALL automatically install and load the Firebird extension from the fixed archmax-hosted repository (`SET custom_extension_repository = '<repo>'; INSTALL firebird; LOAD firebird;`) with no console action, and attach Firebird connections via `TYPE firebird` so they participate in federation, the data browser, connection tests, and MCP queries.
- Add a `charset` field to `connectionConfig` (model schema + API Zod schema + frontend form); it is non-sensitive and defaults to `UTF8` for Firebird.
- Expose a server capability flag so the connection-management UI lists **Firebird** in the type dropdown (and defaults its port to `3050`, charset to `UTF8`) only when Firebird is active.
- When Firebird is **not** active, the API SHALL reject `type: "firebird"` connection create/update with 400, and the UI SHALL omit Firebird from the dropdown — preserving current behavior exactly.
- Document the new variable in `.env.example`, the Docker reference env table, and the data-federation guide, including a security note that Firebird is an unsigned extension running arbitrary native code.

## Impact

- Affected specs:
  - `deployment` — ADDED requirement (Firebird env configuration)
  - `data-connections` — MODIFIED `Connection Model` (add `firebird` to type enum + `charset` field), ADDED requirement (env-gated Firebird federation + capability flag)
  - `connection-management-ui` — ADDED requirement (Firebird connection form, conditional on the capability flag)
- Affected code:
  - `packages/core/src/config/env.ts` — `DUCKDB_ENABLE_CUSTOM_FIREBIRD`, `customFirebirdEnabled()` helper, fixed `firebirdExtensionRepository()` constant
  - `packages/core/src/models/Connection.ts` — add `firebird` to `CONNECTION_TYPES`, add `charset` to `IConnectionConfig`/`ConnectionConfigSchema`
  - `packages/core/src/services/duckdb.ts` — `extensionForType`, `buildAttachString` (firebird DSN incl. charset), firebird install branch in `installAndLoadExtension`, `createDuckDBInstance` enables unsigned when Firebird is active, `testSingleConnection`
  - `packages/core/src/services/duckdb-console.ts` — `extensionTypeLabel` firebird case
  - `apps/api/src/routes/connections.ts` — add `charset` to Zod schema; reject `firebird` when inactive
  - `apps/api/src/routes/` — small capability/config endpoint exposing `firebirdEnabled`
  - `apps/frontend/src/routes/_auth/$projectId/connections/index.tsx` — conditional dropdown entry, default port `3050`, charset field default `UTF8`
  - `.env.example`, `apps/docs` Docker reference + data-federation guide
- Security: enabling Firebird loads an unsigned native extension (arbitrary code execution surface); off by default and clearly documented.
