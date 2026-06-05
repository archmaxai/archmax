## Context

DuckDB has no native Firebird driver; the only `TYPE firebird` ATTACH support comes from a custom, unsigned extension hosted at `https://archmaxai.github.io/duckdb_firebird`. Loading it requires two things the platform does not do today:

1. The instance must be created with `allow_unsigned_extensions` (already wired via `createDuckDBInstance()` in `packages/core/src/services/duckdb.ts`, gated by the pending `add-unsigned-duckdb-extensions` change's `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS`).
2. The extension must be installed from a custom repository using `SET custom_extension_repository = '<repo>'; INSTALL firebird; LOAD firebird;` — a different shape from the existing `INSTALL <ext> FROM '<source>'` console path.

Connection types are enumerated in `packages/core/src/models/Connection.ts` (`CONNECTION_TYPES`), validated by `apps/api/src/routes/connections.ts` (`z.enum(CONNECTION_TYPES)`), duplicated in the frontend (`apps/frontend/src/routes/_auth/$projectId/connections/index.tsx`), and dispatched on in `duckdb.ts` (`extensionForType`, `buildAttachString`, `attachConnection`, `testSingleConnection`) and `duckdb-console.ts` (`extensionTypeLabel`). Adding a connection type touches all of these.

## Goals / Non-Goals

- Goals:
  - First-class `firebird` connection type with UI-defined `host`/`port`/`database`/`user`/`password` parameters (default port `3050`), behaving like Postgres/MySQL in federation, data browser, tests, and MCP.
  - Single opt-in env var that activates Firebird, effective only when unsigned extensions are allowed.
  - Default-off, zero behavior change when the var is unset.
  - Auto-install/load the extension from the custom repo with no console action.
- Non-Goals:
  - Per-project or per-connection extension allowlists.
  - Supporting Firebird via the DuckDB ODBC extension (out of scope; this uses the custom native extension).
  - A general operator settings UI; Firebird configuration stays an env/deployment concern, surfaced to the UI only as a capability flag.

## Decisions

- **Decision: Two-flag gate.** Firebird is active iff `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` is truthy AND `DUCKDB_ENABLE_FIREBIRD` is truthy (`true`/`1`, case-insensitive). A `firebirdEnabled()` helper in `config/env.ts` encodes this (it returns `false` when unsigned extensions are off, logging a one-time warning if `DUCKDB_ENABLE_FIREBIRD` was set). This matches the user's framing ("if unsigned extensions can be installed … add a var that activates Firebird") and keeps the unsigned-code opt-in explicit.
  - Alternatives considered: a single `DUCKDB_ENABLE_FIREBIRD` that implicitly enables `allow_unsigned_extensions`. Rejected so enabling one specific extension never silently widens the instance to all unsigned extensions.
- **Decision: custom-repository install branch.** `installAndLoadExtension` gains a firebird-specific path that runs `SET custom_extension_repository = '<repo>'` (repo from `DUCKDB_FIREBIRD_EXTENSION_REPOSITORY`, default `https://archmaxai.github.io/duckdb_firebird`, single-quote-escaped) before `INSTALL firebird; LOAD firebird;`. This is distinct from the console's `INSTALL <ext> FROM '<source>'` path and is the shape the extension requires.
- **Decision: auto-install, no console step.** When Firebird is active, the extension is installed+loaded as part of the normal instance/extension bookkeeping (the same `loadedExtensions` flow used for postgres/mysql), so attaching a Firebird connection needs no manual `INSTALL`/`LOAD`. Because `createDuckDBInstance()` already enables `allow_unsigned_extensions` under the unsigned gate, no extra instance-config change is needed.
- **Decision: attach via `extensionForType` → `"firebird"`.** `extensionForType("firebird")` returns `"firebird"`; `attachConnection` installs the extension (custom-repo branch) then `ATTACH '<dsn>' AS <slug> (TYPE FIREBIRD, READ_ONLY)`. `buildAttachString` gets a `firebird` case mirroring the Postgres key=value DSN with default port `3050`. `uri` pass-through is preserved.
- **Decision: capability flag endpoint.** A small authenticated endpoint returns `{ firebirdEnabled: boolean }` so the frontend conditionally lists Firebird in the type dropdown and sets default port `3050`. No new persisted state.
- **Decision: API rejects inactive type.** When Firebird is inactive, `POST`/`PUT` connections with `type: "firebird"` return 400 (defense in depth even though the UI hides the option), so a stored Firebird connection cannot exist on an instance that cannot load the extension.

## Risks / Trade-offs

- **Arbitrary code execution**: the Firebird extension is unsigned native code. Mitigation: default off; requires the unsigned-extensions gate; documented with an explicit security warning; repository URL is single-quote-escaped before interpolation.
- **Exact ATTACH DSN unknown**: the custom extension's connection-string format is not in public DuckDB docs (see Open Questions). Mitigation: default to the Postgres-style `host=… port=… database=… user=… password=…` DSN plus `uri` pass-through, and confirm against the extension during implementation; the spec is written around observable behavior (a Firebird connection attaches and `SELECT 1` succeeds) rather than a hard-coded DSN string.
- **Worker vs API divergence**: the flags are process-level env, shared by API and worker via the single Docker image; both must have them set for worker-side materialisation against Firebird to work. Documented in the env table.

## Migration Plan

No data migration. Purely additive: unset vars ⇒ identical behavior to today. To enable: set `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS=true` and `DUCKDB_ENABLE_FIREBIRD=true` (optionally `DUCKDB_FIREBIRD_EXTENSION_REPOSITORY`) and restart. To disable: unset and restart; instances are in-memory and rebuilt per process so nothing persists. Existing Firebird connection documents (if any) simply fail to attach while inactive.

## Open Questions

- Exact connection-string/DSN format the `duckdb_firebird` extension expects for `ATTACH … (TYPE firebird)` (e.g. `host=… port=3050 database=/path/to.fdb user=SYSDBA password=…` vs. an ODBC-style `Database=host/port:path` form). Resolve by testing against the published extension during implementation; `buildAttachString` and the attach scenario will be finalized then.
- Whether the extension requires any companion extension (analogous to iceberg needing `httpfs`). Assumed single-extension unless testing shows otherwise.
