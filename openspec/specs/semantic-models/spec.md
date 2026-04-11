# semantic-models Specification

## Purpose
File-based semantic layer models that map database tables as datasets with fields, relationships, and metrics. Stored as YAML files on disk (one root file per model, one file per dataset), validated by Zod schemas, and managed through `SemanticModelFileService`. All SQL expressions use DuckDB syntax.
## Requirements
### Requirement: Semantic Model YAML Structure

A semantic model SHALL be stored as a YAML root file at `<ARCHMAX_DATA_DIR>/projects/<projectId>/src/<modelName>.yaml` containing: `name` (string, required), `description` (string), `ai_context` (string or object with optional `instructions`, `synonyms`, `examples`), `relationships` (array), `metrics` (array), and `custom_extensions` (optional array of `{ vendor_name, data }` objects). Datasets SHALL NOT be stored in the root file when a per-dataset directory exists.

#### Scenario: Root file contains model-level data

- **WHEN** a semantic model is written to disk
- **THEN** the root YAML file is stored at `<ARCHMAX_DATA_DIR>/projects/<projectId>/src/<modelName>.yaml`
- **AND** the file contains name, description, ai_context, relationships, metrics, and custom_extensions
- **AND** datasets are stored as individual files in a `src/<modelName>/` subdirectory

#### Scenario: AI context as structured object

- **WHEN** a model is saved with `ai_context: { instructions: "Use for retail analytics", synonyms: ["sales model"] }`
- **THEN** the AI context is persisted in the YAML file as a structured object

### Requirement: Dataset Files

Each dataset SHALL be stored as a separate YAML file at `<ARCHMAX_DATA_DIR>/projects/<projectId>/src/<modelName>/<datasetName>.yaml` containing: `name` (string, required), `source` (string, e.g. `<connection>.<schema>.<table>`), `primary_key` (string array), `unique_keys` (array of string arrays), `description`, `ai_context`, `fields` (array of inline field objects), and `custom_extensions` (optional array of `{ vendor_name, data }` objects).

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

The system SHALL provide a `SemanticModelFileService` class that manages all YAML file I/O for semantic models. Source files live under `<ARCHMAX_DATA_DIR>/projects/<projectId>/src/`. It SHALL expose: `list(projectId)` — read all models in a project, `get(projectId, name)` — assemble a full model from root + dataset files, `getDataset(projectId, modelName, datasetName)` — read a single dataset file, `write(projectId, model)` — split and write root + dataset files with atomic writes (temp file + rename), `delete(projectId, name)` — remove root file and dataset directory, `exists(projectId, name)`. The service SHALL check for the `src/` subdirectory first and fall back to the legacy root-level layout for backward compatibility during migration.

#### Scenario: List models reads YAML files from src directory

- **WHEN** `list("proj1")` is called
- **THEN** all `.yaml` files in `<ARCHMAX_DATA_DIR>/proj1/src/` are read, parsed, and returned as assembled models

#### Scenario: Get assembles from split files

- **WHEN** `get("proj1", "sales")` is called and a `src/sales/` subdirectory exists
- **THEN** the root file `src/sales.yaml` is read for model-level data
- **AND** each `.yaml` in `src/sales/` is read as a dataset
- **AND** the full assembled model is returned

#### Scenario: Get falls back to single-file format

- **WHEN** `get("proj1", "legacy")` is called and no `src/legacy/` subdirectory exists
- **THEN** the root file `src/legacy.yaml` is parsed as a complete model including inline datasets

#### Scenario: Legacy layout fallback

- **WHEN** `list("proj1")` is called and `<ARCHMAX_DATA_DIR>/proj1/src/` does not exist
- **AND** YAML files exist directly under `<ARCHMAX_DATA_DIR>/proj1/`
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

After every `write()` or `delete()` operation, the file service SHALL regenerate an `AGENTS.md` file in the project root directory (`<ARCHMAX_DATA_DIR>/projects/<projectId>/AGENTS.md`) summarizing all semantic models, their datasets, and metrics for AI assistant discovery.

#### Scenario: AGENTS.md regenerated after write

- **WHEN** a semantic model is written
- **THEN** `<ARCHMAX_DATA_DIR>/projects/<projectId>/AGENTS.md` is regenerated at the project root
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

The system SHALL provide a `SemanticModelDigest` class in `@archmax/core` that compiles parsed `SemanticModel` and `Dataset` objects into compact markdown text optimized for LLM consumption. The digest is a read-only view — the YAML files remain the authoritative source of truth. The class SHALL expose two static methods:

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

