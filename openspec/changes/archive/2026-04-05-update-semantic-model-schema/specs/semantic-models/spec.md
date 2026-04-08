## MODIFIED Requirements

### Requirement: Semantic Model YAML Schema
Each semantic model YAML file SHALL be a self-contained document. The top-level fields SHALL be: `name` (string, required), `description` (string), `aiContext` (object with optional `instructions`, `synonyms`, `examples`), `datasets` (array), `relationships` (array), and `metrics` (array). Datasets SHALL contain: `name`, `source`, `primaryKey`, `uniqueKeys`, `description`, `aiContext`, and `fields` (array). Fields SHALL contain: `name`, `expression` (string — a DuckDB SQL expression, typically the column name), optional `data_type` (string — DuckDB-specific data type such as `VARCHAR`, `INTEGER`, `TIMESTAMP`), optional `example_data` (array of 1–3 sample values as strings), optional `distinct_values` (array of all distinct states for enum/status columns), optional `label`, `description`, `aiContext`. Relationships SHALL contain: `name`, `from`, `to`, `fromColumns`, `toColumns`, optional `aiContext`. Metrics SHALL contain: `name`, `expression` (string — a DuckDB SQL expression), `description`, optional `aiContext`.

#### Scenario: Valid YAML with datasets and fields
- **WHEN** a YAML file contains a model with datasets that have inline field arrays
- **THEN** the parser returns a structured object with datasets containing nested field arrays
- **AND** each field's `expression` is a plain string (not a dialect array)

#### Scenario: Field with data type and examples
- **WHEN** a field specifies `data_type: "VARCHAR"` and `example_data: ["shipped", "pending"]`
- **THEN** the parser accepts the field with its type metadata and sample values

#### Scenario: Enum field with distinct values
- **WHEN** a field specifies `distinct_values: ["active", "inactive", "suspended"]`
- **THEN** the parser accepts the field and preserves the full list of possible states

#### Scenario: Valid YAML with relationships and metrics
- **WHEN** a YAML file contains relationships with column mappings and metrics with DuckDB expressions
- **THEN** all entities are parsed and validated correctly
- **AND** metric `expression` is a plain string (not a dialect array)

#### Scenario: Invalid YAML
- **WHEN** a YAML file fails Zod schema validation
- **THEN** a descriptive error is returned indicating which field(s) are invalid

#### Scenario: Legacy dialect-array expression rejected
- **WHEN** a YAML file contains a field with `expression: [{ dialect: "ANSI_SQL", expression: "col" }]`
- **THEN** Zod validation fails because `expression` must be a string

## ADDED Requirements

### Requirement: Semantic Model Assembly Prompt
The system SHALL include a markdown system prompt at `packages/core/prompts/semantic-model-assembly.md` that instructs AI agents on how to assemble semantic models. The prompt SHALL cover: the complete YAML schema with examples, a step-by-step assembly workflow (explore database schema, identify tables, map fields with data types and examples, detect enum/status columns and record their distinct values, define relationships, define metrics), DuckDB-specific instructions for schema discovery (`DESCRIBE`, `information_schema`), and heuristics for detecting low-cardinality enum columns.

#### Scenario: Agent reads prompt before model assembly
- **WHEN** an agent is tasked with creating a semantic model for a project
- **THEN** the agent's system prompt includes the contents of `semantic-model-assembly.md`
- **AND** the agent follows the documented workflow to explore the database and produce a valid YAML file

#### Scenario: Prompt instructs enum detection
- **WHEN** the prompt describes enum detection
- **THEN** it instructs the agent to identify low-cardinality string/integer columns, query their distinct values, and populate the `distinct_values` field

#### Scenario: Prompt instructs example data collection
- **WHEN** the prompt describes example data
- **THEN** it instructs the agent to sample 1–3 representative values per field and populate the `example_data` array
