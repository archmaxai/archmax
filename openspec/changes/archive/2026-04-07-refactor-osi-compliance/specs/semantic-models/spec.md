## ADDED Requirements

### Requirement: OSI Expression Format

All `expression` properties (on fields and metrics) SHALL use the OSI `Expression` object format: an object with a `dialects` array containing one or more `{ dialect, expression }` entries. The project SHALL use `ANSI_SQL` as the dialect for all DuckDB expressions. The Zod schema SHALL validate that `dialects` is a non-empty array where each entry has a `dialect` string (one of `ANSI_SQL`, `SNOWFLAKE`, `MDX`, `TABLEAU`, `DATABRICKS`) and an `expression` string.

#### Scenario: Field with plain column expression

- **WHEN** a field is defined with expression `total_price`
- **THEN** the YAML stores `expression: { dialects: [{ dialect: ANSI_SQL, expression: "total_price" }] }`

#### Scenario: Field with computed expression

- **WHEN** a field is defined with expression `c_first_name || ' ' || c_last_name`
- **THEN** the YAML stores `expression: { dialects: [{ dialect: ANSI_SQL, expression: "c_first_name || ' ' || c_last_name" }] }`

#### Scenario: Metric expression

- **WHEN** a metric is defined with `SUM(orders.total_price)`
- **THEN** the YAML stores `expression: { dialects: [{ dialect: ANSI_SQL, expression: "SUM(orders.total_price)" }] }`

### Requirement: Custom Extensions on All Entities

All OSI entities (SemanticModel, Dataset, Field, Relationship, Metric) SHALL support an optional `custom_extensions` array. Each entry contains `vendor_name` (string, required — one of `COMMON`, `SNOWFLAKE`, `SALESFORCE`, `DBT`, `DATABRICKS`) and `data` (string, required — typically a JSON string). The Zod schema SHALL validate this structure and pass through `data` without interpreting it. The `SemanticModelFileService` SHALL preserve `custom_extensions` on read/write for all entities.

#### Scenario: Field with COMMON extension containing data_type and example_data

- **WHEN** a field is written with `custom_extensions: [{ vendor_name: COMMON, data: '{"data_type":"VARCHAR","example_data":["Active","Inactive"],"distinct_values":["Active","Inactive","Pending"]}' }]`
- **THEN** the extension is persisted in the dataset YAML file
- **AND** reading the file back returns the same custom_extensions array

#### Scenario: Entity without custom extensions

- **WHEN** an entity has no `custom_extensions` key
- **THEN** the field defaults to an empty array on read
- **AND** writing an entity with an empty array omits the key from YAML

#### Scenario: Multiple vendor extensions on one entity

- **WHEN** a field has `custom_extensions` with entries from both `COMMON` and `DBT`
- **THEN** both entries are preserved on read/write without interference

#### Scenario: Model-level custom extensions

- **WHEN** a semantic model root file includes `custom_extensions: [{ vendor_name: COMMON, data: '{"source_system":"airbyte"}' }]`
- **THEN** the extension is stored in the root YAML file and preserved on read/write

### Requirement: Dimension Support on Fields

Fields SHALL support an optional `dimension` property containing `is_time` (boolean). This indicates whether the field is a time-based dimension suitable for temporal filtering and aggregation. The Zod schema SHALL validate `dimension` as an optional object with a single boolean property `is_time`.

#### Scenario: Timestamp field marked as time dimension

- **WHEN** a field representing `created_at` has `dimension: { is_time: true }`
- **THEN** the dimension metadata is stored in the YAML and available for query planning

#### Scenario: Non-time field without dimension

- **WHEN** a field does not have a `dimension` property
- **THEN** no dimension metadata is stored and the field is not treated as a time dimension

### Requirement: OSI-Compliant Naming Convention

All YAML keys for semantic model entities SHALL use snake_case as defined by the OSI spec: `ai_context` (not `aiContext`), `primary_key` (not `primaryKey`), `unique_keys` (not `uniqueKeys`), `from_columns` (not `fromColumns`), `to_columns` (not `toColumns`). The Zod schemas SHALL use snake_case property names. The `SemanticModelFileService` SHALL read and write files using snake_case keys exclusively.

#### Scenario: Dataset file uses snake_case keys

