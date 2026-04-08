# semantic-models Specification

## Purpose
File-based semantic layer models that map database tables as datasets with fields, relationships, and metrics. Stored as YAML files on disk (one root file per model, one file per dataset), validated by Zod schemas, and managed through `SemanticModelFileService`. All SQL expressions use DuckDB syntax.
## Requirements
### Requirement: Semantic Model YAML Structure

A semantic model SHALL be stored as a YAML root file at `<SEMLAYER_DATA_DIR>/<projectId>/src/<modelName>.yaml` containing: `name` (string, required), `description` (string), `ai_context` (string or object with optional `instructions`, `synonyms`, `examples`), `relationships` (array), `metrics` (array), and `custom_extensions` (optional array of `{ vendor_name, data }` objects). Datasets SHALL NOT be stored in the root file when a per-dataset directory exists.

#### Scenario: Root file contains model-level data

- **WHEN** a semantic model is written to disk
- **THEN** the root YAML file is stored at `<SEMLAYER_DATA_DIR>/<projectId>/src/<modelName>.yaml`
- **AND** the file contains name, description, ai_context, relationships, metrics, and custom_extensions
- **AND** datasets are stored as individual files in a `src/<modelName>/` subdirectory

#### Scenario: AI context as structured object

- **WHEN** a model is saved with `ai_context: { instructions: "Use for retail analytics", synonyms: ["sales model"] }`
- **THEN** the AI context is persisted in the YAML file as a structured object

### Requirement: Dataset Files

Each dataset SHALL be stored as a separate YAML file at `<SEMLAYER_DATA_DIR>/<projectId>/src/<modelName>/<datasetName>.yaml` containing: `name` (string, required), `source` (string, e.g. `<connection>.<schema>.<table>`), `primary_key` (string array), `unique_keys` (array of string arrays), `description`, `ai_context`, `fields` (array of inline field objects), and `custom_extensions` (optional array of `{ vendor_name, data }` objects).

#### Scenario: Dataset with composite primary key

- **WHEN** a dataset file is written with `primary_key: ["item_sk", "ticket_number"]`
- **THEN** the composite primary key is stored in the dataset YAML at `src/<modelName>/<datasetName>.yaml`

#### Scenario: Dataset source reference

- **WHEN** a dataset is saved with `source: "tpcds.public.store_sales"`
- **THEN** the fully-qualified `<connection>.<schema>.<table>` reference is stored under `src/`

#### Scenario: Dataset with custom extensions

- **WHEN** a dataset is saved with `custom_extensions: [{ vendor_name: COMMON, data: '{"graph_x": 100}' }]`
- **THEN** the custom extensions are stored alongside the other dataset properties in the YAML file under `src/`

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

### Requirement: SemanticModelFileService

The system SHALL provide a `SemanticModelFileService` class that manages all YAML file I/O for semantic models. Source files live under `<SEMLAYER_DATA_DIR>/<projectId>/src/`. It SHALL expose: `list(projectId)` — read all models in a project, `get(projectId, name)` — assemble a full model from root + dataset files, `getDataset(projectId, modelName, datasetName)` — read a single dataset file, `write(projectId, model)` — split and write root + dataset files with atomic writes (temp file + rename), `delete(projectId, name)` — remove root file and dataset directory, `exists(projectId, name)`. The service SHALL check for the `src/` subdirectory first and fall back to the legacy root-level layout for backward compatibility during migration.

#### Scenario: List models reads YAML files from src directory

- **WHEN** `list("proj1")` is called
- **THEN** all `.yaml` files in `<SEMLAYER_DATA_DIR>/proj1/src/` are read, parsed, and returned as assembled models

#### Scenario: Get assembles from split files

- **WHEN** `get("proj1", "sales")` is called and a `src/sales/` subdirectory exists
- **THEN** the root file `src/sales.yaml` is read for model-level data
- **AND** each `.yaml` in `src/sales/` is read as a dataset
- **AND** the full assembled model is returned

#### Scenario: Get falls back to single-file format

- **WHEN** `get("proj1", "legacy")` is called and no `src/legacy/` subdirectory exists
- **THEN** the root file `src/legacy.yaml` is parsed as a complete model including inline datasets

#### Scenario: Legacy layout fallback

- **WHEN** `list("proj1")` is called and `<SEMLAYER_DATA_DIR>/proj1/src/` does not exist
- **AND** YAML files exist directly under `<SEMLAYER_DATA_DIR>/proj1/`
- **THEN** the service reads from the legacy root-level location

#### Scenario: Write splits model into files under src