- **WHEN** the migration detects YAML files at `<ARCHMAX_DATA_DIR>/projects/<projectId>/model.yaml`
- **AND** no `<ARCHMAX_DATA_DIR>/projects/<projectId>/src/` directory exists
- **THEN** `model.yaml` is moved to `<ARCHMAX_DATA_DIR>/projects/<projectId>/src/model.yaml`
- **AND** the `model/` dataset directory (if present) is moved to `<ARCHMAX_DATA_DIR>/projects/<projectId>/src/model/`
- **AND** `AGENTS.md` remains at `<ARCHMAX_DATA_DIR>/projects/<projectId>/AGENTS.md` (project root)

#### Scenario: Migration preserves uploads directory

- **WHEN** the migration runs on a project with an existing `uploads/` directory
- **THEN** the `uploads/` directory remains at `<ARCHMAX_DATA_DIR>/projects/<projectId>/uploads/` (not moved)

#### Scenario: Migration is idempotent

- **WHEN** the migration runs on a project that already has a `src/` subdirectory
- **THEN** no files are moved and no errors occur

### Requirement: Build Assembly

The system SHALL provide a `PublishService` with an `assemble(projectId, targetDir?)` method that reads all source models from `src/`, inlines their datasets, and writes fully-assembled single-file YAMLs to the target directory. When `targetDir` is omitted, the default is `build/`. The target directory SHALL contain only assembled YAML files — no `AGENTS.md` (that lives at the project root). Stale files in the target for models that no longer exist in source SHALL be removed during assembly. The same assembly logic SHALL be used for both persistent publishing (to `build/`) and temporary on-the-fly assembly (to a temp directory for MCP testing).

#### Scenario: Assemble creates single-file YAMLs in build directory

- **WHEN** `assemble("proj1")` is called for a project with models `shopify` and `datev` in `src/`
- **THEN** `<ARCHMAX_DATA_DIR>/proj1/build/shopify.yaml` contains the fully assembled model with inline datasets
- **AND** `<ARCHMAX_DATA_DIR>/proj1/build/datev.yaml` contains the fully assembled model with inline datasets

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

### Requirement: Improvement Model

The system SHALL provide an `Improvement` Mongoose model stored in MongoDB for tracking improvement suggestions submitted via MCP. Each document SHALL contain: `project` (ObjectId reference to Project, required), `modelName` (string, required — the semantic model the suggestion targets), `title` (string, required, max 200 characters), `description` (string, required, max 2000 characters), `status` (enum: `pending` | `implemented`, default `pending`), `implementedAt` (Date, optional — set when status transitions to `implemented`), and `createdVia` (string — the MCP token name that submitted the suggestion). The model SHALL use the shared `softDeletePlugin` and Mongoose timestamps.

#### Scenario: Improvement created via MCP

- **WHEN** an MCP client submits a suggestion for model `ecommerce`
- **THEN** an `Improvement` document is created with `status: "pending"`, `modelName: "ecommerce"`, timestamps, and `createdVia` set to the token name

#### Scenario: Improvement marked as implemented

- **WHEN** an admin clicks "Implement" in the frontend
- **THEN** the improvement's `status` is set to `implemented` and `implementedAt` is set to the current timestamp

#### Scenario: Soft delete

- **WHEN** an improvement is soft-deleted
- **THEN** it no longer appears in default queries but remains in the database

### Requirement: Improvement API Endpoints

The API SHALL expose endpoints under `/api/projects/:projectId/improvements` for managing improvement suggestions. The endpoints SHALL be protected by session-based admin auth (consistent with other project-scoped routes).

- `GET /` — List improvements for the project, with optional `modelName` and `status` query filters, sorted by `createdAt` descending
- `GET /:id` — Get a single improvement by ID
- `PATCH /:id/implement` — Transition an improvement to `implemented` status, setting `implementedAt` to the current time

#### Scenario: List improvements filtered by model

- **WHEN** `GET /improvements?modelName=ecommerce` is called
- **THEN** only improvements targeting the `ecommerce` model are returned, sorted newest first

#### Scenario: List improvements filtered by status

- **WHEN** `GET /improvements?status=pending` is called
- **THEN** only pending improvements are returned

#### Scenario: Mark improvement as implemented

- **WHEN** `PATCH /improvements/:id/implement` is called for a pending improvement
- **THEN** the improvement's status becomes `implemented` and `implementedAt` is set
- **AND** the updated document is returned

#### Scenario: Get improvement not found

- **WHEN** `GET /improvements/:id` is called with a non-existent ID
- **THEN** a 404 error is returned

### Requirement: Improvements UI in Semantic Models Sidebar

The Semantic Models page sidebar SHALL include an "Improvements" accordion section below the "History" section. The section SHALL display all improvement suggestions for the project, grouped or filterable by model. Each item SHALL show a lightbulb icon, the truncated title, and a checkmark overlay if the improvement has been implemented. Clicking an improvement SHALL navigate to a detail view in the main content area.

#### Scenario: Sidebar shows pending improvements

