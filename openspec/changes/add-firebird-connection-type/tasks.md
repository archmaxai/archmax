## 1. Configuration

- [ ] 1.1 Add `DUCKDB_ENABLE_FIREBIRD` (optional string) and `DUCKDB_FIREBIRD_EXTENSION_REPOSITORY` (optional string, default `https://archmaxai.github.io/duckdb_firebird`) to the env schema in `packages/core/src/config/env.ts`
- [ ] 1.2 Add a `firebirdEnabled()` helper that returns `true` only when both `allowUnsignedExtensions()` and a truthy `DUCKDB_ENABLE_FIREBIRD` (`true`/`1`, case-insensitive) hold; log a one-time startup warning when `DUCKDB_ENABLE_FIREBIRD` is set but unsigned extensions are off
- [ ] 1.3 Add a `firebirdExtensionRepository()` helper returning the configured repo or its default

## 2. Connection model & API

- [ ] 2.1 Add `"firebird"` to `CONNECTION_TYPES` in `packages/core/src/models/Connection.ts`
- [ ] 2.2 In `apps/api/src/routes/connections.ts`, reject create/update with `type: "firebird"` (400) when `firebirdEnabled()` is false
- [ ] 2.3 Add an authenticated capability endpoint that returns `{ firebirdEnabled: boolean }`

## 3. DuckDB federation

- [ ] 3.1 `extensionForType("firebird")` returns `"firebird"` in `packages/core/src/services/duckdb.ts`
- [ ] 3.2 Add a firebird branch to `installAndLoadExtension` that runs `SET custom_extension_repository = '<repo>'` (single-quote-escaped) then `INSTALL firebird; LOAD firebird;`
- [ ] 3.3 Add a `firebird` case to `buildAttachString` (structured `host`/`port`/`database`/`user`/`password` DSN, default port `3050`, `uri` pass-through) — confirm the exact DSN against the published extension
- [ ] 3.4 Ensure `attachConnection` and `testSingleConnection` route firebird through the install + `ATTACH … (TYPE FIREBIRD, READ_ONLY)` path
- [ ] 3.5 Add a `firebird` case to `extensionTypeLabel` in `packages/core/src/services/duckdb-console.ts`

## 4. Frontend

- [ ] 4.1 Fetch the `firebirdEnabled` capability flag and conditionally include `"firebird"` in the connection-type dropdown in `apps/frontend/src/routes/_auth/$projectId/connections/index.tsx`
- [ ] 4.2 Add a default port `3050` for firebird (and a URI placeholder); reuse the standard host/port/database/user/password fields

## 5. Documentation

- [ ] 5.1 Document `DUCKDB_ENABLE_FIREBIRD` and `DUCKDB_FIREBIRD_EXTENSION_REPOSITORY` in `.env.example` with a security note
- [ ] 5.2 Add both variables to the Docker reference env-variable table and mention Firebird in the data-federation guide in `apps/docs`

## 6. Tests & verification

- [ ] 6.1 Unit tests for `firebirdEnabled()`: true only when both gates set; false otherwise (and warning path)
- [ ] 6.2 Unit tests for `buildAttachString` firebird case (default port, structured DSN, uri pass-through) and `extensionForType`/`extensionTypeLabel` firebird mapping
- [ ] 6.3 API test: `type: "firebird"` rejected with 400 when inactive, accepted when active; capability endpoint returns the correct flag
- [ ] 6.4 Run `pnpm typecheck` and `pnpm lint`; both exit 0
