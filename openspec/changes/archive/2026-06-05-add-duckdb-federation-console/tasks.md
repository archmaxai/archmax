## 1. Core and API

- [x] 1.1 Add `getDuckdbConsoleSetup(projectId)` in `@archmax/core` returning pre-installed extension commands, per-connection redacted attach strings, and an example federation query
- [x] 1.2 Add `executeDuckdbConsoleQuery(projectId, sql)` with console-specific statement validation, timeout, and error redaction
- [x] 1.3 Add `installDuckdbConsoleExtension(projectId, sql)` parsing validated `INSTALL`/`LOAD` and delegating to existing extension load logic
- [x] 1.4 Add Hono routes under `/api/projects/:projectId/duckdb-console` (`GET /setup`, `POST /query`, `POST /extensions`) with session auth and Zod validation
- [x] 1.5 Register routes in `apps/api/src/app.ts` and extend `AppType` for the typed frontend client
- [x] 1.6 Add unit tests for validation helpers and route integration tests (auth, happy path, reject invalid SQL)

## 2. Frontend

- [x] 2.1 Add `connections/console` route with SQL textarea, Run control, and paginated/simple results table
- [x] 2.2 Add setup commands panel fed by `GET /setup` with per-section copy buttons
- [x] 2.3 Add extension install UI (input or dedicated textarea) calling `POST /extensions`
- [x] 2.4 Add **Console** nav child under Data Federation in `app-sidebar.tsx`
- [x] 2.5 Empty state when no active connections; disable run until connections exist

## 3. Documentation

- [x] 3.1 Update `apps/docs/src/content/docs/guides/data-federation.mdx` with a **Federation console** section (navigation path, query vs extension install, setup commands, API/worker instance note)
- [x] 3.2 Mention console in `apps/docs/src/content/docs/index.mdx` Data Federation card if the section list is maintained there

## 4. Validation

- [x] 4.1 `pnpm typecheck` and `pnpm lint` pass
- [x] 4.2 `npx vitest run` for new core/API tests
- [ ] 4.3 Optional: extend `apps/e2e` with a smoke test that opens Console and runs `SELECT 1` when federation E2E stack is available