- **WHEN** the user views the Semantic Models page and there are 3 pending improvements
- **THEN** the "Improvements" accordion section shows 3 items with lightbulb icons and no checkmarks

#### Scenario: Sidebar shows implemented improvements

- **WHEN** an improvement has status `implemented`
- **THEN** it appears in the sidebar with a checkmark icon overlay

#### Scenario: Empty state

- **WHEN** there are no improvements for the project
- **THEN** the "Improvements" section shows a message: "No improvement suggestions yet"

### Requirement: Improvement Detail View

When an improvement is selected from the sidebar, the main content area SHALL display the improvement's title, description, target model name, creation date, and the MCP token name that submitted it (`createdVia`). A prominent "Implement" button SHALL appear at the top of the view. Clicking "Implement" SHALL mark the improvement as implemented (via `PATCH /implement`) and navigate to a new chat with the improvement's description pre-filled in the message input textarea. The user still needs to manually submit the message.

#### Scenario: View improvement detail

- **WHEN** the user clicks on an improvement titled "Missing shipping_address field"
- **THEN** the main content area displays the title, full description, model name "ecommerce", creation date, and token name

#### Scenario: Implement improvement

- **WHEN** the user clicks "Implement" on a pending improvement
- **THEN** the improvement is marked as `implemented` (API call)
- **AND** the user is navigated to a new chat at `/$projectId/models/chat/new`
- **AND** the chat message input is pre-filled with the improvement's description
- **AND** the user must still click send to submit

#### Scenario: Already implemented

- **WHEN** the user views an improvement that is already `implemented`
- **THEN** the "Implement" button is replaced with a "Implemented" badge showing the implementation date

### Requirement: Dataset Group Storage

The system SHALL support storing dataset groups in a semantic model's root-level `custom_extensions` under vendor name `COMMON` with a `dataset_groups` key. Each group SHALL have: `id` (unique string), `name` (user-visible label), `datasets` (array of dataset name strings), and an optional `color` (string from a fixed palette). A dataset MAY belong to at most one group. Groups with zero datasets SHALL be automatically removed on save.

#### Scenario: Model with two groups

- **WHEN** a model root file is saved with `custom_extensions: [{ vendor_name: COMMON, data: '{"dataset_groups":[{"id":"grp_1","name":"Sales","datasets":["orders","customers"],"color":"blue"}]}' }]`
- **THEN** the `dataset_groups` array is persisted in the root YAML file
- **AND** the datasets `orders` and `customers` are considered members of the "Sales" group

#### Scenario: Empty group is pruned

- **WHEN** a group's last dataset is removed via the context menu
- **THEN** the group is automatically removed from the `dataset_groups` array

#### Scenario: Backward compatibility

- **WHEN** a model root file has no `dataset_groups` in its custom extensions
- **THEN** the graph view renders datasets without group bounding boxes (identical to current behavior)

### Requirement: Model-Level Extension Update API

The system SHALL expose a `PATCH /api/projects/:projectId/semantic-models/:name/extensions` endpoint that accepts `{ custom_extensions: Array<{ vendor_name: string; data: string }> }` and atomically updates the model root file's `custom_extensions` without affecting datasets. The `SemanticModelFileService` SHALL provide an `updateModelExtensions` method that reads the root YAML, replaces `custom_extensions`, and writes it back atomically.

#### Scenario: Update model extensions

- **WHEN** a PATCH request is sent with `{ custom_extensions: [{ vendor_name: "COMMON", data: '{"dataset_groups":[...]}' }] }`
- **THEN** the model root file's `custom_extensions` are replaced with the provided array
- **AND** datasets, relationships, and metrics in the root file remain unchanged

#### Scenario: Model not found

- **WHEN** a PATCH request targets a non-existent model name
- **THEN** the API returns a 404 error

### Requirement: Graph View Group Rendering

The system SHALL render dataset groups as rounded-rectangle bounding boxes behind their member dataset nodes in the React Flow graph view. Each group box SHALL display the group name as a label. The bounding box SHALL be auto-computed from member node positions with padding and SHALL update when nodes are dragged. Groups SHALL use a semi-transparent fill color from a fixed palette with a 1px border. Group bounding-box nodes SHALL be draggable: dragging a group SHALL translate all member dataset nodes by the same delta and persist their updated positions. The group box cursor SHALL indicate that the element is draggable.

#### Scenario: Group bounding box rendered

- **WHEN** the graph view loads a model with a group containing datasets `orders` and `customers`
- **THEN** a rounded-rectangle background element is rendered that encloses both dataset nodes
- **AND** the group name is displayed as a label at the top of the bounding box

#### Scenario: Bounding box updates on drag

- **WHEN** a user drags a dataset node that belongs to a group to a new position
- **THEN** the group bounding box resizes and repositions to continue enclosing all member datasets

#### Scenario: No groups in model

