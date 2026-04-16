## MODIFIED Requirements

### Requirement: Scoped DuckDB VIEWs

The `execute_query` tool SHALL maintain DuckDB VIEWs in per-model schemas named `_scope_<modelName>` (e.g., `_scope_ecommerce`). Each dataset becomes a VIEW named `_scope_<modelName>."<datasetName>"` that selects only the field expressions from the dataset's source table. When a field's logical `name` differs from its physical `expression`, the VIEW SHALL alias the expression to the logical name (e.g., `SELECT personid AS "person_id" FROM source`). Aliased columns MUST be queryable through the VIEW using the logical field name. VIEWs are created lazily on the first `execute_query` call for a model and cached using a content hash of the model's YAML file. Subsequent calls skip view creation if the hash matches. When the model changes (e.g., after a publish), the hash mismatch triggers view recreation. The DuckDB `search_path` is set to the model's scoped schema before query execution, so agents use bare dataset names (e.g., `FROM "orders"`) and DuckDB resolves them to the scoped VIEWs. The `get_semantic_model` overview SHALL annotate each dataset with its bare table name (the dataset name) for use in queries. When a field expression cannot be resolved against the source table, the field SHALL be excluded from the VIEW and a warning SHALL be logged. The warning MUST include the dataset name, field name, and the error message from DuckDB.

#### Scenario: VIEW created from semantic model dataset
- **WHEN** `execute_query` is called with `modelName: "ecommerce"` and the model has dataset `orders` sourced from `shop.public.orders` with fields `order_id`, `total_amount`, `status`
- **THEN** a VIEW `_scope_ecommerce."orders"` is created as `SELECT order_id, total_amount, status FROM shop.public.orders`
- **AND** the `search_path` is set so `FROM "orders"` resolves to this VIEW
- **AND** queries against the VIEW return only those three columns

#### Scenario: VIEW reflects field expressions
- **WHEN** a dataset field has a computed expression (e.g., `c_first_name || ' ' || c_last_name`)
- **THEN** the VIEW includes the expression as a column with the field's name as alias

#### Scenario: VIEW correctly aliases renamed fields
- **WHEN** a dataset field has `name: "person_id"` and `expression: "personid"` (physical column is `personid`, logical name is `person_id`)
- **THEN** the VIEW includes `personid AS "person_id"` in its SELECT list
- **AND** querying `SELECT person_id FROM "dataset_name"` through the VIEW returns the correct data
- **AND** the column appears as `person_id` in query result metadata

#### Scenario: VIEWs cached between calls
- **WHEN** `execute_query` is called twice with the same `modelName` and the model has not changed
- **THEN** the second call skips VIEW creation entirely
- **AND** query execution proceeds using the existing VIEWs

#### Scenario: VIEWs refreshed on model change
- **WHEN** a semantic model is re-published and then `execute_query` is called
- **THEN** the content hash mismatch triggers VIEW recreation with the updated field definitions

#### Scenario: Concurrent queries for different models
- **WHEN** two concurrent `execute_query` calls arrive for models "ecommerce" and "analytics" that both have a dataset named "orders"
- **THEN** each call operates on its own schema (`_scope_ecommerce` and `_scope_analytics`) via per-connection `search_path`
- **AND** neither call's VIEWs interfere with the other

#### Scenario: Dataset names shown in model overview
- **WHEN** `get_semantic_model` is called for model "ecommerce"
- **THEN** each dataset row includes the bare dataset name as the table name for use in queries

#### Scenario: Invalid field expression excluded from VIEW
- **WHEN** a dataset field has an expression that cannot be resolved against the source table (e.g., the physical column was renamed or dropped)
- **THEN** the field is excluded from the VIEW
- **AND** a warning is logged with the dataset name, field name, and the DuckDB error message
- **AND** the remaining valid fields are still included in the VIEW
