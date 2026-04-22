# Implementation Tasks

## 1. Backend — DuckDB cache invalidation helper

- [x] 1.1 Add `disposeProjectInstance(projectId: string): Promise<void>` to `packages/core/src/services/duckdb.ts` that closes the cached `DuckDBInstance` (best-effort) and removes it from the `projectInstances` map; export it alongside `getProjectInstance`.
- [x] 1.2 Add a unit test in `packages/core/src/services/duckdb.test.ts` covering dispose followed by `getProjectInstance` — the returned instance reference MUST differ from the pre-dispose one.

## 2. Backend — Reinit endpoint

- [x] 2.1 Add `POST /api/projects/:projectId/connections/reinit` to `apps/api/src/routes/connections.ts`.
- [x] 2.2 Endpoint implementation:
  - Look up the project; return 404 if missing.
  - Call `disposeProjectInstance(projectId)`.
  - Load all active connections for the project and call `getProjectInstance(projectId, connections, { readOnly: true })` to force a fresh attach cycle.
  - Run `SHOW ALL TABLES` with `withQueryTimeout`; count the rows.
  - Return `{ ok: true, tableCount: <number> }`.
  - On any error, return `{ ok: false, error: <message> }` with HTTP 400 (matches existing `POST /:id/test` shape).
- [x] 2.3 Add integration test in `apps/api/src/routes/connections-reinit.integration.test.ts` verifying:
  - 404 when the project does not exist.
  - Success path returns `{ ok: true, tableCount: <number> }` for a project with at least one attached connection.
  - Failure path (e.g. a connection pointing at an unreachable host) returns `{ ok: false, error }` and HTTP 400.

## 3. Frontend — Data Sources page button

- [x] 3.1 Add a "Re-explore schemas" button in the header of `apps/frontend/src/routes/_auth/$projectId/connections/index.tsx`, left of the existing "New Connection" button, using `variant="outline"` and a `RefreshCw` icon from `lucide-react`.
- [x] 3.2 Wire the button to a `useMutation` that calls `api.api.projects[":projectId"].connections.reinit.$post(...)` via the typed Hono RPC client.
- [x] 3.3 While the mutation is pending, disable the button and show an animated `Loader2` spinner in place of the icon.
- [x] 3.4 On success, show `toast.success(\`Schemas refreshed — ${tableCount} tables visible\`)` and invalidate the `["connections", project._id]` query so the list reflects any status changes surfaced during re-attach.
- [x] 3.5 On error, show `toast.error(err.message)`.
- [x] 3.6 Hide/disable the button when the connections list is empty (no attached sources means nothing to refresh).

## 4. Documentation

- [x] 4.1 Update `apps/docs/src/content/docs/guides/data-federation.mdx` with a short "Refreshing schemas" subsection that explains when to use the new button (after an upstream DDL change) and what it does.

## 5. Verification

- [x] 5.1 Run `pnpm typecheck` and `pnpm lint` and ensure both pass.
- [x] 5.2 Run `pnpm --filter @archmax/api build` to catch declaration/emit issues. (covered by `pnpm lint` → api build cache)
- [x] 5.3 Run the new integration test suite (`pnpm --filter @archmax/api test`) and the core unit tests (`pnpm --filter @archmax/core test`). 614/614 tests pass.
