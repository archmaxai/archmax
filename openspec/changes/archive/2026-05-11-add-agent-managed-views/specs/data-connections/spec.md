## MODIFIED Requirements

### Requirement: DuckDB Federation

The system SHALL maintain a DuckDB instance per project that attaches all active connections as named schemas, enabling cross-connection SQL queries. The DuckDB instance SHALL be backed by a per-project file at `<ARCHMAX_DATA_DIR>/projects/<projectId>/duckdb.db`, opened via `DuckDBInstance.create(path)` so that platform-managed objects (notably the per-model scoped VIEWs created by the MCP server) persist across process restarts. The parent directory SHALL be created (mkdir -p) before opening if absent, and the `projectId` segment SHALL be validated against the same safe-path regex used by `SemanticModelFileService`. The persistent DuckDB file is build output, not source: it SHALL be excluded from Git via the project's `.gitignore` and the `project-git-versioning` ignore list, and the system MUST recover gracefully when it is missing or corrupt by recreating it on the next call to `getProjectInstance` (every scoped VIEW is rematerialised from the project's `view_query` extensions on first use). The API process SHALL close every cached `DuckDBInstance` during graceful shutdown (SIGTERM / SIGINT) so that file locks are released before exit and an immediate restart can re-open the same files.

The connection's `slug` field SHALL be used as the schema alias when attaching to DuckDB. The MSSQL extension SHALL be installed from the DuckDB community extension registry (`INSTALL mssql FROM community`). The MSSQL attach string SHALL use ADO.NET format (`Server=host,port;Database=db;User Id=user;Password=pass;Encrypt=yes|no`) when structured connection parameters are provided, or pass through the raw URI/connection string when `connectionConfig.uri` is set.

For iceberg connections, the system SHALL use a two-step attach process: (1) create a DuckDB **temporary** secret with `TYPE iceberg` containing the bearer token (or OAuth2 credentials in future) — temporary so the secret stays in process memory and is never persisted to the project's `duckdb.db` file — and (2) attach the catalog with `TYPE iceberg, ENDPOINT, SECRET` options. The `iceberg` and `httpfs` extensions SHALL be installed and loaded before attaching iceberg connections. The Docker image SHALL pre-install the `iceberg` and `httpfs` extensions alongside the existing pre-installed extensions.

ATTACH operations SHALL be subject to a 30-second timeout; on timeout, the DuckDB connection is interrupted and the error is propagated. The connection test endpoint SHALL enforce a 15-second timeout on the `SELECT 1` verification query. Data browser queries SHALL be subject to the same `QUERY_TIMEOUT_MS` timeout as MCP queries, with cancellation via `connection.interrupt()`. ATTACH statements for non-iceberg sources SHALL continue to use `READ_ONLY`, and `enable_external_access = false` SHALL be applied at session start whenever no iceberg connection is attached.

#### Scenario: Attach a postgres connection

- **WHEN** a postgres connection with `slug: "shopify_prod"` is activated within a project
- **THEN** the project's DuckDB instance is opened from `<ARCHMAX_DATA_DIR>/projects/<projectId>/duckdb.db`
- **AND** the connection is attached via the `postgres_scanner` extension using `shopify_prod` as the schema alias

#### Scenario: Attach a mysql connection

- **WHEN** a mysql connection is activated within a project
- **THEN** the connection is attached via the `mysql_scanner` extension using the connection's slug as the schema alias

#### Scenario: Attach an MSSQL connection via structured params

- **WHEN** an MSSQL connection with `slug: "erp"`, `host: "sql.corp.com"`, `port: 1433`, `database: "ERP"`, `user: "reader"`, `password: "secret"`, `encrypt: true` is activated
- **THEN** the MSSQL community extension is installed (`INSTALL mssql FROM community`) and loaded
- **AND** the connection is attached using `ATTACH 'Server=sql.corp.com,1433;Database=ERP;User Id=reader;Password=secret;Encrypt=yes' AS erp (TYPE MSSQL, READ_ONLY)`

#### Scenario: Attach an MSSQL connection via URI

- **WHEN** an MSSQL connection with `slug: "erp"` and `connectionConfig.uri: "mssql://reader:secret@sql.corp.com:1433/ERP?encrypt=true"` is activated
- **THEN** the URI is passed through as-is to the ATTACH command

#### Scenario: Attach an iceberg REST catalog with ephemeral secret

