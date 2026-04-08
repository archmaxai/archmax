## ADDED Requirements

### Requirement: Validated Query Generation

After writing datasets and model-level entities (relationships, metrics), the semantic model agent SHALL generate validated queries for both individual datasets and the model as a whole. The agent SHALL follow this process:

1. For each dataset, compose 2–5 SQL queries that demonstrate common access patterns: simple lookups, filtered aggregations, and usage of enum/time-dimension columns.
2. For the model root, compose 2–5 SQL queries that demonstrate cross-dataset joins using declared relationships and metric expressions.
3. Execute each query via `executeQuery` to confirm it returns results without error.
4. Store only queries that execute successfully as `validated_queries` entries within the COMMON custom extension on the respective dataset or model root file.
5. Each entry SHALL have a `description` (plain-language summary of what the query answers) and `query` (the exact DuckDB SQL that was executed).

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

#### Scenario: User opts out of query generation

- **WHEN** the user says "skip queries" or "don't generate queries"
- **THEN** the agent writes the model without validated_queries entries