- **WHEN** `write("proj1", model)` is called
- **THEN** the root file is written to `src/` without datasets
- **AND** each dataset is written as a separate file in `src/<modelName>/`
- **AND** stale dataset files no longer in the model are deleted

#### Scenario: Delete removes root and dataset directory

- **WHEN** `delete("proj1", "sales")` is called
- **THEN** `src/sales.yaml` is deleted
- **AND** the `src/sales/` directory is recursively removed

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

### Requirement: AGENTS.md Auto-Generation

After every `write()` or `delete()` operation, the file service SHALL regenerate an `AGENTS.md` file in the project root directory (`<SEMLAYER_DATA_DIR>/<projectId>/AGENTS.md`) summarizing all semantic models, their datasets, and metrics for AI assistant discovery.

#### Scenario: AGENTS.md regenerated after write

- **WHEN** a semantic model is written
- **THEN** `<SEMLAYER_DATA_DIR>/<projectId>/AGENTS.md` is regenerated at the project root
- **AND** it lists all models with their datasets and metrics

### Requirement: Path Safety

All path segments (projectId, model name, dataset name) SHALL be validated against a safe character pattern (`/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/`) to prevent path traversal.

#### Scenario: Unsafe path segment is rejected

- **WHEN** a model name containing `../` is passed to any file service method
- **THEN** an error is thrown before any file system access occurs

### Requirement: Importance Ordering Convention

All ordered arrays within a semantic model — fields within a dataset, relationships in the root file, and metrics in the root file — SHALL be sorted by descending importance (most important items first). Root model YAML files SHALL include a comment block listing the dataset files in importance order, since datasets are stored as separate files and their filesystem order is undefined. This convention is a custom extension not part of the OSI spec and requires no schema changes.

#### Scenario: Fields sorted by importance within a dataset

- **WHEN** a dataset is written with fields
- **THEN** the fields array is ordered with the most analytically important fields first (e.g. primary key, core business attributes, key foreign keys) and less important fields last (e.g. audit timestamps, internal IDs, flags)

#### Scenario: Metrics sorted by importance in root file

- **WHEN** a model root file is written with metrics
- **THEN** the metrics array is ordered with the most commonly used metrics first (e.g. total revenue, order count) and niche metrics last

#### Scenario: Relationships sorted by importance in root file

- **WHEN** a model root file is written with relationships
- **THEN** the relationships array is ordered with the most frequently used joins first

#### Scenario: Dataset ordering comment in root file

- **WHEN** a model root file is written for a model with per-file datasets
- **THEN** the root file includes a YAML comment listing the dataset files in importance order
- **AND** the comment indicates which datasets are most central to the model

#### Scenario: Existing files without ordering remain valid

- **WHEN** a YAML file exists with unordered arrays
- **THEN** the file is still valid and parseable
- **AND** no schema validation error occurs

### Requirement: Custom Extensions on Datasets

Each dataset SHALL support an optional `custom_extensions` array. Each entry in the array contains `vendor_name` (string, required) and `data` (string, required — typically JSON). The Zod schema SHALL validate this structure and pass it through on read/write without interpreting the `data` content. The `SemanticModelFileService` SHALL preserve `custom_extensions` when reading and writing dataset files.

#### Scenario: Dataset with graph position extension

- **WHEN** a dataset file is written with `custom_extensions: [{ vendor_name: "archmax", data: '{"graph_x": 250, "graph_y": 100}' }]`
- **THEN** the custom extension is persisted in the dataset YAML file
- **AND** reading the file back returns the same custom_extensions array

#### Scenario: Dataset without custom extensions

- **WHEN** a dataset file has no `custom_extensions` key
- **THEN** the field defaults to an empty array on read
- **AND** writing a dataset with an empty array omits the key from YAML

#### Scenario: Multiple vendor extensions on one dataset

- **WHEN** a dataset has `custom_extensions` with entries from both `archmax` and `DBT`
- **THEN** both entries are preserved on read/write without interference

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

### Requirement: Validated Queries Custom Extension

Datasets and semantic models SHALL support an optional `validated_queries` array within the COMMON custom extension (`vendor_name: COMMON`). Each validated query is an object with `description` (string, required — a natural-language description of what the query answers) and `query` (string, required — a DuckDB SQL query that has been executed successfully against the data). Dataset-level validated queries SHALL reference only columns from that dataset. Model-level validated queries MAY reference columns across multiple datasets using joins declared in the model's relationships. The `SemanticModelFileService` SHALL preserve validated queries on read/write as part of the existing custom_extensions passthrough.

