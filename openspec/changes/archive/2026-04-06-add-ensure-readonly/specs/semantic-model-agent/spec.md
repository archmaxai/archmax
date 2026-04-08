## MODIFIED Requirements
### Requirement: executeQuery Tool

The deep agent SHALL have access to a custom `executeQuery` tool that runs SQL queries against the project's DuckDB instance (which has all project connections attached as named schemas). The tool accepts a SQL template with positional placeholders (`$1`, `$2`, ...) and a separate `params` array of values.

When the owning project has `ensureReadonly: true`, the tool MUST validate that the query is read-only (only SELECT, WITH, EXPLAIN, DESCRIBE, SHOW, PRAGMA are allowed, and multi-statement queries are rejected). When `ensureReadonly: false`, application-level SQL validation is skipped and any valid SQL statement is accepted.

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

#### Scenario: Non-SELECT query rejected (readonly project)

- **WHEN** the agent attempts a DDL or DML statement in a project with `ensureReadonly: true`
- **THEN** the tool rejects the query with an error
- **AND** no database modification occurs

#### Scenario: Write query allowed (writable project)

- **WHEN** the agent attempts an INSERT, UPDATE, or CREATE statement in a project with `ensureReadonly: false`
- **THEN** the tool executes the query against DuckDB
- **AND** the result or affected row count is returned to the agent
