## ADDED Requirements

### Requirement: Dataset View Query Custom Extension

Each dataset SHALL declare its scoped-view body via a `view_query` key inside the COMMON `custom_extensions` payload (`vendor_name: COMMON`). `view_query` is a single non-empty string containing exactly one `SELECT … FROM <connection>.<schema>.<table> …` statement. It MAY include `WHERE`, `JOIN`, computed projections, and any read-only DuckDB SQL the structural validator accepts. It MUST NOT include the wrapping `CREATE VIEW` clause; the platform is responsible for wrapping it as `CREATE OR REPLACE VIEW _scope_<modelName>."<datasetName>" AS <view_query>` at materialisation time. The Zod schema SHALL validate that, when present, `view_query` is a non-empty string. The `SemanticModelFileService` SHALL preserve `view_query` on read/write as part of the existing custom_extensions passthrough — it is not interpreted by the file service.

#### Scenario: Dataset with mirror view_query

- **WHEN** a dataset is saved with `custom_extensions: [{ vendor_name: COMMON, data: '{"view_query":"SELECT order_id, total_amount, status FROM shop.public.orders"}' }]`
- **THEN** the `view_query` is persisted in the dataset YAML file inside the COMMON extension
- **AND** reading the file back returns the same `view_query` string

#### Scenario: Dataset with filtered view_query

- **WHEN** a dataset is saved with `view_query` of `SELECT order_id, total_amount, status FROM shop.public.orders WHERE deleted_at IS NULL`
- **THEN** the filter is preserved verbatim in the YAML
- **AND** the platform-applied view exposes only non-deleted orders

#### Scenario: Dataset with denormalising view_query

- **WHEN** a dataset is saved with `view_query` of `SELECT o.order_id, o.total_amount, c.email AS customer_email FROM shop.public.orders o JOIN shop.public.customers c ON o.customer_id = c.id`
- **THEN** the join is preserved verbatim and the view exposes the joined columns

#### Scenario: Empty view_query rejected

- **WHEN** a dataset YAML is written with `view_query: ""`
- **THEN** Zod validation fails before any file write
- **AND** the file on disk is not modified

#### Scenario: view_query coexists with other COMMON extension data

- **WHEN** a dataset's COMMON extension JSON contains `view_query`, `validated_queries`, and field-level `data_type`/`example_data`/`distinct_values`
- **THEN** all keys are preserved on read/write without interference

### Requirement: View Query Migration Script

The system SHALL provide a one-time migration script at `apps/api/src/scripts/migrate-view-query.ts` that backfills the `view_query` extension on every existing dataset by emitting the SELECT body that the legacy `createScopedViews` auto-derivation produced. The script SHALL: walk every project's `src/<modelName>/<datasetName>.yaml`, build a SELECT body using the same column-quoting and aliasing rules as the legacy auto-derivation (simple identifiers quoted; `expression AS "name"` when expression differs from name), write the resulting string into the dataset's COMMON extension as `view_query`, create a `.yaml.bak` backup before overwriting, and skip datasets whose COMMON extension already has a non-empty `view_query`. The script SHALL be idempotent and SHALL print a summary of total / migrated / skipped / errored counts on completion.

#### Scenario: Migration of a dataset with simple fields

- **WHEN** the migration runs against a dataset with fields `order_id`, `total_amount`, `status` sourced from `shop.public.orders` and no existing `view_query`
- **THEN** the dataset's COMMON extension gains `view_query: "SELECT \"order_id\", \"total_amount\", \"status\" FROM shop.public.orders"`
- **AND** a `.yaml.bak` of the original file exists alongside it

#### Scenario: Migration preserves field aliasing

- **WHEN** a dataset has a field with `name: "person_id"` and `expression: "personid"`
- **THEN** the migrated `view_query` includes `"personid" AS "person_id"` in the SELECT list

#### Scenario: Migration preserves computed expressions

- **WHEN** a dataset has a field with expression `c_first_name || ' ' || c_last_name`
- **THEN** the migrated `view_query` includes `c_first_name || ' ' || c_last_name AS "<field_name>"` verbatim (no extra quoting of the computed expression)

#### Scenario: Migration is idempotent

- **WHEN** the migration runs twice on the same project
- **THEN** the second run skips every dataset (already has `view_query`) and writes no `.yaml.bak` files
- **AND** the summary reports zero migrated and N skipped

#### Scenario: Migration refuses to overwrite an existing backup

- **WHEN** a dataset has no `view_query` but a `.yaml.bak` already exists from a previous partial run
- **THEN** the migration skips that dataset, logs a WARN, and counts it under "skipped (existing backup)"
- **AND** the dataset YAML on disk is not modified

#### Scenario: Dataset with no fields surfaces a loud warning

- **WHEN** a dataset has an empty `fields` array
- **THEN** the migration prints a WARN line naming the project, model, and dataset, with the message "Dataset has no fields and will not be queryable until you add either fields or an explicit `view_query` to its COMMON extension"
- **AND** the dataset is counted under "errored" (not "skipped") in the summary so a CI run of the migration fails non-zero
- **AND** no `.yaml.bak` is written and no `view_query` is added — the dataset is left exactly as it was