#### Scenario: Dataset with validated queries

- **WHEN** a dataset is saved with `custom_extensions: [{ vendor_name: COMMON, data: '{"validated_queries": [{"description": "Total revenue by month", "query": "SELECT DATE_TRUNC(\'month\', ordered_at) AS month, SUM(total_amount) AS revenue FROM shop_db.public.orders GROUP BY 1 ORDER BY 1"}]}' }]`
- **THEN** the validated queries are stored in the dataset YAML file within the COMMON extension
- **AND** reading the file back returns the same validated_queries array

#### Scenario: Semantic model with cross-dataset validated queries

- **WHEN** a model root file includes `custom_extensions: [{ vendor_name: COMMON, data: '{"validated_queries": [{"description": "Top 10 customers by total spend", "query": "SELECT c.email, SUM(o.total_amount) AS total_spend FROM shop_db.public.orders o JOIN shop_db.public.customers c ON o.customer_id = c.id GROUP BY 1 ORDER BY 2 DESC LIMIT 10"}]}' }]`
- **THEN** the validated queries are stored in the model root YAML file within the COMMON extension
- **AND** reading the file back returns the same validated_queries array

#### Scenario: Entity without validated queries

- **WHEN** a dataset or model has a COMMON extension without a `validated_queries` key
- **THEN** the entity is valid and no validated queries are assumed

#### Scenario: Validated queries coexist with other COMMON extension data

- **WHEN** a dataset has a COMMON extension containing both field-level metadata and validated_queries
- **THEN** all data within the COMMON extension JSON is preserved on read/write

### Requirement: Validated Queries in Digest Output

The `SemanticModelDigest.overview()` method SHALL include a "Validated Queries" section after metrics when the model has validated queries in its COMMON custom extension. Each query SHALL be rendered as a numbered list item with the description in bold followed by the SQL in a code span. The `SemanticModelDigest.dataset()` method SHALL include a "Validated Queries" section after the fields list when the dataset has validated queries in its COMMON custom extension, using the same format.

#### Scenario: Model overview digest includes validated queries

- **WHEN** `SemanticModelDigest.overview(model)` is called on a model with 2 validated queries in its COMMON extension
- **THEN** the output includes a `## Validated Queries` section
- **AND** each query is listed as `1. **description** — \`SQL\``

#### Scenario: Dataset digest includes validated queries

- **WHEN** `SemanticModelDigest.dataset(dataset)` is called on a dataset with 3 validated queries in its COMMON extension
- **THEN** the output includes a `## Validated Queries` section after the fields list
- **AND** each query is listed as `1. **description** — \`SQL\``

#### Scenario: Digest omits section when no validated queries exist

- **WHEN** `SemanticModelDigest.overview(model)` is called on a model without validated queries
- **THEN** no "Validated Queries" section appears in the output

### Requirement: Semantic Model Digest Service

The system SHALL provide a `SemanticModelDigest` class in `@semlayer/core` that compiles parsed `SemanticModel` and `Dataset` objects into compact markdown text optimized for LLM consumption. The digest is a read-only view — the YAML files remain the authoritative source of truth. The class SHALL expose two static methods:

- `overview(model)` — Returns a markdown string containing: model name and description, ai_context instructions as a blockquote, a dataset summary table (name, source, field count, description), relationship join paths (`from.column → to.column`), and a metrics table (name, expression, description).
- `dataset(dataset, page?)` — Returns a paginated markdown string (default page size: 25 fields) containing: dataset name, source, description, primary key, ai_context (synonyms as aliases, instructions as blockquote), and a field list where each field is a single compact line with: name, data type, description, example data, and optional segments for enum values, computed expressions, synonyms, and instructions.

#### Scenario: Overview of a model with datasets, relationships, and metrics
- **WHEN** `SemanticModelDigest.overview(model)` is called on a model with 15 datasets, 12 relationships, and 20 metrics
- **THEN** a markdown string is returned with a dataset summary table, relationship list, and metrics table
- **AND** the output is approximately 3x smaller in token count than the equivalent raw JSON

#### Scenario: Dataset digest includes all field metadata inline
- **WHEN** `SemanticModelDigest.dataset(dataset)` is called on a dataset with fields containing types, examples, enums, synonyms, and instructions
- **THEN** each field is rendered as a single compact line in the format: `- **name** \`TYPE\` {enums} — Description. Expr: \`...\`. Ex: \`val1\`, \`val2\` | _synonyms_ | Note: instructions`
- **AND** optional segments (enums, expression, synonyms, instructions) are omitted when the field has no such data

