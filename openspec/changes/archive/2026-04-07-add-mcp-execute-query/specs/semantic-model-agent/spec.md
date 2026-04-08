## MODIFIED Requirements

### Requirement: executeQuery Tool

The deep agent SHALL have access to a custom `executeQuery` tool that runs read-only SQL queries against the project's DuckDB instance (which has all project connections attached as named schemas). The tool accepts a SQL template with positional placeholders (`$1`, `$2`, ...) and a separate `params` array of values.

The tool MUST always validate that the query is read-only (only SELECT, WITH, EXPLAIN, DESCRIBE, SHOW, PRAGMA are allowed, and multi-statement queries are rejected).

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

#### Scenario: System prompt states read-only constraint

- **WHEN** the agent is initialized
- **THEN** the system prompt includes an explicit statement that only read-only queries are allowed
- **AND** the dynamic connection context includes a read-only notice