- **WHEN** a dataset is written to YAML
- **THEN** the file contains `primary_key`, `unique_keys`, `ai_context` (not camelCase equivalents)

#### Scenario: Relationship uses snake_case column keys

- **WHEN** a relationship is written with from/to columns
- **THEN** the YAML contains `from_columns` and `to_columns`

#### Scenario: AI context uses snake_case key

- **WHEN** any entity (model, dataset, field, relationship, metric) has AI context
- **THEN** the YAML key is `ai_context`, not `aiContext`

### Requirement: AI Context String or Object

The `ai_context` property on all entities SHALL accept either a plain string or a structured object with optional `instructions` (string), `synonyms` (string array), and `examples` (string array). This matches the OSI `AIContext` oneOf definition. The Zod schema SHALL use a union type.

#### Scenario: AI context as string shorthand

- **WHEN** a field is saved with `ai_context: "Use this column for revenue calculations"`
- **THEN** the string is persisted and returned as-is on read

#### Scenario: AI context as structured object

- **WHEN** a field is saved with `ai_context: { instructions: "Join via customer_id", synonyms: ["buyer"] }`
- **THEN** the structured object is persisted and returned on read

### Requirement: YAML Data Migration Script

The system SHALL provide a one-time migration script at `apps/api/src/scripts/migrate-osi.ts` that converts all existing YAML files from the current format to OSI-compliant format. The script SHALL: rename camelCase keys to snake_case, wrap plain-string expressions in the OSI Expression object, move `data_type`/`example_data`/`distinct_values` from top-level field properties into `custom_extensions` with `vendor_name: COMMON`, add `dimension: { is_time: true }` to fields whose `data_type` contains `TIMESTAMP` or `DATE`, and create `.yaml.bak` backups before overwriting.

#### Scenario: Migration of a dataset file

- **WHEN** the migration script processes a dataset file with camelCase keys and plain-string expressions
- **THEN** the output file uses snake_case keys, Expression objects, and `custom_extensions`
- **AND** a `.yaml.bak` backup of the original exists

#### Scenario: Migration idempotency

- **WHEN** the migration script is run on an already-migrated file
- **THEN** no changes are made and no errors occur

## MODIFIED Requirements

### Requirement: Semantic Model YAML Structure

A semantic model SHALL be stored as a YAML root file at `<SEMLAYER_DATA_DIR>/<projectId>/<modelName>.yaml` containing: `name` (string, required), `description` (string), `ai_context` (string or object with optional `instructions`, `synonyms`, `examples`), `relationships` (array), `metrics` (array), and `custom_extensions` (optional array of `{ vendor_name, data }` objects). Datasets SHALL NOT be stored in the root file when a per-dataset directory exists.

#### Scenario: Root file contains model-level data

- **WHEN** a semantic model is written to disk
- **THEN** the root YAML file contains name, description, ai_context, relationships, metrics, and custom_extensions
- **AND** datasets are stored as individual files in a `<modelName>/` subdirectory

#### Scenario: AI context as structured object

- **WHEN** a model is saved with `ai_context: { instructions: "Use for retail analytics", synonyms: ["sales model"] }`
- **THEN** the AI context is persisted in the YAML file as a structured object

### Requirement: Dataset Files

Each dataset SHALL be stored as a separate YAML file at `<SEMLAYER_DATA_DIR>/<projectId>/<modelName>/<datasetName>.yaml` containing: `name` (string, required), `source` (string, e.g. `<connection>.<schema>.<table>`), `primary_key` (string array), `unique_keys` (array of string arrays), `description`, `ai_context`, `fields` (array of inline field objects), and `custom_extensions` (optional array of `{ vendor_name, data }` objects).

#### Scenario: Dataset with composite primary key

- **WHEN** a dataset file is written with `primary_key: ["item_sk", "ticket_number"]`
- **THEN** the composite primary key is stored in the dataset YAML

#### Scenario: Dataset source reference

- **WHEN** a dataset is saved with `source: "tpcds.public.store_sales"`
- **THEN** the fully-qualified `<connection>.<schema>.<table>` reference is stored

#### Scenario: Dataset with custom extensions

- **WHEN** a dataset is saved with `custom_extensions: [{ vendor_name: COMMON, data: '{"graph_x": 100}' }]`
- **THEN** the custom extensions are stored alongside the other dataset properties in the YAML file

