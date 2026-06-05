## ADDED Requirements

### Requirement: Firebird Extension Configuration

The image SHALL accept an optional `DUCKDB_ENABLE_CUSTOM_FIREBIRD` environment variable that activates the Firebird connection type and the automatic installation of the custom, unsigned Firebird DuckDB extension. The variable SHALL default to disabled; only `true` or `1` (case-insensitive) SHALL enable it.

When enabled, project DuckDB instances SHALL be created with the `allow_unsigned_extensions` configuration option (so the unsigned Firebird extension can load). `DUCKDB_ENABLE_CUSTOM_FIREBIRD` SHALL be the only switch that enables unsigned-extension support; the federation console SHALL NOT install unsigned extensions from arbitrary custom sources.

The Firebird extension SHALL be installed from a fixed archmax-hosted repository (`https://archmaxai.github.io/duckdb_firebird`); this repository is not configurable.

This variable SHALL be documented in `.env.example`, in the Docker reference page environment-variable table, and in the data-federation guide, including a security note that the Firebird extension is unsigned and executes arbitrary native code in the application process, and that it should only be enabled when the Firebird source is trusted.

#### Scenario: Disabled by default

- **WHEN** the image starts without `DUCKDB_ENABLE_CUSTOM_FIREBIRD` set
- **THEN** the Firebird connection type is inactive
- **AND** the Firebird extension is not installed

#### Scenario: Enabled activates Firebird and unsigned loading

- **WHEN** the image starts with `DUCKDB_ENABLE_CUSTOM_FIREBIRD=true`
- **THEN** the Firebird connection type is active
- **AND** project DuckDB instances are created with `allow_unsigned_extensions` so the unsigned Firebird extension can load
- **AND** the Firebird extension is installed from the fixed archmax-hosted repository (`https://archmaxai.github.io/duckdb_firebird`) when a Firebird connection is used

#### Scenario: Console never installs from arbitrary custom sources

- **WHEN** the federation console receives `INSTALL <extension> FROM '<source>'`
- **THEN** it rejects the statement with 400 regardless of `DUCKDB_ENABLE_CUSTOM_FIREBIRD`

#### Scenario: Documented in environment reference

- **WHEN** a user reads `.env.example` or the Docker reference environment-variable table
- **THEN** they find `DUCKDB_ENABLE_CUSTOM_FIREBIRD` documented as optional and disabled by default
- **AND** a security warning explains that the Firebird extension is unsigned and runs arbitrary native code
