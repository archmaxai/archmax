## Context

The application stores data across 10 Mongoose models in MongoDB. Schema changes (like encrypting existing plaintext passwords) require migrating existing documents. Today there is no mechanism for this; changes only take effect for newly created documents.

## Goals / Non-Goals

- Goals:
  - Lightweight, code-first migration system that runs at startup
  - Per-document version tracking via `_schemaVersion` field on every model
  - Migrations query for outdated documents (`_schemaVersion < target`) and upgrade them
  - First migration: encrypt existing Connection credentials
  - Idempotent: safe to run on an already-migrated database

- Non-Goals:
  - Down migrations / rollback (manual intervention for now)
  - CLI tool for creating migration scaffolds
  - Distributed locking (single-user system; API starts before worker in Docker)

## Decisions

- **Per-document `_schemaVersion`**: Every Mongoose schema gets a `_schemaVersion: { type: Number, default: 0 }` field. New documents are created with the current target version. The migration runner queries for documents below the target and upgrades them. This is more granular than a global version tracker: you can inspect any document to see its version, partially-migrated collections are safe, and new documents never need migration.

- **No separate `SchemaVersion` collection**: Since version is embedded in each document, there is no singleton tracker. The runner determines "pending work" by querying `Model.find({ _schemaVersion: { $lt: targetVersion } })`. No work to do means no documents match.

- **Migration registry in code**: Migrations are TypeScript modules in `packages/core/src/infra/migrations/scripts/`, each exporting `{ model, version, description, up }`. A central `registry.ts` imports and orders them. The `up(doc)` function receives a single document and returns the update operations. The runner handles batching and `_schemaVersion` updates.

- **Startup integration**: The migration runner runs after `connectDB()` and before any traffic. The API server startup is fixed to `await` the DB init chain (currently fire-and-forget). The worker already awaits `connectDB()` so we add `runMigrations()` after it.

- **First migration (`001-encrypt-connection-credentials`)**: Queries `Connection.find({ _schemaVersion: { $lt: 1 } })`, encrypts `password`/`uri` where they appear to be plaintext, and sets `_schemaVersion: 1`. Skipped when `ENCRYPTION_KEY` is not set.

- **Default version for new documents**: Each model schema sets `default: CURRENT_VERSION` where `CURRENT_VERSION` is the latest migration version for that model (or 0 if no migrations exist). This ensures new documents are born at the latest version and never need migration.

## Risks / Trade-offs

- **Schema overhead**: Every document gets an extra integer field. Negligible for this scale.
- **Startup latency**: Migrations scan for outdated documents. For small collections this is fast; a `$lt` index query on `_schemaVersion` is efficient.
- **No rollback**: If a migration fails midway, some documents may be partially migrated. Mitigation: individual document updates are idempotent (encrypt is a no-op on already-encrypted data via tryDecrypt pattern), and `_schemaVersion` is only bumped after successful update.

## Open Questions

- None; design is minimal and fits the single-user, single-instance deployment model.
