## ADDED Requirements

### Requirement: Auto-Create Dataset Groups

The semantic model agent SHALL auto-create dataset groups when assembling a semantic model. Groups SHALL be written to the model root file's `custom_extensions` under vendor `COMMON` with a `dataset_groups` key. The agent SHALL identify logical groups based on schema prefixes (e.g. `hr_*`, `sales_*`), star-schema topology (fact + dimensions as a group), or explicit business domain boundaries. Each group SHALL contain 2–6 datasets with a descriptive name. Colors SHALL be assigned from the available palette, cycling through options.

#### Scenario: Star-schema grouping

- **WHEN** the agent builds a model containing `orders`, `order_items`, `customers`, `products`, and `warehouses`
- **AND** `orders` and `order_items` share a relationship, and `customers` joins to `orders`
- **THEN** the agent creates a group like `{"id":"grp_...","name":"Order Management","datasets":["orders","order_items","customers"]}`
- **AND** `products` and `warehouses` are placed in a separate group like "Inventory"

#### Scenario: Schema-prefix grouping

- **WHEN** the agent encounters datasets named `hr_employees`, `hr_departments`, `hr_salaries`, `fin_invoices`, `fin_payments`
- **THEN** the agent creates groups "HR" containing `hr_employees`, `hr_departments`, `hr_salaries` and "Finance" containing `fin_invoices`, `fin_payments`

#### Scenario: Single-domain model

- **WHEN** all datasets belong to the same business domain and there are fewer than 6 datasets
- **THEN** the agent MAY omit groups or create a single group if it aids readability
