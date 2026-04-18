## MODIFIED Requirements

### Requirement: DuckDB Federation

The system SHALL maintain a DuckDB instance per project that attaches all active connections as named schemas, enabling cross-connection SQL queries. The connection's `slug` field SHALL be used as the schema alias when attaching to DuckDB. The MSSQL extension SHALL be installed from the DuckDB community extension registry (`INSTALL mssql FROM community`). The MSSQL attach string SHALL use ADO.NET format (`Server=host,port;Database=db;User Id=user;Password=pass;Encrypt=yes|no`) when structured connection parameters are provided, or pass through the raw URI/connection string when `connectionConfig.uri` is set. For iceberg connections, the system SHALL use a two-step attach process: (1) create a DuckDB secret with `TYPE iceberg` containing the bearer token (or OAuth2 credentials in future), and (2) attach the catalog with `TYPE iceberg, ENDPOINT, SECRET` options. The `iceberg` and `httpfs` extensions SHALL be installed and loaded before attaching iceberg connections. The Docker image SHALL pre-install the `iceberg` and `httpfs` extensions alongside the existing pre-installed extensions. ATTACH operations SHALL be subject to a 30-second timeout; on timeout, the DuckDB connection is interrupted and the error is propagated. The connection test endpoint SHALL enforce a 15-second timeout on the `SELECT 1` verification query. Data browser queries SHALL be subject to the same `QUERY_TIMEOUT_MS` timeout as MCP queries, with cancellation via `connection.interrupt()`.

#### Scenario: Attach a postgres connection

- **WHEN** a postgres connection with `slug: "shopify_prod"` is activated within a project
- **THEN** the connection is attached to the project's DuckDB instance via the `postgres_scanner` extension using `shopify_prod` as the schema alias

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

#### Scenario: Attach an iceberg REST catalog with bearer token

- **WHEN** an iceberg connection with `slug: "lake"`, `endpoint: "https://catalog.example.com"`, `warehouse: "analytics"`, and `token: "eyJ..."` is activated within a project
- **THEN** the `iceberg` and `httpfs` extensions are installed and loaded
- **AND** a DuckDB secret named `lake_secret` is created with `TYPE iceberg, TOKEN '<decrypted_token>'`
- **AND** the catalog is attached using `ATTACH 'analytics' AS lake (TYPE iceberg, ENDPOINT 'https://catalog.example.com', SECRET 'lake_secret')`

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
- **AND** the DuckDB secret `lake_secret` is dropped

#### Scenario: Lazy initialization

- **WHEN** the first query is made against a project's DuckDB instance
- **THEN** the DuckDB instance is created and all active connections are attached
- **AND** subsequent queries reuse the existing instance

#### Scenario: Test iceberg connection

- **WHEN** the Test Connection action is invoked for an iceberg connection
- **THEN** a temporary DuckDB instance is created, the iceberg catalog is attached, and `SHOW ALL TABLES` is executed to verify connectivity
- **AND** the temporary instance is disposed after the test

#### Scenario: Query iceberg tables in federation

- **WHEN** an iceberg connection with slug `lake` and a postgres connection with slug `pg` are both attached to the same project
- **AND** a semantic model maps `shipments` to `lake.e2e_test.e2e_shipments` and `products` to `pg.public.e2e_products`
- **THEN** a cross-catalog join query `SELECT p.name, s.destination FROM "products" p JOIN "shipments" s ON p.name = s.product_name` returns matching rows