#### Scenario: Dataset digest pagination
- **WHEN** `SemanticModelDigest.dataset(dataset, 2)` is called on a dataset with 40 fields
- **THEN** fields 26–40 are returned
- **AND** the header indicates `page 2/2`
- **AND** no "next page" hint is shown

#### Scenario: Dataset digest with fewer fields than page size
- **WHEN** `SemanticModelDigest.dataset(dataset)` is called on a dataset with 10 fields
- **THEN** all 10 fields are returned on page 1/1
- **AND** no pagination hint is shown

#### Scenario: Passthrough field expressions are omitted
- **WHEN** a field has `expression: "id"` and `name: "id"` (expression equals field name)
- **THEN** the `Expr: ...` segment is omitted from the digest line to reduce noise

#### Scenario: COMMON extension data is inlined
- **WHEN** a field has `custom_extensions: [{ vendor_name: "COMMON", data: '{"data_type":"VARCHAR","example_data":["paid"],"distinct_values":["paid","pending"]}' }]`
- **THEN** the type shows as `VARCHAR`, examples show as `Ex: \`paid\``, and enums show as `{paid, pending}`
- **AND** the raw custom_extensions wrapper structure is not exposed in the output

### Requirement: Source Directory Layout Migration

The system SHALL provide a migration script at `apps/api/src/scripts/migrate-src-layout.ts` that moves semantic model files from the legacy root-level layout (`<projectId>/<model>.yaml`) to the new `src/` subdirectory (`<projectId>/src/<model>.yaml`). The migration SHALL preserve the `uploads/` directory if it exists. The migration SHALL run automatically on app startup for any project directory that lacks a `src/` subdirectory but contains YAML files at the root level.

#### Scenario: Migration moves files to src subdirectory

- **WHEN** the migration detects YAML files at `<SEMLAYER_DATA_DIR>/<projectId>/model.yaml`
- **AND** no `<SEMLAYER_DATA_DIR>/<projectId>/src/` directory exists
- **THEN** `model.yaml` is moved to `<SEMLAYER_DATA_DIR>/<projectId>/src/model.yaml`
- **AND** the `model/` dataset directory (if present) is moved to `<SEMLAYER_DATA_DIR>/<projectId>/src/model/`
- **AND** `AGENTS.md` remains at `<SEMLAYER_DATA_DIR>/<projectId>/AGENTS.md` (project root)

#### Scenario: Migration preserves uploads directory

- **WHEN** the migration runs on a project with an existing `uploads/` directory
- **THEN** the `uploads/` directory remains at `<SEMLAYER_DATA_DIR>/<projectId>/uploads/` (not moved)

#### Scenario: Migration is idempotent

- **WHEN** the migration runs on a project that already has a `src/` subdirectory
- **THEN** no files are moved and no errors occur

### Requirement: Build Assembly

The system SHALL provide a `PublishService` with an `assemble(projectId, targetDir?)` method that reads all source models from `src/`, inlines their datasets, and writes fully-assembled single-file YAMLs to the target directory. When `targetDir` is omitted, the default is `build/`. The target directory SHALL contain only assembled YAML files — no `AGENTS.md` (that lives at the project root). Stale files in the target for models that no longer exist in source SHALL be removed during assembly. The same assembly logic SHALL be used for both persistent publishing (to `build/`) and temporary on-the-fly assembly (to a temp directory for MCP testing).

#### Scenario: Assemble creates single-file YAMLs in build directory

- **WHEN** `assemble("proj1")` is called for a project with models `shopify` and `datev` in `src/`
- **THEN** `<SEMLAYER_DATA_DIR>/proj1/build/shopify.yaml` contains the fully assembled model with inline datasets
- **AND** `<SEMLAYER_DATA_DIR>/proj1/build/datev.yaml` contains the fully assembled model with inline datasets

#### Scenario: Assemble to a custom target directory

- **WHEN** `assemble("proj1", "/tmp/proj1-test-build")` is called
- **THEN** the assembled YAMLs are written to `/tmp/proj1-test-build/` instead of `build/`
- **AND** the same assembly and cleanup logic is used as for the default `build/` target

#### Scenario: Stale build files are removed

- **WHEN** `assemble("proj1")` is called and `build/old_model.yaml` exists but `src/old_model.yaml` does not
- **THEN** `build/old_model.yaml` is deleted

#### Scenario: Build directory is created if missing

- **WHEN** `assemble("proj1")` is called for the first time
- **THEN** the target directory is created if it does not exist