### Requirement: Field Schema

A field SHALL be an inline object within a dataset, containing: `name` (string, required), `expression` (OSI Expression object with `dialects` array, required), `dimension` (optional object with `is_time` boolean), `label`, `description`, `ai_context` (string or object), and `custom_extensions` (optional array of `{ vendor_name, data }` objects). Project-specific field metadata (`data_type`, `example_data`, `distinct_values`) SHALL be stored inside a `custom_extensions` entry with `vendor_name: COMMON`.

#### Scenario: Simple column field

- **WHEN** a field is defined for column `ss_sold_date_sk`
- **THEN** the expression is stored as `expression: { dialects: [{ dialect: ANSI_SQL, expression: "ss_sold_date_sk" }] }`

#### Scenario: Computed field expression

- **WHEN** a field is defined with DuckDB expression `c_first_name || ' ' || c_last_name`
- **THEN** the expression is stored as `expression: { dialects: [{ dialect: ANSI_SQL, expression: "c_first_name || ' ' || c_last_name" }] }`

#### Scenario: Field with type and sample data in extension

- **WHEN** a field has data_type `VARCHAR`, example_data `["Active", "Inactive"]`, and distinct_values `["Active", "Inactive", "Pending"]`
- **THEN** these are stored as `custom_extensions: [{ vendor_name: COMMON, data: '{"data_type":"VARCHAR","example_data":["Active","Inactive"],"distinct_values":["Active","Inactive","Pending"]}' }]`

#### Scenario: Time dimension field

- **WHEN** a timestamp field `created_at` is defined
- **THEN** it includes `dimension: { is_time: true }` to signal it as a temporal filter dimension

### Requirement: Relationship Schema

A relationship SHALL be stored in the model root file, containing: `name` (string, required), `from` (dataset name on the many-side), `to` (dataset name on the one-side), `from_columns` (string array, min 1), `to_columns` (string array, min 1), `ai_context` (string or object), and `custom_extensions` (optional array of `{ vendor_name, data }` objects).

#### Scenario: Define a foreign-key relationship

- **WHEN** a relationship is saved with `from: "store_sales"`, `to: "customer"`, `from_columns: ["ss_customer_sk"]`, `to_columns: ["c_customer_sk"]`
- **THEN** the join path between the two datasets is recorded in the root file

#### Scenario: Composite foreign key

- **WHEN** a relationship uses multiple columns in `from_columns` and `to_columns`
- **THEN** all column pairs are stored for the join condition

### Requirement: Metric Schema

A metric SHALL be stored in the model root file, containing: `name` (string, required), `expression` (OSI Expression object with `dialects` array, required), `description`, `ai_context` (string or object), and `custom_extensions` (optional array of `{ vendor_name, data }` objects).

#### Scenario: Aggregate metric

- **WHEN** a metric is saved with expression `SUM(store_sales.ss_ext_sales_price)`
- **THEN** the expression is stored as `expression: { dialects: [{ dialect: ANSI_SQL, expression: "SUM(store_sales.ss_ext_sales_price)" }] }` in the root file

#### Scenario: Ratio metric

- **WHEN** a metric is saved with expression `SUM(ss_ext_sales_price) / NULLIF(SUM(s_number_employees), 0)`
- **THEN** the OSI Expression object is stored with the full DuckDB expression string

### Requirement: Zod Schema Validation

All YAML files SHALL be validated against Zod schemas on read. Invalid files SHALL be skipped during `list()` operations. The schemas SHALL enforce required fields (`name`, `expression` object for fields, `source` for datasets), validate `custom_extensions` structure, validate `dimension` structure, accept `ai_context` as string or object, use snake_case property names throughout, and apply sensible defaults (empty arrays for optional collections).

#### Scenario: Invalid YAML file is skipped

- **WHEN** a malformed YAML file exists in a project directory
- **THEN** `list()` skips it without throwing
- **AND** other valid models are still returned

#### Scenario: Schema enforces required fields

- **WHEN** a YAML file is parsed that lacks a `name` field
- **THEN** Zod validation fails and the file is treated as invalid

#### Scenario: Schema validates Expression object

- **WHEN** a field has `expression: "plain_string"` (not an Expression object)
- **THEN** Zod validation fails because `expression` must be an object with a `dialects` array
