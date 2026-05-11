## MODIFIED Requirements

### Requirement: executeQuery Tool

The deep agent SHALL retain a custom `executeQuery` tool that runs read-only SQL queries against the project's DuckDB instance with all project connections attached as named catalogs. This tool is the agent's **schema-exploration** surface: it is used to inspect `information_schema`, sample raw source tables, validate join cardinalities, and probe candidate column names. Queries SHALL use fully qualified `catalog.schema.table` references. The tool accepts a SQL template with positional placeholders (`$1`, `$2`, ...) and a separate `params` array of values. The tool MUST NOT accept a `modelName` parameter; that surface is split off into the new `runModelQuery` tool (see "runModelQuery Tool" requirement). Setting `search_path` against scoped views is therefore not the responsibility of `executeQuery`.

The tool MUST always validate that the query is read-only (only SELECT, WITH, EXPLAIN, DESCRIBE, SHOW, PRAGMA are allowed, and multi-statement queries are rejected).

The agent's system prompt SHALL explicitly state the read-only constraint, instructing the agent that INSERT, UPDATE, DELETE, CREATE, DROP, and ALTER statements are forbidden and will be rejected. The dynamic connection context appended to the system prompt SHALL include a read-only notice and SHALL describe `executeQuery` as the tool for catalog-level exploration only.

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
- **AND** the prompt describes `executeQuery` as the tool for catalog-level schema exploration (not for testing scoped views)

## ADDED Requirements

### Requirement: runModelQuery Tool

The deep agent SHALL have a second SQL tool, `runModelQuery({ modelName, sql, params })`, that runs read-only SQL queries against the model's scoped views — the same surface an MCP token holder sees. This is the agent's **view-testing** surface: it is the canonical way for the agent to confirm that a `view_query` it just authored produces the expected rows. `modelName` is required and selects which model's scoped views are visible. `sql` references datasets by bare name (e.g. `SELECT * FROM "orders" LIMIT 5`). `params` follows the same `$1, $2, …` convention as `executeQuery`.

On every invocation, the platform SHALL: (1) load the named model from disk via `SemanticModelFileService`; (2) for every dataset in the model with a non-empty `view_query`, issue `CREATE OR REPLACE VIEW _scope_<modelName>."<datasetName>" AS <view_query>` against the project's DuckDB instance — no in-memory hash cache; (3) set the connection `search_path` to the model's scoped schema so bare dataset names resolve; (4) run the agent's SQL with the same read-only validator + structural validator that gates MCP `execute_query`. Steps 1–3 are shared code with the MCP `execute_query` path (extracted into a `materialiseModelViews(projectId, model)` helper); a single behavioural change in materialisation MUST affect both surfaces.

The tool description SHALL teach the agent that this is how it tests views, that the SQL must use bare dataset names, and that filtering / projection are the responsibility of `view_query` (not of the test query). Errors from the materialisation step SHALL be surfaced verbatim to the tool result, with one normalisation: any DuckDB error message that includes a `_scope_<modelName>` qualifier SHALL have that qualifier stripped before being returned, so the agent's error trace mentions only the bare dataset name. The agent SHALL NOT see the string `_scope_` in any tool result.

#### Scenario: Agent tests an authored view

- **WHEN** the agent invokes `runModelQuery` with `{ "modelName": "ecommerce", "sql": "SELECT * FROM \"orders\" LIMIT 5", "params": [] }` after writing a `view_query` for the `orders` dataset
- **THEN** the platform issues `CREATE OR REPLACE VIEW` for every dataset in `ecommerce` from the latest YAML
- **AND** the `search_path` is set to `_scope_ecommerce` (internally — not visible to the agent)
- **AND** the bare `"orders"` reference resolves to the freshly materialised VIEW
- **AND** the first 5 rows of the view are returned to the agent

#### Scenario: Agent's runModelQuery surfaces view_query authoring errors with normalised messages

