## 1. Core model & schema
- [x] 1.1 Add `slug` field to `IConnection` interface and `ConnectionSchema` in `packages/core/src/models/Connection.ts` (required, regex-validated, unique index with project+deleted)
- [x] 1.2 Add `slugify` helper that lowercases a name and replaces non-identifier chars with `_` (strip leading digits, collapse consecutive underscores)

## 2. API layer
- [x] 2.1 Update `createSchema` and `updateSchema` Zod validators in `apps/api/src/routes/connections.ts` to accept optional `slug` on create (auto-generate from name if absent) and optional `slug` on update
- [x] 2.2 Update POST handler to auto-generate slug when not provided
- [x] 2.3 Include `slug` in API responses (already included via `.lean()` / `.toObject()`)

## 3. DuckDB service
- [x] 3.1 Change `attachConnection` in `packages/core/src/services/duckdb.ts` to use `conn.slug` instead of `conn.name.replace(...)` as the DuckDB alias
- [x] 3.2 Change `detachConnection` similarly

## 4. Agent service
- [x] 4.1 Update `connectionAlias` / `buildSystemPrompt` in `apps/api/src/services/agent.ts` to use `conn.slug` instead of sanitized name

## 5. Frontend
- [x] 5.1 Add slug field to the create/edit connection form in `apps/frontend/src/routes/_auth/$projectId/connections.tsx` with auto-generation preview
- [x] 5.2 Display slug (monospace) in the connection list table

## 6. Migration
- [x] 6.1 Write a migration script that backfills `slug` for existing connections by deriving from `name`, handling collisions with numeric suffixes

## 7. Validation
- [x] 7.1 Verify `slug` round-trips correctly through create → read → update → DuckDB attach
- [x] 7.2 Verify auto-generation from various name patterns (spaces, special chars, leading digits)
- [x] 7.3 Verify duplicate slug within project is rejected
