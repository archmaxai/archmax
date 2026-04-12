## 1. Add `_schemaVersion` field to all models

- [x] 1.1 Add `_schemaVersion: { type: Number, default: 0 }` to every Mongoose schema in `packages/core/src/models/` (Project, Connection, Conversation, McpToken, McpCallLog, PublishEvent, TestAgent, TestCase, TestRun, Improvement) and their TypeScript interfaces

## 2. Migration runner

- [x] 2.1 Create `packages/core/src/infra/migrations/types.ts` with the `Migration` interface (`model: string`, `version: number`, `description: string`, `up: (model) => Promise<number>`)
- [x] 2.2 Create `packages/core/src/infra/migrations/registry.ts` that collects and orders all migration scripts per model
- [x] 2.3 Create `packages/core/src/infra/migrations/runner.ts` with `runMigrations()` that for each model queries documents where `_schemaVersion < targetVersion`, runs the migration, and updates `_schemaVersion` on each document

## 3. First migration: encrypt connection credentials

- [x] 3.1 Create `packages/core/src/infra/migrations/scripts/001-encrypt-connection-credentials.ts`
- [x] 3.2 Query `Connection.find({ _schemaVersion: { $lt: 1 } })`, encrypt `connectionConfig.password` and `connectionConfig.uri` if plaintext, set `_schemaVersion: 1`
- [x] 3.3 Skip gracefully when `ENCRYPTION_KEY` is not set (log a warning, still update `_schemaVersion` to 1)
- [x] 3.4 Set Connection schema default to `_schemaVersion: 1` so new connections are born at version 1

## 4. Startup integration

- [x] 4.1 In `apps/api/src/index.ts`, changed startup to `await connectDB()` then `await runMigrations()` then `await seedAdmin()` before `serve()` (was fire-and-forget)
- [x] 4.2 In `apps/worker/src/index.ts`, added `await runMigrations()` after `connectDB()` and before creating workers

## 5. Tests

- [x] 5.1 Unit test the migration runner: runs pending migrations on outdated docs, skips up-to-date docs, handles empty registry, continues after errors
- [x] 5.2 Unit test migration 001: encrypts plaintext credentials, skips already-encrypted, handles missing ENCRYPTION_KEY, bumps _schemaVersion
- [x] 5.3 All 498 tests pass, typecheck passes across all packages
