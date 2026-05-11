## MODIFIED Requirements

### Requirement: executeQuery Tool

The deep agent SHALL have access to a custom `executeQuery` tool that runs read-only SQL queries against the project's DuckDB instance (which has all project connections attached as named schemas). The tool accepts a SQL template with positional placeholders (`$1`, `$2`, ...) and a separate `params` array of values.

The tool MUST validate every query through two layers before execution. First, the existing lexical read-only check (`validateReadOnlySQL`) SHALL reject anything that is not a `SELECT`, `WITH`, `EXPLAIN`, or `DESCRIBE` statement and reject multi-statement queries. Second, the structural SQL AST validator (defined in the `mcp-server` capability under "Structural SQL AST Validation") SHALL parse the query with DuckDB's own parser and reject any AST that does not match the allowlisted read-only shape, including disallowed table functions (`read_csv*`, `read_parquet*`, `read_json*`, `read_blob*`, `duckdb_*`, `parse_sql`, `json_serialize_sql`) and scalar function denylist matches. The structural validator SHALL be invoked with an empty `catalogSlugs` list because the semantic-model-agent path legitimately uses fully-qualified `catalog.schema.table` references; the catalog-reference rule from the MCP path therefore does NOT apply here, but every other structural rule (single statement, statement-type allowlist, system-catalog denylist, table-function allowlist, function-call denylist) SHALL apply identically.

The agent's system prompt SHALL explicitly state the read-only constraint, instructing the agent that INSERT, UPDATE, DELETE, CREATE, DROP, and ALTER statements are forbidden and will be rejected. The dynamic connection context appended to the system prompt SHALL include a read-only notice.

#### Scenario: Agent explores database schema
- **WHEN** the agent invokes `executeQuery` with `{ "sql": "SELECT table_name FROM information_schema.tables WHERE table_schema = $1", "params": ["public"] }`
- **THEN** DuckDB executes the parameterized query against the attached connections
- **AND** the result rows and column metadata are returned to the agent as JSON

#### Scenario: Query without parameters
- **WHEN** the agent invokes `executeQuery` with `{ "sql": "SELECT table_name FROM information_schema.tables", "params": [] }`
- **THEN** DuckDB executes the query without parameter binding
- **AND** results are returned normally

#### Scenario: Query timeout
- **WHEN** a query exceeds the 30-second timeout
- **THEN** the query is cancelled
- **AND** an error message is returned to the agent

#### Scenario: Non-SELECT query rejected
- **WHEN** the agent attempts a DDL or DML statement
- **THEN** the tool rejects the query with an error
- **AND** no database modification occurs

#### Scenario: Quoting-evasion attempt rejected by structural validator
- **WHEN** the agent submits a query that bypasses the lexical read-only regex via quoted identifiers, dollar-quoted strings, or mid-token comments (e.g., `EXPLAIN /*c*/ ANALYZE SELECT * FROM Shopify.public.orders`)
- **THEN** the structural validator parses the query, observes an EXPLAIN node with `analyzed === true`, and rejects it
- **AND** no execution is attempted

#### Scenario: External-file-reader table function rejected
- **WHEN** the agent submits `SELECT * FROM read_parquet('/etc/passwd.parquet')`
- **THEN** the structural validator observes a TABLE_FUNCTION_REF whose `function_name` is on the denylist and rejects the query
- **AND** the rejection occurs before DuckDB is contacted with the federated instance

#### Scenario: Catalog references remain allowed in agent path
- **WHEN** the agent submits `SELECT * FROM Shopify.public.orders LIMIT 10` (a fully-qualified reference to an attached catalog)
- **THEN** the structural validator accepts the query because the agent path passes an empty `catalogSlugs` list
- **AND** the query executes against the attached catalog
- **AND** this divergence from the MCP `execute_query` path is documented in code comments at the call site

#### Scenario: System prompt states read-only constraint
- **WHEN** the agent is initialized
- **THEN** the system prompt includes an explicit statement that only read-only queries are allowed
- **AND** the dynamic connection context includes a read-only notice
