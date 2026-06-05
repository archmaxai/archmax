## 1. Configuration

- [x] 1.1 Add `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` to the env schema in `packages/core/src/config/env.ts` (optional string, default unset)
- [x] 1.2 Add an `allowUnsignedExtensions()` helper that returns a boolean for truthy `true`/`1` (case-insensitive)

## 2. DuckDB instance creation

- [x] 2.1 Add a `createDuckDBInstance()` helper in `packages/core/src/services/duckdb.ts` that calls `DuckDBInstance.create()` with `{ allow_unsigned_extensions: "true" }` only when the flag is enabled
- [x] 2.2 Route `setupProjectInstance`, `testSingleConnection`, and `testIcebergConnection` through the helper

## 3. Console extension install

- [x] 3.1 Extend `parseExtensionSql` in `duckdb-console.ts` to accept `INSTALL <extension> FROM '<source>'` (single-quoted source) only when the flag is enabled; return `{ extension, fromSource }`
- [x] 3.2 Reject the custom-source shape with the existing 400 error when the flag is disabled
- [x] 3.3 Thread `fromSource` through `installDuckdbConsoleExtension` → `ensureProjectExtensionLoaded` → `installAndLoadExtension`, emitting `INSTALL <ext> FROM '<source>'` with the source single-quote-escaped

## 4. Documentation

- [x] 4.1 Document `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` in `.env.example` with a security note
- [x] 4.2 Add `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` to the Docker reference env-variable table in `apps/docs`

## 5. Tests & verification

- [x] 5.1 Unit tests for `parseExtensionSql`: custom-source accepted when enabled, rejected when disabled, invalid name rejected, community/load unchanged
- [x] 5.2 Run `pnpm typecheck` and `pnpm lint` (and `pnpm --filter @archmax/api build`); both exit 0
