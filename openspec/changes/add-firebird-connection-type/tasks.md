## 1. Configuration

- [ ] 1.1 Add `DUCKDB_ENABLE_CUSTOM_FIREBIRD` (optional string) and `DUCKDB_FIREBIRD_EXTENSION_REPOSITORY` (optional string, default `https://archmaxai.github.io/duckdb_firebird`) to the env schema in `packages/core/src/config/env.ts`
- [ ] 1.2 Add a `customFirebirdEnabled()` helper returning `true` for truthy `DUCKDB_ENABLE_CUSTOM_FIREBIRD` (`true`/`1`, case-insensitive)
- [ ] 1.3 Add a `firebirdExtensionRepository()` helper returning the configured repo or its default
- [ ] 1.4 In `createDuckDBInstance()`, enable `allow_unsigned_extensions` when `allowUnsignedExtensions() || customFirebirdEnabled()`

## 2. Connection model & API

- [ ] 2.1 Add `"firebird"` to `CONNECTION_TYPES` in `packages/core/src/models/Connection.ts`
- [ ] 2.2 Add `charset` (string, optional) to `IConnectionConfig` and `ConnectionConfigSchema` in `Connection.ts`, and to the `connectionConfigSchema` Zod schema in `apps/api/src/routes/connections.ts`
- [ ] 2.3 In `apps/api/src/routes/connections.ts`, reject create/update with `type: "firebird"` (400) when `customFirebirdEnabled()` is false
- [ ] 2.4 Add an authenticated capability endpoint that returns `{ firebirdEnabled: boolean }` (= `customFirebirdEnabled()`)

## 3. DuckDB federation

- [ ] 3.1 `extensionForType("firebird")` returns `"firebird"` in `packages/core/src/services/duckdb.ts`
- [ ] 3.2 Add a firebird branch to `installAndLoadExtension` that runs `SET custom_extension_repository = '<repo>'` (single-quote-escaped) then `INSTALL firebird; LOAD firebird;`
- [ ] 3.3 Add a `firebird` case to `buildAttachString` building the DSN from `host`/`port`/`database`/`user`/`password`/`charset` (default port `3050`, default charset `UTF8`, `database` treated as opaque host-side path/alias) with `uri` pass-through — confirm the exact DSN key names against the published extension
- [ ] 3.4 Ensure `attachConnection` and `testSingleConnection` route firebird through the install + `ATTACH … (TYPE FIREBIRD, READ_ONLY)` path
- [ ] 3.5 Add a `firebird` case to `extensionTypeLabel` in `packages/core/src/services/duckdb-console.ts`

## 4. Frontend

- [ ] 4.1 Fetch the `firebirdEnabled` capability flag and conditionally include `"firebird"` in the connection-type dropdown in `apps/frontend/src/routes/_auth/$projectId/connections/index.tsx`
- [ ] 4.2 For firebird, default port to `3050`, add a Charset field (default `UTF8`), label Database as the host-machine path/alias, and add a URI placeholder; reuse the standard host/user/password fields and thread `charset` through `buildConfig`

## 5. Documentation

- [ ] 5.1 Document `DUCKDB_ENABLE_CUSTOM_FIREBIRD` and `DUCKDB_FIREBIRD_EXTENSION_REPOSITORY` in `.env.example` with a security note
- [ ] 5.2 Add both variables to the Docker reference env-variable table and mention Firebird in the data-federation guide in `apps/docs`

## 6. Tests & verification

- [ ] 6.1 Unit tests for `customFirebirdEnabled()`: true only when the variable is truthy; false otherwise
- [ ] 6.2 Unit tests for `buildAttachString` firebird case (default port/charset, structured DSN, uri pass-through) and `extensionForType`/`extensionTypeLabel` firebird mapping
- [ ] 6.3 API test: `type: "firebird"` rejected with 400 when inactive, accepted when active; capability endpoint returns the correct flag; `charset` accepted by the Zod schema
- [ ] 6.4 Run `pnpm typecheck` and `pnpm lint`; both exit 0
