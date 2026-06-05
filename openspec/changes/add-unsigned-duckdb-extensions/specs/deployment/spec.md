## ADDED Requirements

### Requirement: Unsigned DuckDB Extensions Configuration

The image SHALL accept an optional `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` environment variable that controls whether the federated DuckDB instances permit loading unsigned extensions. The variable SHALL default to disabled; only `true` or `1` (case-insensitive) SHALL enable it.

When enabled, all DuckDB instances created by the application SHALL be started with the `allow_unsigned_extensions` configuration option so that unsigned/custom-source extensions installed via the federation console can load. When unset or falsy, instances SHALL be created without the option (signed core and community extensions only).

The variable SHALL be documented in `.env.example` and in the Docker reference page environment-variable table, including a security note that unsigned extensions execute arbitrary native code in the application process and that the setting should only be enabled for trusted extension sources.

#### Scenario: Disabled by default

- **WHEN** the image starts without `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` set
- **THEN** DuckDB instances are created without `allow_unsigned_extensions`
- **AND** only signed core and `FROM community` extensions can be installed

#### Scenario: Enabled via environment

- **WHEN** the image starts with `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS=true`
- **THEN** DuckDB instances are created with `allow_unsigned_extensions` enabled
- **AND** the federation console can install unsigned extensions from a custom source

#### Scenario: Documented in environment reference

- **WHEN** a user reads `.env.example` or the Docker reference environment-variable table
- **THEN** they find `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` documented as optional and disabled by default
- **AND** a security warning explains that unsigned extensions run arbitrary native code
