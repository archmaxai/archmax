## ADDED Requirements

### Requirement: Firebird Extension Configuration

The image SHALL accept an optional `DUCKDB_ENABLE_FIREBIRD` environment variable that activates the Firebird connection type and the automatic installation of the unsigned Firebird DuckDB extension. The variable SHALL default to disabled; only `true` or `1` (case-insensitive) SHALL enable it.

Because the Firebird extension is unsigned, `DUCKDB_ENABLE_FIREBIRD` SHALL take effect only when `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` is also truthy. When `DUCKDB_ENABLE_FIREBIRD` is enabled but unsigned extensions are disabled, Firebird SHALL remain inactive and the application SHALL log a startup warning explaining that `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` must also be enabled.

The image SHALL additionally accept an optional `DUCKDB_FIREBIRD_EXTENSION_REPOSITORY` environment variable specifying the custom extension repository URL used to install the Firebird extension. It SHALL default to `https://archmaxai.github.io/duckdb_firebird` when unset.

These variables SHALL be documented in `.env.example`, in the Docker reference page environment-variable table, and in the data-federation guide, including a security note that the Firebird extension is unsigned and executes arbitrary native code in the application process, and that it should only be enabled for trusted extension sources.

#### Scenario: Disabled by default

- **WHEN** the image starts without `DUCKDB_ENABLE_FIREBIRD` set
- **THEN** the Firebird connection type is inactive
- **AND** the Firebird extension is not installed

#### Scenario: Enabled with unsigned extensions allowed

- **WHEN** the image starts with both `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS=true` and `DUCKDB_ENABLE_FIREBIRD=true`
- **THEN** the Firebird connection type is active
- **AND** the Firebird extension is installed from `DUCKDB_FIREBIRD_EXTENSION_REPOSITORY` (or its default) when a Firebird connection is used

#### Scenario: Enabled without unsigned extensions allowed

- **WHEN** the image starts with `DUCKDB_ENABLE_FIREBIRD=true` but `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` unset or falsy
- **THEN** the Firebird connection type remains inactive
- **AND** a startup warning is logged stating that `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` must also be enabled

#### Scenario: Documented in environment reference

- **WHEN** a user reads `.env.example` or the Docker reference environment-variable table
- **THEN** they find `DUCKDB_ENABLE_FIREBIRD` and `DUCKDB_FIREBIRD_EXTENSION_REPOSITORY` documented as optional and disabled/defaulted
- **AND** a security warning explains that the Firebird extension is unsigned and runs arbitrary native code
