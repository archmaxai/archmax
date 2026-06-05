## Context

The federation console (`packages/core/src/services/duckdb-console.ts`) lets an authenticated admin run read-only SQL and install DuckDB extensions on a project's in-process, in-memory DuckDB instance. `parseExtensionSql` currently only accepts `INSTALL <ext> [FROM community]` or `LOAD <ext>`, and instances are created via bare `DuckDBInstance.create()` in `packages/core/src/services/duckdb.ts` (`setupProjectInstance`, `testSingleConnection`, `testIcebergConnection`).

DuckDB refuses to load extensions that are not signed by the DuckDB org unless the database was started with the `allow_unsigned_extensions` configuration option. That option can **only** be set at instance-creation time, not via `SET` on a live connection. So enabling unsigned extensions requires changing how instances are created, not just the SQL parser.

## Goals / Non-Goals

- Goals:
  - Let opted-in self-hosters install trusted unsigned/custom-source extensions from the console.
  - Default-off, zero behavior change when the env var is unset.
  - Keep the gate in one obvious place (env-derived boolean) reused by both instance creation and SQL parsing.
- Non-Goals:
  - Per-project or per-extension allowlists (single global toggle is sufficient for now).
  - A UI control to toggle the setting (it is an operator/deployment concern).
  - Changing the read-only query allowlist or the `INSTALL/LOAD` keyword routing in the frontend.

## Decisions

- **Decision: Single global env var `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS`.** Parsed once as a boolean (truthy for `true`/`1`, case-insensitive). Exposed from `config/env.ts` like the other DuckDB knobs (`QUERY_TIMEOUT_MS`, `MAX_CONCURRENT_QUERIES`). A helper `allowUnsignedExtensions()` reads it.
  - Alternatives considered: per-project DB field (more flexible but adds schema + UI + migration for a niche operator feature); reusing an existing flag (none fit).
- **Decision: Apply the config at instance creation via a shared `createDuckDBInstance()` helper.** All call sites that currently call `DuckDBInstance.create()` route through it so every instance (federation, connection-test) gets a consistent config: `{ allow_unsigned_extensions: "true" }` only when the flag is on.
- **Decision: Extend `parseExtensionSql` to accept `INSTALL <extension> FROM '<source>'` only when the flag is on.** `<source>` is a single-quoted string (custom repository URL or local extension path). When the flag is off, this shape is rejected with the existing "must be INSTALL …" 400 error so behavior is unchanged. The extension name still matches `^[a-z][a-z0-9_]*$`; the quoted source is passed through to `INSTALL <ext> FROM '<source>'`.
- **Decision: Reuse the existing install/load execution path** (`ensureProjectExtensionLoaded` / `installAndLoadExtension`), extended to carry an optional `fromSource` so it emits `INSTALL <ext> FROM '<source>'` instead of `INSTALL <ext>[ FROM community]`.

## Risks / Trade-offs

- **Arbitrary code execution**: unsigned extensions are native code loaded into the API/worker process. Mitigation: off by default; documented with an explicit security warning; only reachable by an authenticated admin via the console; source string is single-quote-escaped before interpolation.
- **Worker vs API divergence**: the flag is process-level env, so both the API and BullMQ worker must share it for materialised views that depend on a custom extension to work in both. Mitigation: it is a normal env var present in the single Docker image for all processes; documented in the env table.

## Migration Plan

No data migration. Purely additive: unset env var ⇒ identical behavior to today. To enable, set `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS=true` and restart. To disable, unset and restart (instances are in-memory and rebuilt per process, so no persisted state carries the flag).

## Open Questions

- None. Local-path installs (`INSTALL '<path>.duckdb_extension'` with no `FROM`) are explicitly out of scope; only `INSTALL <extension> FROM '<source>'` is supported.
