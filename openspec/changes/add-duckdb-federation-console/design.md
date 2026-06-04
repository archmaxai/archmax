# Design: DuckDB federation console

## Context

Each project has a lazy-initialized DuckDB instance (`getProjectInstance` in `packages/core/src/services/duckdb.ts`) with active connections attached as schemas (connection `slug`). The **Data Browser** already runs read-only metadata and `SELECT` queries against this instance via `apps/api/src/routes/data-browser.ts`. There is no admin UI for arbitrary federation SQL or for installing extensions beyond what connection attach auto-loads.

The Docker image pre-seeds core extensions (`postgres`, `mysql`, `sqlite`, `mssql` from community, `iceberg`, `httpfs`, `avro`) under `/duckdb-extensions`, copied into `$HOME/.duckdb/extensions` at container start (`entrypoint.sh`). Operators still need a way to `INSTALL` additional community extensions at runtime.

## Goals / Non-Goals

**Goals:**

- Project-scoped SQL console reachable from **Data Federation → Console**.
- Execute read-oriented federation queries (`SELECT`, `WITH`, `SHOW`, `DESCRIBE`, `EXPLAIN`) against attached connection slugs.
- Install and load custom DuckDB extensions via validated `INSTALL` / `LOAD` statements (including `FROM community`).
- Display **setup commands**: pre-installed extension list, per-connection redacted `ATTACH` examples, and a sample cross-connection query using real slugs when connections exist.
- Reuse existing patterns: session auth, typed `hc<AppType>` client, `withQueryTimeout`, credential redaction in errors.

**Non-Goals:**

- Replacing MCP `execute_query` or scoped VIEW semantics.
- A full Monaco/CodeMirror IDE (start with a textarea + results table; syntax highlighting is optional follow-up).
- Persisting query history across users or projects.
- Allowing write operations against attached upstream databases (they remain `READ_ONLY` on `ATTACH`).

## Decisions

### 1. Route and API surface

- **Frontend route:** `/$projectId/connections/console` (sibling to Data Sources and Browser).
- **API prefix:** `/api/projects/:projectId/duckdb-console`
  - `GET /setup` — returns setup command strings and metadata (extensions, per-connection attach templates, example query).
  - `POST /query` — body `{ sql: string }`; runs one statement; returns `{ columns, rows, rowCount, durationMs }` with bigint-safe JSON encoding (same as data browser).
  - `POST /extensions` — body `{ sql: string }` where `sql` MUST match `INSTALL …` or `LOAD …` only (single statement, validated by regex + identifier allowlist).

**Alternatives considered:** Single `/execute` endpoint for all SQL — rejected because extension install needs stricter validation and clearer UX (separate "Install extension" action).

### 2. DuckDB instance mode

- Reuse `getProjectInstance(projectId, connections, { readOnly: true })` for **query** execution (same as data browser). Attached sources stay `READ_ONLY`; operators can still run `SELECT` / `SHOW` / `DESCRIBE` across slugs.
- For **extension** install/load, call a new core helper that ensures the extension is loaded on the project's cached instance (same code path as `installAndLoadExtension` today), parsing `INSTALL name [FROM community]` / `LOAD name` from the submitted statement. This mutates extension state on the in-memory instance only; it does not change upstream databases.

### 3. Query validation (console-specific)

Console queries are **not** subject to MCP scoped-view or structural AST rules. A lightweight server-side check SHALL:

- Reject empty SQL and multi-statement batches (semicolon-separated statements after trim).
- Allow statement types: `SELECT`, `WITH`, `SHOW`, `DESCRIBE`, `EXPLAIN` (including `EXPLAIN ANALYZE` for operators who need plans).
- Reject `INSERT`, `UPDATE`, `DELETE`, `COPY`, `ATTACH`, `DETACH`, `CREATE SECRET`, `DROP`, `INSTALL`, `LOAD`, and other DDL/DML via a denylist on the first keyword (case-insensitive).

**Rationale:** Operators need raw `shopify.public.orders` access for debugging federation; MCP's scoped layer is intentionally stricter.

### 4. Extension install validation

- Extension names: `^[a-z][a-z0-9_]*$` (DuckDB convention).
- Optional suffix: `FROM community` on `INSTALL` only.
- Reject any other tokens or chained statements.
- After successful install, update the cached instance's `loadedExtensions` set (same as connection attach path).

### 5. Setup commands panel

The `GET /setup` response drives a read-only panel (collapsible on the console page) with:

| Section | Content |
|---------|---------|
| **Pre-installed extensions** | Static list matching `Dockerfile` seed: `postgres`, `mysql`, `sqlite`, `mssql` (community), `iceberg`, `httpfs`, `avro` with copyable `INSTALL` / `LOAD` one-liners |
| **Per active connection** | Redacted `ATTACH` example built server-side from `buildAttachString` (passwords/tokens → `********`) |
| **Example federation query** | If ≥1 connection: `SELECT * FROM <slug>.<schema>.<table> LIMIT 10` using first discovered table from metadata probe, else a commented placeholder |
| **Custom extension** | Template: `INSTALL <name> FROM community;` + `LOAD <name>;` |

Commands are plain strings for copy-to-clipboard; the panel does not execute them automatically.

### 6. UI layout

- Page header: title **Console**, no primary create action.
- Two-column layout on wide screens: left = setup commands (scrollable), right = SQL editor + Run button + results table.
- Run uses `toast.success` / `toast.error` per project conventions.
- Empty state when project has no active connections: explain that Data Sources must be configured first; disable Run.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Console bypasses MCP scoped views | Acceptable: admin session is a stronger trust boundary; document that console sees raw catalogs. |
| `INSTALL` from untrusted extension names | Strict name allowlist; community-only suffix; single statement. |
| Long-running queries block API worker | Reuse `QUERY_TIMEOUT_MS` + `connection.interrupt()` like data browser. |
| API vs worker separate in-memory instances | Same limitation as today: extension installed in API process is not visible to worker until worker rebuilds instance; document in setup panel. |

## Open Questions

- None blocking proposal; syntax highlighting can be a follow-up change if the textarea feels too bare.