- **WHEN** an iceberg connection with `slug: "lake"`, `endpoint: "https://catalog.example.com"`, `warehouse: "analytics"`, and `token: "eyJ..."` is activated within a project
- **THEN** the `iceberg` and `httpfs` extensions are installed and loaded
- **AND** a DuckDB **temporary** secret named `lake_secret` is created with `TYPE iceberg, TOKEN '<decrypted_token>'`
- **AND** the catalog is attached using `ATTACH 'analytics' AS lake (TYPE iceberg, ENDPOINT 'https://catalog.example.com', SECRET 'lake_secret')`
- **AND** opening `<ARCHMAX_DATA_DIR>/projects/<projectId>/duckdb.db` in a fresh DuckDB process and running `SELECT name FROM duckdb_secrets()` returns zero rows

#### Scenario: Attach timeout for unreachable database

- **WHEN** an ATTACH operation for a connection hangs because the remote database is unreachable
- **THEN** the ATTACH is cancelled via `connection.interrupt()` after 30 seconds
- **AND** an error is propagated to the caller

#### Scenario: Connection test timeout

- **WHEN** the Test Connection action is invoked and the `SELECT 1` verification query hangs
- **THEN** the query is cancelled via `connection.interrupt()` after 15 seconds
- **AND** an error response is returned to the client

#### Scenario: Data browser query timeout

- **WHEN** a data browser query (table listing, row count, or paginated data fetch) exceeds `QUERY_TIMEOUT_MS`
- **THEN** the query is cancelled via `connection.interrupt()`
- **AND** an error is returned to the client

#### Scenario: Remove connection from DuckDB

- **WHEN** a connection is soft-deleted or deactivated
- **THEN** the corresponding schema is detached from the project's DuckDB instance using the connection's slug

#### Scenario: Remove iceberg connection from DuckDB

- **WHEN** an iceberg connection with `slug: "lake"` is soft-deleted or deactivated
- **THEN** the catalog is detached from the project's DuckDB instance
- **AND** the temporary DuckDB secret `lake_secret` is dropped

#### Scenario: Lazy initialization

- **WHEN** the first query is made against a project's DuckDB instance
- **THEN** the DuckDB file is created on disk (if absent) and all active connections are attached
- **AND** subsequent queries reuse the existing instance and the on-disk file

#### Scenario: Persisted scoped VIEWs survive process restart

