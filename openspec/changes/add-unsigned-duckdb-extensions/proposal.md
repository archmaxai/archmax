# Change: Allow installing unsigned DuckDB extensions from the console (env-gated)

## Why

The federation console only installs signed core or `FROM community` extensions, because the project DuckDB instances are created without `allow_unsigned_extensions`. Operators who run their own extension builds or trusted third-party `.duckdb_extension` artifacts have no way to load them. We want to support this for self-hosters who explicitly opt in, while keeping the default posture (signed/community only) unchanged.

## What Changes

- Add an opt-in env var `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` (default off). When truthy, project DuckDB instances are created with the `allow_unsigned_extensions` config option enabled.
- Extend the console extension-install path (`POST .../duckdb-console/extensions`) so that, **only when the env var is enabled**, it accepts `INSTALL <extension> FROM '<source>'` where `<source>` is a single-quoted custom repository URL or local extension path. Signed/community installs (`INSTALL <ext> [FROM community]`, `LOAD <ext>`) are unchanged.
- When the env var is **not** set, custom-source installs are rejected with 400 and instances are created without the flag — preserving current behavior exactly.
- Document the new variable in `.env.example` and the Docker reference env table, including a security note that unsigned extensions run arbitrary native code.

## Impact

- Affected specs: `duckdb-console` (ADDED requirement), `deployment` (ADDED requirement)
- Affected code:
  - `packages/core/src/config/env.ts` — add `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS`
  - `packages/core/src/services/duckdb.ts` — pass `allow_unsigned_extensions` to `DuckDBInstance.create()` via a shared helper
  - `packages/core/src/services/duckdb-console.ts` — `parseExtensionSql` accepts env-gated `FROM '<source>'`
  - `.env.example`, `apps/docs` Docker reference page
- Security: enabling the flag permits loading unsigned native extensions (arbitrary code execution surface); off by default and clearly documented.
