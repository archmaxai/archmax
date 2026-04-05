# semantic-models Specification

## Purpose
Higher-level semantic groupings spanning tables within a data source. Semantic models define cross-table relationships, computed metrics, and tagging for AI-assisted discovery of database semantics.

## Requirements

### Requirement: Semantic Model Schema

A semantic model SHALL have the following fields: `name` (unique), `dataSource` (reference to DataSource), `description`, `relationships` (array), `metrics` (array), `tags` (array of strings), `isActive`, timestamps.

#### Scenario: Semantic model references data source

- **WHEN** a semantic model is created with a `dataSource` ObjectId
- **THEN** the model is linked to the corresponding data source

### Requirement: Relationships

Each relationship SHALL define `name`, `fromTable`, `fromColumn`, `toTable`, `toColumn`, `type` (one-to-one|one-to-many|many-to-many), and `description`.

#### Scenario: One-to-many relationship

- **WHEN** a relationship is defined with `type: "one-to-many"` between orders.customer_id and customers.id
- **THEN** the cardinality and join path are recorded

### Requirement: Metrics

Each metric SHALL define `name`, `expression` (SQL or aggregation expression), `description`, and optional `format`.

#### Scenario: Revenue metric

- **WHEN** a metric is defined with `expression: "SUM(order_items.quantity * order_items.unit_price)"`
- **THEN** the metric's computation logic is stored for AI consumption

### Requirement: Tagging

Semantic models SHALL support an array of string tags for categorization and discovery.

#### Scenario: Filter by tag

- **WHEN** models are queried with a tag filter
- **THEN** only models containing that tag are returned