- **WHEN** the agent's `view_query` for a dataset references a column that does not exist in the source table, and the agent invokes `runModelQuery`
- **THEN** the materialisation step fails for that dataset
- **AND** the tool returns a JSON error to the agent containing the offending dataset name and the DuckDB error message
- **AND** any `_scope_<modelName>.` qualifier in the underlying DuckDB error is stripped from the message returned to the agent
- **AND** the agent can iterate on the `view_query` and re-run `runModelQuery` to verify the fix

#### Scenario: runModelQuery validates SQL with the same gates as MCP execute_query

- **WHEN** the agent submits a SQL query through `runModelQuery` that references an attached catalog directly (e.g. `SELECT * FROM shop.public.orders`) or that references `_scope_*` (e.g. `SELECT * FROM "_scope_ecommerce"."orders"`)
- **THEN** the same lexical + structural validator stack used by MCP `execute_query` rejects the query
- **AND** the agent receives a clear error instructing it to use bare dataset names

#### Scenario: runModelQuery rejects models without view_query

- **WHEN** the agent invokes `runModelQuery` with a `modelName` whose datasets have no `view_query` set
- **THEN** the tool returns an error naming the offending datasets and instructing the agent to author a `view_query` in the COMMON custom extension before testing

#### Scenario: runModelQuery shares materialisation code with MCP execute_query

- **WHEN** the implementation of view materialisation changes (e.g., a new validator pass is added)
- **THEN** the change applies to both `runModelQuery` and MCP `execute_query` simultaneously because both call the same `materialiseModelViews(projectId, model)` helper
- **AND** there is no fork between the agent and MCP code paths

### Requirement: Agent Surfaces Hide Scoped Schema Name

The platform SHALL NOT surface the `_scope_<modelName>` schema name to the agent in any user-facing channel: tool descriptions, system prompt sections, tool result error messages, or model digest output. The agent's mental model is "every dataset in a model is a queryable bare name; `view_query` is what defines its body". Implementation details — that bare names resolve via DuckDB `search_path` against an internal `_scope_<modelName>` schema — are platform-private. This is enforced by:

- Tool descriptions for `executeQuery` and `runModelQuery` MUST NOT mention `_scope_*` schemas.
- The semantic-model-agent system prompt MUST NOT mention `_scope_*` schemas.
- Tool result errors from `runModelQuery` MUST have any `_scope_<modelName>.` qualifier stripped before being returned to the agent (see "runModelQuery Tool" requirement).
- The agent's `executeQuery` tool MUST reject queries that reference `_scope_*` schemas with the same wording the MCP `execute_query` tool uses, instructing the caller to use bare dataset names.

The security boundary that prevents an agent (or an MCP token holder) from reading a different model's views by typing `_scope_<other_model>` directly is enforced by the structural SQL validator (see `mcp-server` capability, "MCP Query SQL Validation" requirement). This requirement is the **ergonomic** complement: even if the agent tries it, the error message it sees does not teach it that the schema exists.

#### Scenario: Tool descriptions never mention _scope_

- **WHEN** the agent's tool list is enumerated (via the LangChain tool registry)
- **THEN** the descriptions for `executeQuery` and `runModelQuery` contain no occurrence of the string `_scope_`

#### Scenario: System prompt never mentions _scope_

- **WHEN** the system prompt is rendered for an agent session
- **THEN** the prompt body, including the dynamic connection context, contains no occurrence of the string `_scope_`

#### Scenario: Error messages strip _scope_ qualifiers

- **WHEN** `runModelQuery` materialisation fails with a DuckDB error like `Catalog Error: Table with name "orders" does not exist! Did you mean "_scope_ecommerce.orders"?`
- **THEN** the error returned to the agent is rewritten to drop the `_scope_<modelName>.` qualifier (e.g. `Catalog Error: Table with name "orders" does not exist!`)
- **AND** the agent never sees the string `_scope_` in any tool result
