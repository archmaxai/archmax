## ADDED Requirements

### Requirement: Firebird Extension Configuration

The image SHALL accept an optional `DUCKDB_ENABLE_CUSTOM_FIREBIRD` environment variable that activates the Firebird connection type and the automatic installation of the custom, unsigned Firebird DuckDB extension. The variable SHALL default to disabled; only `true` or `1` (case-insensitive) SHALL enable it.

When enabled, project DuckDB instances SHALL be created with the `allow_unsigned_extensions` configuration option (so the unsigned Firebird extension can load) regardless of whether `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` is set. Enabling `DUCKDB_ENABLE_CUSTOM_FIREBIRD` SHALL NOT enable the federation console's arbitrary custom-source install path, which remains gated solely by `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS`.

The image SHALL additionally accept an optional `DUCKDB_FIREBIRD_EXTENSION_REPOSITORY` environment variable specifying the custom extension repository URL used to install the Firebird extension. It SHALL default to `https://archmaxai.github.io/duckdb_firebird` when unset.

These variables SHALL be documented in `.env.example`, in the Docker reference page environment-variable table, and in the data-federation guide, including a security note that the Firebird extension is unsigned and executes arbitrary native code in the application process, and that it should only be enabled when the Firebird source is trusted.

#### Scenario: Disabled by default

- **WHEN** the image starts without `DUCKDB_ENABLE_CUSTOM_FIREBIRD` set
- **THEN** the Firebird connection type is inactive
- **AND** the Firebird extension is not installed

#### Scenario: Enabled activates Firebird and unsigned loading

- **WHEN** the image starts with `DUCKDB_ENABLE_CUSTOM_FIREBIRD=true`
- **THEN** the Firebird connection type is active
- **AND** project DuckDB instances are created with `allow_unsigned_extensions` so the unsigned Firebird extension can load
- **AND** the Firebird extension is installed from `DUCKDB_FIREBIRD_EXTENSION_REPOSITORY` (or its default) when a Firebird connection is used

#### Scenario: Enabling Firebird does not enable console custom-source installs

- **WHEN** the image starts with `DUCKDB_ENABLE_CUSTOM_FIREBIRD=true` but `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` unset or falsy
- **THEN** the federation console still rejects `INSTALL <extension> FROM '<source>'` custom-source installs with 400

#### Scenario: Documented in environment reference

- **WHEN** a user reads `.env.example` or the Docker reference environment-variable table
- **THEN** they find `DUCKDB_ENABLE_CUSTOM_FIREBIRD` and `DUCKDB_FIREBIRD_EXTENSION_REPOSITORY` documented as optional and disabled/defaulted
- **AND** a security warning explains that the Firebird extension is unsigned and runs arbitrary native code
