## ADDED Requirements

### Requirement: DuckDB Console Setup API

The API SHALL expose an authenticated `GET /api/projects/:projectId/duckdb-console/setup` endpoint that returns copyable setup commands for the project's federated DuckDB instance.

The response body SHALL include:

- `preinstalledExtensions` — array of `{ name, installSql, loadSql }` for extensions shipped in the Docker image (`postgres`, `mysql`, `sqlite`, `mssql`, `iceberg`, `httpfs`, `avro`), where `installSql` uses `INSTALL mssql FROM community` when applicable
- `connections` — array of `{ slug, type, attachSql }` for each active, non-deleted connection, where `attachSql` is a redacted `ATTACH` example (passwords, tokens, and URI secrets MUST appear as `********`)
- `exampleQuery` — a single-line SQL example referencing real connection slugs when possible, or a commented placeholder when the project has no active connections

#### Scenario: Setup for project with connections

- **WHEN** a GET request is made to `/api/projects/:projectId/duckdb-console/setup` for a project with at least one active connection
- **THEN** the response status is 200
- **AND** `connections` contains one entry per active connection with a redacted `attachSql`
- **AND** `exampleQuery` references at least one connection slug

#### Scenario: Setup for project without connections

- **WHEN** a GET request is made for a project with no active connections
- **THEN** the response status is 200
- **AND** `connections` is an empty array
- **AND** `exampleQuery` is a commented placeholder explaining that connections must be added first

#### Scenario: Unauthenticated request

- **WHEN** a GET request is made without a valid session
- **THEN** the response status is 401

### Requirement: DuckDB Console Query API

The API SHALL expose an authenticated `POST /api/projects/:projectId/duckdb-console/query` endpoint that executes a single read-oriented SQL statement against the project's federated DuckDB instance (all active connections attached, same instance as the data browser).

The request body SHALL be `{ sql: string }`. The server SHALL reject empty SQL, multi-statement batches, and statements whose first keyword is not in the allowlist: `SELECT`, `WITH`, `SHOW`, `DESCRIBE`, `EXPLAIN`. The server SHALL reject statements whose first keyword is in a denylist including `INSERT`, `UPDATE`, `DELETE`, `COPY`, `ATTACH`, `DETACH`, `CREATE`, `DROP`, `INSTALL`, and `LOAD`.

Queries SHALL run with `readOnly: true` on the project instance (attached upstream catalogs remain `READ_ONLY`). Queries SHALL be subject to `QUERY_TIMEOUT_MS` with cancellation via `connection.interrupt()`. Error messages returned to the client SHALL have upstream credentials redacted.

The response body SHALL include `columns` (string array), `rows` (array of objects), `rowCount` (number), and `durationMs` (number). Bigint result values SHALL be JSON-serialized as numbers.

#### Scenario: Successful federation query

- **WHEN** an authenticated POST submits `SELECT 1 AS n`
- **THEN** the response status is 200
- **AND** `rows` contains `{ n: 1 }`
- **AND** `rowCount` is 1

#### Scenario: Reject write statement

- **WHEN** an authenticated POST submits `INSERT INTO shopify.public.orders VALUES (1)`
- **THEN** the response status is 400
- **AND** the error message indicates the statement type is not allowed

#### Scenario: Reject multi-statement batch

- **WHEN** an authenticated POST submits `SELECT 1; SELECT 2`
- **THEN** the response status is 400

#### Scenario: Query timeout

- **WHEN** a query exceeds `QUERY_TIMEOUT_MS`
- **THEN** the response status is 504 or 500 with a timeout error message
- **AND** the in-flight query is interrupted

### Requirement: DuckDB Console Extension Install API

The API SHALL expose an authenticated `POST /api/projects/:projectId/duckdb-console/extensions` endpoint that installs and loads a single DuckDB extension on the project's cached instance.

The request body SHALL be `{ sql: string }` where `sql` is exactly one statement matching either:

- `INSTALL <extension> [FROM community]` (case-insensitive keywords), or
- `LOAD <extension>`

The `<extension>` name SHALL match `^[a-z][a-z0-9_]*$`. Any other statement shape SHALL be rejected with 400.

On success, the extension SHALL be loaded on the project's DuckDB instance using the same install/load path as connection attach (including `FROM community` when specified). The response body SHALL include `{ ok: true, extension: string }`.

#### Scenario: Install community extension

- **WHEN** an authenticated POST submits `INSTALL spatial FROM community`
- **THEN** the response status is 200
- **AND** `extension` is `spatial`
- **AND** subsequent console queries in the same API process can use the loaded extension

#### Scenario: Reject invalid extension name

- **WHEN** an authenticated POST submits `INSTALL ../evil FROM community`
- **THEN** the response status is 400

#### Scenario: Reject non-extension SQL

- **WHEN** an authenticated POST submits `SELECT 1`
- **THEN** the response status is 400

### Requirement: DuckDB Console Page

The frontend SHALL render a federation console page at `/$projectId/connections/console` accessible from the **Data Federation** sidebar group.

The page SHALL present a **single SQL editor** (textarea is sufficient) and a page-header **Run** control. Run SHALL route the submitted statement based on its leading keyword:

- Statements beginning with `INSTALL` or `LOAD` SHALL be submitted to `POST .../duckdb-console/extensions`; on success a `toast.success` SHALL confirm the loaded extension.
- All other statements SHALL be submitted to `POST .../duckdb-console/query` and the results rendered in a table with column headers.

The page SHALL NOT render a separate setup-commands panel or a separate extension-install control; the one editor serves both purposes. The page MAY load `GET .../duckdb-console/setup` to determine whether the project has active connections.

When the project has no active connections, the page SHALL show an empty state directing the user to add connections under Data Sources, and the **Run** control SHALL be disabled.

#### Scenario: Run query from console

- **WHEN** the user enters `SELECT 1` and clicks **Run**
- **THEN** the results table shows one row
- **AND** a success toast is not shown for query success (results are sufficient); errors use `toast.error` with the server message

#### Scenario: Install extension from the same editor

- **WHEN** the user enters `INSTALL spatial FROM community` and clicks **Run**
- **THEN** the statement is sent to the extensions endpoint
- **AND** a `toast.success` confirms the extension was loaded

#### Scenario: Navigate from sidebar

- **WHEN** the user clicks **Console** under Data Federation
- **THEN** the URL is `/<projectId>/connections/console`
- **AND** the Console nav item is highlighted
