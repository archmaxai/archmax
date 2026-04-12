# Change: Add schema migration framework with per-document version tracking

## Why

The system has no way to evolve the MongoDB schema over time. When we add features like credential encryption, existing documents remain in the old format until manually updated. A lightweight migration framework that runs at startup ensures all documents are brought up to the current schema version automatically. Embedding the schema version in each document makes it self-describing and enables targeted migration of only outdated documents.

## What Changes

- Add a `_schemaVersion` integer field (default `0`) to every Mongoose model's schema, stored on each document
- Add a migration runner in `@archmax/core/infra/migrations` that:
  - Defines migrations as ordered, versioned scripts (each targeting a model, with a `version` and `up()` function)
  - On startup, queries for documents where `_schemaVersion < targetVersion` per model
  - Runs pending migrations sequentially per model, updating `_schemaVersion` on each document after migration
  - Skips documents already at the target version (idempotent by design)
- Integrate the migration runner into both the API server and worker startup, after `connectDB()` and before serving traffic
- Add the first migration: encrypt plaintext `connectionConfig.password` and `connectionConfig.uri` fields on Connection documents where `_schemaVersion < 1`
- Fix the API server startup to await `connectDB()` + migrations + `seedAdmin()` before `serve()` (currently the DB init is fire-and-forget)

## Impact

- Affected specs: new `schema-migrations` spec, modified `deployment`
- Affected code:
  - All models in `packages/core/src/models/` (add `_schemaVersion` field)
  - `packages/core/src/infra/migrations/` (new directory: runner + migration scripts)
  - `apps/api/src/index.ts` (await migrations before serve)
  - `apps/worker/src/index.ts` (run migrations after connectDB)
