## 1. Core: Add CSV connection type

- [x] 1.1 Add `"csv"` to `CONNECTION_TYPES` array in `packages/core/src/models/Connection.ts`
- [x] 1.2 Add CSV-specific fields to `IConnectionConfig` interface (`filename`, `delimiter`, `header`, `quote`, `escape`, `skip`)

## 2. Core: DuckDB CSV attach logic

- [x] 2.1 Add `csvTableName(filename)` helper to derive a sanitized SQL table name from a CSV filename stem
- [x] 2.2 Add `buildReadCsvOptions(config)` helper to convert `connectionConfig` fields to `read_csv` parameters
- [x] 2.3 Add `attachCsvConnection(entry, conn, projectId)` in `duckdb.ts` that creates a schema and materializes the CSV into a DuckDB table
- [x] 2.4 Update `getProjectInstance` to call `attachCsvConnection` for CSV connections (passing project ID for file path resolution)
- [x] 2.5 Add `testCsvConnection(conn, projectId)` that creates a fresh DuckDB instance, loads the CSV, and runs `SELECT COUNT(*)` to verify
- [x] 2.6 Add `csvFilePath(projectId, filename)` helper for secure file path resolution (no traversal)

## 3. API: CSV connection routes

- [x] 3.1 Add CSV-specific `connectionConfigSchema` variant in `connections.ts` (discriminated by type, with `filename` required)
- [x] 3.2 Add file existence validation on POST create for CSV connections (stat check on resolved path)
- [x] 3.3 Update POST `/:id/test` to handle CSV type using `testCsvConnection`
- [x] 3.4 Add file existence validation on PUT update when `filename` changes

## 4. Frontend: CSV connection UI

- [x] 4.1 Add `csv` option to connection type selector in connection create/edit dialog
- [x] 4.2 Show CSV-specific form fields when `csv` is selected: file picker dropdown (populated from project's uploaded documents), optional delimiter/header/skip fields
- [x] 4.3 Hide database-specific fields (host, port, user, password, etc.) when `csv` is selected

## 5. Unit and integration tests

- [x] 5.1 Unit tests for `csvTableName()` — various filename patterns (spaces, dots, unicode, leading digits)
- [x] 5.2 Unit tests for `buildReadCsvOptions()` — default vs. custom options
- [x] 5.3 Unit tests for `csvFilePath()` — valid filenames, path traversal rejection
- [x] 5.4 Integration test: POST create CSV connection with valid file → 201
- [x] 5.5 Integration test: POST create CSV connection with nonexistent file → 400
- [x] 5.6 Integration test: POST create CSV connection with path traversal → 400
- [x] 5.7 Integration test: POST test CSV connection → `{ ok: true }`
- [x] 5.8 DuckDB attach test: CSV data materialized and queryable

## 6. E2E tests

- [x] 6.1 Create CSV fixture file in `apps/e2e/fixtures/` (small dataset, ~10 rows)
- [x] 6.2 E2E test: upload CSV fixture via document upload API
- [x] 6.3 E2E test: create CSV connection referencing uploaded file
- [x] 6.4 E2E test: test CSV connection (verify `{ ok: true }`)
- [x] 6.5 E2E test: query CSV data through data browser API (`SELECT COUNT(*)` against the CSV table)
- [x] 6.6 Mount CSV fixture in `docker-compose.ci.yml` so it's available in the E2E container

## 7. Build verification

- [x] 7.1 Run `pnpm typecheck` — passes
- [x] 7.2 Run `pnpm lint` — passes
- [x] 7.3 Run `pnpm test` — all tests pass including new ones
