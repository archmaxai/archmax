## ADDED Requirements

### Requirement: Field Expression Validation and Naming

The semantic model agent SHALL validate every field expression against the physical source table before writing the dataset YAML file. For each field, the agent SHALL execute `SELECT <expression> FROM <source> LIMIT 0` via the `executeQuery` tool. If the expression fails, the agent SHALL attempt to fix it (e.g., adjust quoting or correct the column name) and retry once before discarding the field with a warning to the user.

The agent's system prompt SHALL explain the relationship between a field's `name` and its `expression`: the downstream VIEW layer creates `SELECT <expression> AS "<name>" FROM <source>`, so the `name` is the logical identity agents query by, and the `expression` is the physical SQL that resolves against the source table. The agent MAY use a logical `name` that differs from the physical column (renaming is the purpose of a semantic layer). When it does, the `expression` provides the mapping to the physical column.

The system prompt SHALL clarify that `from_columns` and `to_columns` in relationships MUST reference logical field `name` values from the respective datasets, not physical column names. Metric expressions MUST use `dataset_name.field_name` where `field_name` is the logical `name` from the field definition. The prompt SHALL note that metric expressions are shown verbatim to MCP consumer agents and therefore MUST NOT contain physical column names or source table paths.

#### Scenario: Agent validates field expressions before writing YAML
- **WHEN** the agent is building a dataset for table `hrworks.public.stammdaten` with a column `personid`
- **AND** the agent defines a field with `name: "person_id"` and `expression: "personid"`
- **THEN** the agent executes `SELECT personid FROM hrworks.public.stammdaten LIMIT 0` to validate the expression resolves
- **AND** the validation succeeds
- **AND** the field is written to the dataset YAML

#### Scenario: Agent fixes a failing field expression
- **WHEN** the agent defines a field with an expression that fails validation (e.g., column name typo)
- **THEN** the agent attempts to correct the expression based on the DuckDB error message
- **AND** retries validation once
- **AND** if the retry succeeds, the corrected field is written to YAML

#### Scenario: Agent discards unresolvable field with warning
- **WHEN** a field expression fails validation and the retry also fails
- **THEN** the agent does not include the field in the dataset YAML
- **AND** the agent informs the user that the field was skipped and why

#### Scenario: Agent uses logical field names in relationship columns
- **WHEN** the agent defines a relationship between `sick_leaves` and `stammdaten`
- **AND** `stammdaten` has a field with `name: "person_id"` (logical) mapped to physical column `personid`
- **THEN** the relationship uses `to_columns: ["person_id"]` (the logical name), not `to_columns: ["personid"]`

#### Scenario: Agent uses logical field names in metric expressions
- **WHEN** the agent defines a metric `total_revenue` that sums a field
- **AND** the `orders` dataset has a field with `name: "revenue"` (logical) mapped to physical column `total_amt`
- **THEN** the metric expression is `SUM(orders.revenue)`, not `SUM(orders.total_amt)`

## MODIFIED Requirements

### Requirement: Validated Query Generation

After writing datasets and model-level entities (relationships, metrics), the semantic model agent SHALL generate validated queries for both individual datasets and the model as a whole. All validated queries MUST use the DuckDB SQL dialect exclusively — PostgreSQL, MySQL, SQL Server, and any other dialect-specific syntax SHALL NOT be used, even when the underlying source database uses one of those engines. All validated queries MUST reference datasets by their logical dataset name (e.g. `FROM orders`), NOT by their fully-qualified source table path (e.g. `FROM shop_db.public.orders`), because downstream consumers query through scoped views that resolve dataset names automatically. Column references MUST use the logical field names defined in the semantic model (e.g., `person_id`), NOT physical column names from the source database (e.g., `personid`). The agent SHALL follow this process:

1. For each dataset, compose 2–5 DuckDB SQL queries that demonstrate common access patterns: simple lookups, filtered aggregations, and usage of enum/time-dimension columns.
2. For the model root, compose 2–5 DuckDB SQL queries that demonstrate cross-dataset joins using declared relationships and metric expressions.
3. Execute each query via `executeQuery` (using fully-qualified source paths and physical column names for validation) to confirm it returns results without error.
4. Rewrite each successful query to replace source table paths with dataset names AND physical column names with logical field names before storing.
5. Store only rewritten, successful queries as `validated_queries` entries within the COMMON custom extension on the respective dataset or model root file.
6. Each entry SHALL have a `description` (plain-language summary of what the query answers) and `query` (the DuckDB SQL rewritten to use dataset names and logical field names). The `query` value MUST contain only DuckDB-compatible SQL syntax and MUST NOT contain catalog or schema prefixes or physical column names.

The agent SHALL skip query generation if the user explicitly opts out or if no connections are active for the project.

#### Scenario: Agent generates dataset-level validated queries

- **WHEN** the agent finishes writing a dataset with fields including a time dimension and an enum column
- **THEN** the agent composes queries such as a count by enum value and a time-series aggregation
- **AND** each query is executed via `executeQuery` to verify it succeeds
- **AND** successful queries are written into the dataset's COMMON custom extension under `validated_queries`

#### Scenario: Agent generates model-level validated queries

- **WHEN** the agent finishes writing relationships and metrics for a model
- **THEN** the agent composes queries that join multiple datasets and use metric expressions
- **AND** each query is executed via `executeQuery` to verify it succeeds
- **AND** successful queries are written into the model root file's COMMON custom extension under `validated_queries`

#### Scenario: Query execution fails

- **WHEN** a proposed validated query fails execution (syntax error, missing table, etc.)
- **THEN** the agent does NOT include the failing query in validated_queries
- **AND** the agent may attempt to fix and re-run the query once before discarding it

#### Scenario: Validated queries use DuckDB SQL dialect only

- **WHEN** the agent generates validated queries for a dataset or model connected to a PostgreSQL, MySQL, or other non-DuckDB source
- **THEN** all queries use DuckDB SQL syntax exclusively (e.g. `strftime` instead of `TO_CHAR`, `UNNEST(from_json(...))` instead of `json_array_elements`)
- **AND** no PostgreSQL-only, MySQL-only, or other dialect-specific functions or syntax appear in the stored `query` values

#### Scenario: Validated queries use dataset names not source table paths

- **WHEN** the agent stores a validated query for a dataset with source `shop_db.public.orders` and name `orders`
- **THEN** the stored `query` value references `FROM orders`, NOT `FROM shop_db.public.orders`
- **AND** column references use the semantic model field names, not raw source column names
- **AND** no catalog or schema prefixes appear in the stored query

#### Scenario: Validated queries use logical field names not physical column names

- **WHEN** the agent stores a validated query for a dataset where field `person_id` maps to physical column `personid`
- **THEN** the stored `query` value uses `person_id` (the logical name), NOT `personid` (the physical column)
- **AND** the agent rewrites column names from physical to logical when converting from validation SQL to stored SQL

#### Scenario: User opts out of query generation

- **WHEN** the user says "skip queries" or "don't generate queries"
- **THEN** the agent writes the model without validated_queries entries
