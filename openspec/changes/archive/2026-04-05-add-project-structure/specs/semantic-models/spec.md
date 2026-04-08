## REMOVED Requirements

### Requirement: Semantic Model Schema

**Reason:** Replaced by OSI-aligned model structure. The old schema (flat relationships, simple metrics, tags) is superseded by the OSI Core Metadata Spec.

**Migration:** Existing SemanticModel documents will be migrated to the new structure via a one-time script that maps `relationships` → OSI Relationship, `metrics` → OSI Metric, and `dataSource` → `connection`.

### Requirement: Relationships

**Reason:** Replaced by OSI-standard Relationship model with `from`/`to` dataset references and column arrays instead of single-column `fromTable`/`toTable`/`type` pattern.

**Migration:** Existing relationship records are converted to OSI Relationship format.

### Requirement: Metrics

**Reason:** Replaced by OSI Metric model with multi-dialect expression support.

**Migration:** Existing metric expressions become `[{ dialect: "ANSI_SQL", expression: "<old_expression>" }]`.

### Requirement: Tagging

**Reason:** Tags are not part of the OSI spec. Tagging can be re-introduced as a custom extension later if needed.

**Migration:** Existing tags are discarded or stored as a custom extension.

## ADDED Requirements

### Requirement: OSI Semantic Model

The system SHALL provide a `SemanticModel` Mongoose model aligned with the OSI Core Metadata Spec. Fields: `connection` (ObjectId ref to Connection, required), `name` (string, required, unique per connection), `description` (string, optional), `aiContext` (object with optional `instructions`, `synonyms`, `examples` fields, or a plain string), `createdAt`, `updatedAt`, `deleted`, `deletedAt`.

#### Scenario: Create a semantic model for a connection

- **WHEN** a semantic model is created with a name and connection reference
- **THEN** a SemanticModel document is persisted with OSI-compatible structure

#### Scenario: AI context as object

- **WHEN** a semantic model is created with `aiContext: { instructions: "Use for retail analytics", synonyms: ["sales model"] }`
- **THEN** the AI context is stored as a structured object

### Requirement: OSI Dataset

The system SHALL provide a `Dataset` Mongoose model representing a logical table/view within a semantic model. Fields: `semanticModel` (ObjectId ref, required), `name` (string, required), `source` (string, e.g. `database.schema.table`), `primaryKey` (string array), `uniqueKeys` (array of string arrays), `description`, `aiContext`, `createdAt`, `updatedAt`, `deleted`, `deletedAt`.

#### Scenario: Create a dataset with composite primary key

- **WHEN** a dataset is created with `primaryKey: ["item_sk", "ticket_number"]`
- **THEN** the composite primary key is stored

#### Scenario: Dataset source reference

- **WHEN** a dataset is created with `source: "tpcds.public.store_sales"`
- **THEN** the fully-qualified table reference is stored

### Requirement: OSI Field

The system SHALL provide a `Field` Mongoose model representing a row-level attribute within a dataset. Fields: `dataset` (ObjectId ref, required), `name` (string, required), `expression` (array of `{ dialect: string, expression: string }`, at least one required), `dimension` (object with `is_time: boolean`, optional), `label` (string, optional), `description`, `aiContext`, `createdAt`, `updatedAt`, `deleted`, `deletedAt`.

#### Scenario: Field with ANSI SQL expression

- **WHEN** a field is created with `expression: [{ dialect: "ANSI_SQL", expression: "ss_sold_date_sk" }]`
- **THEN** the dialect expression is stored following the OSI Expression schema

#### Scenario: Time dimension field

- **WHEN** a field is created with `dimension: { is_time: true }`
- **THEN** the field is marked as a time-based dimension for temporal filtering

#### Scenario: Computed field expression

- **WHEN** a field is created with `expression: [{ dialect: "ANSI_SQL", expression: "c_first_name || ' ' || c_last_name" }]`
- **THEN** the computed expression is stored and can be used in queries

### Requirement: OSI Relationship

The system SHALL provide a `Relationship` Mongoose model representing a foreign-key relationship between datasets. Fields: `semanticModel` (ObjectId ref, required), `name` (string, required), `from` (string, dataset name on the many-side), `to` (string, dataset name on the one-side), `fromColumns` (string array, min 1), `toColumns` (string array, min 1), `aiContext`, `createdAt`, `updatedAt`, `deleted`, `deletedAt`.

#### Scenario: Define a sales-to-customer relationship

- **WHEN** a relationship is created with `from: "store_sales"`, `to: "customer"`, `fromColumns: ["ss_customer_sk"]`, `toColumns: ["c_customer_sk"]`
- **THEN** the join path between the two datasets is recorded

#### Scenario: Composite foreign key

- **WHEN** a relationship uses multiple columns in `fromColumns` and `toColumns`
- **THEN** all column pairs are stored for the join condition

### Requirement: OSI Metric

The system SHALL provide a `Metric` Mongoose model representing a quantitative measure. Fields: `semanticModel` (ObjectId ref, required), `name` (string, required), `expression` (array of `{ dialect: string, expression: string }`, at least one required), `description`, `aiContext`, `createdAt`, `updatedAt`, `deleted`, `deletedAt`.

#### Scenario: Aggregate metric

- **WHEN** a metric is created with `expression: [{ dialect: "ANSI_SQL", expression: "SUM(store_sales.ss_ext_sales_price)" }]`
- **THEN** the metric's computation is stored with dialect info

#### Scenario: Ratio metric

- **WHEN** a metric is created with expression `SUM(ss_ext_sales_price) / NULLIF(SUM(s_number_employees), 0)`
- **THEN** the complex expression is stored for use in analytics queries
