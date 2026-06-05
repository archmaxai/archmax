## Context

DuckDB has no native Firebird driver; the only `TYPE firebird` ATTACH support comes from a custom, unsigned extension hosted at `https://archmaxai.github.io/duckdb_firebird`. Loading it requires two things the platform does not do today:

1. The instance must be created with `allow_unsigned_extensions`. `createDuckDBInstance()` in `packages/core/src/services/duckdb.ts` already sets this when `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` is on (pending `add-unsigned-duckdb-extensions` change); enabling Firebird MUST also turn it on.
2. The extension must be installed from a custom repository using `SET custom_extension_repository = '<repo>'; INSTALL firebird; LOAD firebird;` — a different shape from the existing `INSTALL <ext> FROM '<source>'` console path.

Connection types are enumerated in `packages/core/src/models/Connection.ts` (`CONNECTION_TYPES`), validated by `apps/api/src/routes/connections.ts` (`z.enum(CONNECTION_TYPES)`), duplicated in the frontend (`apps/frontend/src/routes/_auth/$projectId/connections/index.tsx`), and dispatched on in `duckdb.ts` (`extensionForType`, `buildAttachString`, `attachConnection`, `testSingleConnection`) and `duckdb-console.ts` (`extensionTypeLabel`). Adding a connection type touches all of these.

## Goals / Non-Goals

- Goals:
  - First-class `firebird` connection type with UI-defined `host`/`port`/`database`/`user`/`password`/`charset` parameters (default port `3050`, default charset `UTF8`), behaving like Postgres/MySQL in federation, data browser, tests, and MCP.
  - A single opt-in env var that activates Firebird and, by itself, permits the unsigned extension to load.
  - Default-off, zero behavior change when the var is unset.
  - Auto-install/load the extension from the custom repo with no console action.
- Non-Goals:
  - Per-project or per-connection extension allowlists.
  - Supporting Firebird via the DuckDB ODBC extension (out of scope; this uses the custom native extension).
  - A general operator settings UI; Firebird configuration stays an env/deployment concern, surfaced to the UI only as a capability flag.

## Decisions

- **Decision: Single flag that implies unsigned.** `DUCKDB_ENABLE_CUSTOM_FIREBIRD` (`true`/`1`, case-insensitive) both activates the Firebird type and causes `createDuckDBInstance()` to start instances with `allow_unsigned_extensions`. `createDuckDBInstance()` enables the option when `allowUnsignedExtensions() || customFirebirdEnabled()`. A `customFirebirdEnabled()` helper in `config/env.ts` encodes the gate.
  - Rationale: the operator opts into exactly one specific unsigned extension via one variable, without having to also set `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS`. The two features remain independent — turning on Firebird does not enable the console's arbitrary-source install path (that still requires `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS`).
- **Decision: custom-repository install branch.** `installAndLoadExtension` gains a firebird-specific path that runs `SET custom_extension_repository = '<repo>'` (repo from `DUCKDB_FIREBIRD_EXTENSION_REPOSITORY`, default `https://archmaxai.github.io/duckdb_firebird`, single-quote-escaped) before `INSTALL firebird; LOAD firebird;`.
- **Decision: auto-install, no console step.** When Firebird is active, the extension is installed+loaded as part of the normal instance/extension bookkeeping (the same `loadedExtensions` flow used for postgres/mysql), so attaching a Firebird connection needs no manual `INSTALL`/`LOAD`.
- **Decision: connection parameters and DSN.** Firebird reuses the structured relational fields plus a new non-sensitive `charset` field: `host`, `port` (default `3050`), `database` (path/alias **as seen on the Firebird host**, e.g. `C:\firebird.fdb`), `user`, `password`, `charset` (default `UTF8`). `extensionForType("firebird")` returns `"firebird"`; `attachConnection` installs the extension then `ATTACH '<dsn>' AS <slug> (TYPE FIREBIRD, READ_ONLY)`. `buildAttachString` gets a `firebird` case building the DSN from these fields, with `uri` pass-through preserved. The `database` value is treated as an opaque host-side path/alias and is NOT validated as a local filesystem path.
- **Decision: `charset` added to the shared `connectionConfig`.** Like `encrypt` (mssql-only) today, `charset` lives in the shared schema but is only consumed by the firebird DSN. Non-sensitive, so no encryption/redaction treatment.
- **Decision: capability flag endpoint.** A small authenticated endpoint returns `{ firebirdEnabled: boolean }` (= `customFirebirdEnabled()`) so the frontend conditionally lists Firebird and sets default port/charset. No new persisted state.
- **Decision: API rejects inactive type.** When Firebird is inactive, `POST`/`PUT` connections with `type: "firebird"` return 400, so a stored Firebird connection cannot exist on an instance that cannot load the extension.

## Risks / Trade-offs

- **Arbitrary code execution**: the Firebird extension is unsigned native code. Mitigation: default off; documented with an explicit security warning; repository URL is single-quote-escaped before interpolation.
- **Exact ATTACH DSN unknown**: the custom extension's connection-string format is not in public DuckDB docs (see Open Questions). Mitigation: build the DSN from the known fields (`host`/`port`/`database`/`user`/`password`/`charset`) plus `uri` pass-through, and confirm the exact key names/format against the extension during implementation; the spec is written around observable behavior (a Firebird connection attaches and `SELECT 1` succeeds) rather than a hard-coded DSN string.
- **Worker vs API divergence**: the flag is process-level env, shared by API and worker via the single Docker image; both must have it set for worker-side materialisation against Firebird to work. Documented in the env table.

## Migration Plan

No data migration. Purely additive: unset var ⇒ identical behavior to today. To enable: set `DUCKDB_ENABLE_CUSTOM_FIREBIRD=true` (optionally `DUCKDB_FIREBIRD_EXTENSION_REPOSITORY`) and restart. To disable: unset and restart; instances are in-memory and rebuilt per process so nothing persists. Existing Firebird connection documents (if any) simply fail to attach while inactive.

## Open Questions

- Exact connection-string/DSN format the `duckdb_firebird` extension expects for `ATTACH … (TYPE firebird)` and the precise key names for host/port/database/user/password/charset. Resolve by testing against the published extension during implementation; `buildAttachString` and the attach scenario will be finalized then.
- Whether the extension requires any companion extension (analogous to iceberg needing `httpfs`). Assumed single-extension unless testing shows otherwise.
