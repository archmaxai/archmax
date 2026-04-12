## Context

DuckDB natively supports reading CSV files via `read_csv()` and direct filename references. The project already has an upload pipeline (`DocumentFileService`) that stores files at `$ARCHMAX_DATA_DIR/projects/<projectId>/uploads/`. The DuckDB service currently attaches external databases (Postgres, MySQL, MSSQL, SQLite) via their respective extensions. CSV is different — it doesn't use an extension or `ATTACH`; instead, data is loaded directly from files.

A key constraint is that `hardenConnection()` sets `enable_external_access = false` on the DuckDB instance before any user-initiated query runs. This blocks `read_csv()` at query time. The solution must load CSV data before hardening.

## Goals / Non-Goals

- **Goals:**
  - Allow users to query uploaded CSV files with SQL via DuckDB
  - CSV data is joinable with other attached databases (federation)
  - CSV connections appear in the same connection list and data browser as database connections
  - Comprehensive test coverage: unit, integration, and E2E

- **Non-Goals:**
  - Remote/URL-based CSV loading (only local uploads)
  - CSV write-back (data is read-only)
  - Large file streaming (existing 20 MB upload limit applies)
  - Parquet, JSON, or other file formats (future work)
  - Auto-creating connections when CSVs are uploaded (explicit creation required)

## Decisions

### Decision: Materialize CSV into DuckDB tables at attach time

**What:** When a CSV connection is attached, create a DuckDB schema named after the connection slug and materialize the CSV data into a table within it using `CREATE TABLE <slug>.<table> AS SELECT * FROM read_csv('<path>')`. The table name is derived from the CSV filename (stem, sanitized to valid identifier).

**Why:** This avoids the `enable_external_access = false` constraint at query time. Data is loaded once into DuckDB's in-memory columnar storage, making subsequent queries fast. It also prevents query-time file path injection attacks.

**Alternatives considered:**
- *Keep external access enabled for CSV paths:* Would weaken the security model and require path allowlisting. Rejected.
- *Use DuckDB views over `read_csv()`:* Would fail after hardening disables external access. Rejected.
- *Attach a DuckDB file database per CSV:* Overcomplicated for single-file data. Rejected.

### Decision: One CSV file per connection

**What:** Each CSV connection references exactly one file via `connectionConfig.filename`. The file must already exist in the project's `uploads/` directory.

**Why:** Keeps the model simple and consistent. Multiple CSVs can be added as separate connections, each with its own slug (schema name). This matches the mental model of "one data source = one connection."

**Alternatives considered:**
- *Multiple files per connection (one table each):* More complex config, harder to name tables unambiguously, and harder to manage. Can be added later if needed.

### Decision: CSV-specific connectionConfig fields

**What:** For `type: "csv"`, the `connectionConfig` accepts: `filename` (required, string), `delimiter` (optional, string, default auto-detect), `header` (optional, boolean, default auto-detect), `quote` (optional, string), `escape` (optional, string), `skip` (optional, number). Standard fields like `host`, `port`, `user`, `password` are irrelevant and should be absent.

**Why:** DuckDB's CSV sniffer handles most cases automatically. Explicit options are escape hatches for non-standard files. Keeping config flat (not nested) matches the existing `connectionConfig` pattern.

### Decision: Re-attach to reload data

**What:** If a user re-uploads the same CSV file (overwriting it), they must trigger a re-attach (e.g., by editing and saving the connection, or toggling `isActive`) to refresh the materialized table.

**Why:** Automatic file watching adds complexity without clear benefit. Explicit reload is simpler and predictable. The `invalidateScopedViews` pattern already exists for similar cache-busting.

### Decision: Validate file existence on create/update

**What:** The API validates that `connectionConfig.filename` references an existing file in the project's `uploads/` directory before creating or updating a CSV connection.

**Why:** Prevents broken connections from being created. Fast to check (stat call). Consistent with how database connection tests verify reachability.

## Risks / Trade-offs

- **Memory usage:** CSV data is materialized in DuckDB's in-memory storage. With the 20 MB upload limit this is bounded, but many CSV connections in one project could accumulate. *Mitigation:* The 20 MB limit per file and the existing DuckDB memory cap (512 MB in `hardenConnection`) provide natural bounds. Inactive connections are not loaded.
- **Stale data:** If the underlying CSV file changes, the DuckDB table is stale until re-attached. *Mitigation:* Document this behavior; add a "reload" action in a future iteration.
- **DuckDB instance caching:** The current `getProjectInstance` caches instances indefinitely. CSV tables are materialized at first attach and survive in the cache. *Mitigation:* This is the same behavior as database connections (which also cache their attached state).

## Open Questions

- None — the design is straightforward given the existing patterns.
