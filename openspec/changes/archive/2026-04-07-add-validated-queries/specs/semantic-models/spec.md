## ADDED Requirements

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
