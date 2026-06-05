## ADDED Requirements

### Requirement: Unsigned Extension Installation Gate

The DuckDB Console Extension Install endpoint (`POST /api/projects/:projectId/duckdb-console/extensions`) SHALL allow installing unsigned extensions from a custom source only when the `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` environment variable is truthy (`true` or `1`, case-insensitive). This requirement is additive to and does not relax the signed/community install behavior.

When the gate is enabled:

- Project DuckDB instances SHALL be created with the `allow_unsigned_extensions` configuration option enabled, so unsigned extensions can load.
- The extension-install parser SHALL additionally accept `INSTALL <extension> FROM '<source>'`, where `<extension>` matches `^[a-z][a-z0-9_]*$` and `<source>` is a single-quoted custom repository URL or local extension path. The server SHALL escape the `<source>` value before interpolating it into the executed `INSTALL <extension> FROM '<source>'` statement.

When the gate is disabled (the default):

- Project DuckDB instances SHALL be created WITHOUT the `allow_unsigned_extensions` option, so only signed core and `FROM community` extensions can load.
- `INSTALL <extension> FROM '<source>'` SHALL be rejected with status 400, leaving the existing accepted shapes (`INSTALL <extension>`, `INSTALL <extension> FROM community`, `LOAD <extension>`) unchanged.

The gate SHALL NOT change the read-only query allowlist or the keyword routing performed by the console page.

#### Scenario: Install unsigned extension when gate enabled

- **WHEN** `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` is `true`
- **AND** an authenticated POST submits `INSTALL myext FROM 'https://example.com/repo'`
- **THEN** the response status is 200
- **AND** `extension` is `myext`
- **AND** the statement executed against DuckDB is `INSTALL myext FROM 'https://example.com/repo'`

#### Scenario: Reject unsigned install when gate disabled

- **WHEN** `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` is unset or falsy
- **AND** an authenticated POST submits `INSTALL myext FROM 'https://example.com/repo'`
- **THEN** the response status is 400
- **AND** the error indicates the statement must be `INSTALL <extension> [FROM community]` or `LOAD <extension>`

#### Scenario: Signed and community installs unaffected by gate

- **WHEN** an authenticated POST submits `INSTALL spatial FROM community`
- **THEN** the response status is 200 regardless of the `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` value
- **AND** `extension` is `spatial`

#### Scenario: Reject invalid extension name with custom source

- **WHEN** `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` is `true`
- **AND** an authenticated POST submits `INSTALL ../evil FROM 'https://example.com/repo'`
- **THEN** the response status is 400