- **WHEN** the API process exits gracefully and a new process opens the same `<ARCHMAX_DATA_DIR>/projects/<projectId>/duckdb.db`
- **THEN** every cached `DuckDBInstance` was closed during shutdown and the file lock was released before exit
- **AND** the new process can open the file without an `IO Error: Could not set lock on file`
- **AND** the per-model scoped VIEWs (`_scope_<modelName>."<datasetName>"`) created in the previous session are still present
- **AND** an MCP `execute_query` against an unchanged model returns the same rows; the next call rematerialises every VIEW from `view_query` (per the MCP server's "Scoped DuckDB VIEWs" requirement)

#### Scenario: Persistent DuckDB file is gitignored and recoverable

- **WHEN** an operator inspects the project repo
- **THEN** `<ARCHMAX_DATA_DIR>/projects/<projectId>/duckdb.db` is matched by `.gitignore` and the `project-git-versioning` ignore list
- **AND** deleting the file while the API process is stopped does not break the project
- **AND** the next call to `getProjectInstance` recreates the file and the next `execute_query` rematerialises every scoped VIEW from the project's `view_query` extensions

#### Scenario: Test iceberg connection

- **WHEN** the Test Connection action is invoked for an iceberg connection
- **THEN** a temporary DuckDB instance is created, the iceberg catalog is attached, and `SHOW ALL TABLES` is executed to verify connectivity
- **AND** the temporary instance is disposed after the test

#### Scenario: Query iceberg tables in federation

- **WHEN** an iceberg connection with slug `lake` and a postgres connection with slug `pg` are both attached to the same project
- **AND** a semantic model maps `shipments` to `lake.e2e_test.e2e_shipments` and `products` to `pg.public.e2e_products`
- **THEN** a cross-catalog join query `SELECT p.name, s.destination FROM "products" p JOIN "shipments" s ON p.name = s.product_name` returns matching rows

### Requirement: Project DuckDB Instance Disposal

The DuckDB service SHALL expose `disposeProjectInstance(projectId)` that removes the project's cached `ProjectDuckDB` entry from the in-memory instance map and closes the underlying `DuckDBInstance` on a best-effort basis, releasing the file lock on `<ARCHMAX_DATA_DIR>/projects/<projectId>/duckdb.db`. The on-disk file SHALL NOT be deleted by `disposeProjectInstance` — the next call to `getProjectInstance(projectId, connections)` for the same project MUST be able to re-open the same file with all previously persisted scoped VIEWs intact and re-attach every active connection (no stale `attachedSlugs` or `loadedExtensions` carried over).

#### Scenario: Dispose clears the cached instance and releases the file lock

- **WHEN** `disposeProjectInstance("p1")` is called after `getProjectInstance("p1", conns)` previously cached an instance
- **THEN** the `projectInstances` map no longer contains an entry for `"p1"`
- **AND** opening the same `<ARCHMAX_DATA_DIR>/projects/p1/duckdb.db` from a fresh `DuckDBInstance.create(path)` succeeds without an `IO Error: Could not set lock on file`
- **AND** the next call to `getProjectInstance("p1", conns)` returns a freshly constructed instance whose reference differs from the disposed one
- **AND** every connection in `conns` is re-attached on the new instance

#### Scenario: Dispose preserves persisted VIEWs

- **WHEN** `disposeProjectInstance("p1")` is called and the project's DuckDB file contains scoped VIEWs from a previous session
- **THEN** the file on disk is not deleted
- **AND** the next call to `getProjectInstance("p1", conns)` re-opens the same file
- **AND** the previously persisted scoped VIEWs are observable via `SHOW ALL VIEWS`

#### Scenario: Dispose is safe when no instance is cached

- **WHEN** `disposeProjectInstance("p2")` is called and no cached instance exists for `"p2"`
- **THEN** the call completes without error and the map remains unchanged

### Requirement: Connections Reinit Endpoint

The API SHALL expose `POST /api/projects/:projectId/connections/reinit` that disposes the project's cached DuckDB instance, rebuilds it by attaching every active connection, runs a schema probe, and returns the visible table count. The endpoint SHALL accept an optional `?reset=true` query parameter that, in addition to dispose-and-rebuild, deletes the on-disk `duckdb.db` file before reattaching — useful when the persistent file is corrupt or the operator wants a clean slate. When `reset` is omitted or `false`, the on-disk file SHALL be preserved and previously persisted scoped VIEWs remain observable until the next model-scoped call rematerialises them. The endpoint SHALL:

- Return `404` if the project does not exist.
- On success, respond with HTTP `200` and body `{ ok: true, tableCount: <number> }` where `tableCount` is the number of rows returned by `SHOW ALL TABLES` against the rebuilt instance.
- On any failure during dispose, file delete (if `reset=true`), re-attach, or probe, respond with HTTP `400` and body `{ ok: false, error: <string> }` where `error` is the underlying error message.
- Apply the standard query timeout via `withQueryTimeout` to the schema probe.

#### Scenario: Successful re-init returns table count

- **WHEN** a client sends `POST /api/projects/:projectId/connections/reinit` for a project with one active postgres connection exposing 12 tables
- **THEN** the server disposes the cached DuckDB instance, rebuilds it, re-attaches the connection, and runs `SHOW ALL TABLES`
- **AND** the response is HTTP `200` with body `{ ok: true, tableCount: 12 }`

#### Scenario: Upstream schema changes are picked up

- **WHEN** a table is added to the upstream database AFTER the project DuckDB instance was first created
- **AND** the client calls `POST /api/projects/:projectId/connections/reinit`
- **THEN** the response `tableCount` includes the newly added table
- **AND** subsequent data-browser requests for the same project see the new table

#### Scenario: Reinit with reset=true deletes the persistent file

- **WHEN** a client calls `POST /api/projects/:projectId/connections/reinit?reset=true` for a project whose `duckdb.db` contains previously materialised scoped VIEWs
- **THEN** the cached instance is disposed, the on-disk file is deleted, and a fresh instance is created
- **AND** previously persisted scoped VIEWs are gone after the call returns
- **AND** the next model-scoped call rematerialises them from `view_query`

#### Scenario: Reinit without reset preserves persisted VIEWs

- **WHEN** a client calls `POST /api/projects/:projectId/connections/reinit` (no `reset` query parameter)
- **THEN** the on-disk file is preserved
- **AND** previously persisted scoped VIEWs remain observable after the call returns

#### Scenario: Unreachable connection returns an error

- **WHEN** a client calls `POST /api/projects/:projectId/connections/reinit` and one of the active connections fails to attach (e.g. host unreachable)
- **THEN** the response is HTTP `400` with body `{ ok: false, error: <message> }`
- **AND** the cached instance MAY be left in a disposed state so the next successful attach rebuilds cleanly

#### Scenario: Unknown project returns 404

- **WHEN** a client calls `POST /api/projects/:projectId/connections/reinit` with a `projectId` that does not exist
- **THEN** the response is HTTP `404`