- **WHEN** the model has no `dataset_groups` defined
- **THEN** no bounding-box elements are rendered

#### Scenario: Dragging a group moves all member datasets

- **WHEN** a user drags a group bounding box by 100px to the right
- **THEN** every dataset node in that group is translated 100px to the right
- **AND** the group bounding box position updates accordingly
- **AND** all member dataset positions are persisted to their `custom_extensions`

#### Scenario: Group drag cursor

- **WHEN** the user hovers over a group bounding box
- **THEN** the cursor changes to a grab/move indicator

### Requirement: Graph Context Menu for Groups

The system SHALL provide a right-click context menu on dataset nodes in the graph view with the following actions:

1. **Create group** — prompts for a group name, creates a new group containing the right-clicked dataset
2. **Add to group** — shows a submenu of existing groups; clicking adds the dataset to the selected group (and removes from any previous group)
3. **Remove from group** — visible only when the dataset belongs to a group; removes the dataset from that group

The system SHALL also provide a right-click context menu on group bounding boxes with:

1. **Rename group** — prompts for a new name
2. **Delete group** — removes the group definition (datasets remain in the graph)

All group changes SHALL be persisted immediately via the model-level extensions PATCH endpoint.

#### Scenario: Create group from context menu

- **WHEN** a user right-clicks a dataset node and selects "Create group"
- **AND** enters the name "Sales"
- **THEN** a new group named "Sales" is created containing that dataset
- **AND** the bounding box is immediately rendered around the dataset
- **AND** the change is saved to the model root file

#### Scenario: Add dataset to existing group

- **WHEN** a user right-clicks a dataset node and selects "Add to group" → "Sales"
- **THEN** the dataset is added to the "Sales" group
- **AND** the bounding box expands to enclose the newly added dataset

#### Scenario: Remove dataset from group

- **WHEN** a user right-clicks a grouped dataset and selects "Remove from group"
- **THEN** the dataset is removed from its group
- **AND** the bounding box shrinks or is removed if the group becomes empty

#### Scenario: Rename group

- **WHEN** a user right-clicks a group bounding box and selects "Rename group"
- **AND** enters the new name "Revenue"
- **THEN** the group label updates to "Revenue"
- **AND** the change is persisted

#### Scenario: Delete group

- **WHEN** a user right-clicks a group bounding box and selects "Delete group"
- **THEN** the group is removed from the model
- **AND** all formerly grouped datasets remain in the graph without a bounding box

### Requirement: Group Renaming

The system SHALL allow renaming a dataset group by double-clicking its label text in the graph view or through the group context menu. The new name SHALL be persisted immediately via the model-level extensions PATCH endpoint.

#### Scenario: Rename via double-click

- **WHEN** a user double-clicks the group label text in the graph view
- **THEN** an inline text input replaces the label
- **AND** pressing Enter or clicking outside saves the new name

#### Scenario: Empty name rejected

- **WHEN** a user attempts to rename a group to an empty string
- **THEN** the rename is rejected and the original name is restored

### Requirement: Graph View State Persistence

The system SHALL persist the graph viewport state (pan offset x, pan offset y, zoom level) to the browser's `localStorage`, keyed by project ID and model name. On re-mount, the system SHALL restore the saved viewport instead of calling `fitView`. When no saved viewport exists (first visit), the system SHALL fall back to `fitView`. The user SHALL be able to reset the viewport to the default `fitView` state, which also clears the saved viewport from `localStorage`.

#### Scenario: Viewport restored on re-mount

- **WHEN** a user pans and zooms the graph view, then navigates away and returns
- **THEN** the graph restores the previously saved pan offset and zoom level
- **AND** the view does not jump to `fitView`

#### Scenario: First visit uses fitView

- **WHEN** a user opens a model's graph view for the first time (no saved viewport in `localStorage`)
- **THEN** the graph auto-fits all nodes into the viewport

#### Scenario: Reset viewport

- **WHEN** the user triggers a viewport reset action
- **THEN** the saved viewport is cleared from `localStorage`
- **AND** the graph calls `fitView` to re-center all nodes

### Requirement: Tab Preference Persistence

The system SHALL persist the active visualization tab (Graph, Tree, or YAML) to the browser's `localStorage` per model name. On page reload, the system SHALL restore the last selected tab for the current model. When no saved preference exists, the system SHALL default to the Graph tab.

#### Scenario: Tab preference restored on reload

- **WHEN** a user selects the "YAML" tab, then reloads the page
- **THEN** the YAML tab is selected when the model visualization loads

#### Scenario: Different models remember different tabs

- **WHEN** a user selects "Tree" for model A and "YAML" for model B
- **THEN** switching between models restores each model's last selected tab independently

#### Scenario: No saved preference defaults to Graph

- **WHEN** a user opens a model for the first time with no saved tab preference
- **THEN** the Graph tab is selected by default

