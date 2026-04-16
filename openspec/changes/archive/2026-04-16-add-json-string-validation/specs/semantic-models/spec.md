## MODIFIED Requirements

### Requirement: Zod Schema Validation

All YAML files SHALL be validated against Zod schemas on read. Invalid files SHALL be skipped during `list()` operations. The schemas SHALL enforce required fields (`name`, `expression` object for fields, `source` for datasets), validate `custom_extensions` structure, validate `dimension` structure, accept `ai_context` as string or object, use snake_case property names throughout, and apply sensible defaults (empty arrays for optional collections). String fields that conventionally contain serialized JSON (such as `custom_extensions[].data`) SHALL be validated as parseable JSON at the schema level using a reusable `jsonStringSchema` refinement, so that invalid JSON is rejected before reaching the filesystem.

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

#### Scenario: Schema rejects invalid JSON in custom_extensions data

- **WHEN** a custom extension has `data: "not valid json{"`
- **THEN** Zod validation fails with a descriptive error indicating the JSON is malformed
- **AND** the invalid data is never written to disk

#### Scenario: Schema accepts valid JSON in custom_extensions data

- **WHEN** a custom extension has `data: '{"data_type":"VARCHAR","example_data":["Active"]}'`
- **THEN** Zod validation succeeds and the extension is accepted

#### Scenario: Schema accepts empty JSON object in custom_extensions data

- **WHEN** a custom extension has `data: '{}'`
- **THEN** Zod validation succeeds

### Requirement: Custom Extensions on All Entities

All OSI entities (SemanticModel, Dataset, Field, Relationship, Metric) SHALL support an optional `custom_extensions` array. Each entry contains `vendor_name` (string, required — one of `COMMON`, `SNOWFLAKE`, `SALESFORCE`, `DBT`, `DATABRICKS`) and `data` (string, required — must be valid JSON). The Zod schema SHALL validate both the structure and that `data` is parseable JSON. The `SemanticModelFileService` SHALL preserve `custom_extensions` on read/write for all entities. The `updateModelExtensions` and `updateDatasetExtensions` methods SHALL validate that each extension's `data` field contains valid JSON before writing, rejecting the entire operation with a descriptive error if any entry is malformed.

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

#### Scenario: updateModelExtensions rejects invalid JSON

- **WHEN** `updateModelExtensions` is called with `[{ vendor_name: "COMMON", data: "{broken" }]`
- **THEN** the method throws a descriptive error
- **AND** the YAML file on disk is not modified

#### Scenario: updateDatasetExtensions rejects invalid JSON

- **WHEN** `updateDatasetExtensions` is called with `[{ vendor_name: "COMMON", data: "not-json" }]`
- **THEN** the method throws a descriptive error
- **AND** the dataset YAML file on disk is not modified
