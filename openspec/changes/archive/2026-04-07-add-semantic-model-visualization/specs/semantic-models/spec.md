## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Dataset Files

Each dataset SHALL be stored as a separate YAML file at `<SEMLAYER_DATA_DIR>/<projectId>/<modelName>/<datasetName>.yaml` containing: `name` (string, required), `source` (string, e.g. `<connection>.<schema>.<table>`), `primaryKey` (string array), `uniqueKeys` (array of string arrays), `description`, `aiContext`, `fields` (array of inline field objects), and `custom_extensions` (optional array of `{ vendor_name, data }` objects).

#### Scenario: Dataset with composite primary key

- **WHEN** a dataset file is written with `primaryKey: ["item_sk", "ticket_number"]`
- **THEN** the composite primary key is stored in the dataset YAML

#### Scenario: Dataset source reference

- **WHEN** a dataset is saved with `source: "tpcds.public.store_sales"`
- **THEN** the fully-qualified `<connection>.<schema>.<table>` reference is stored

#### Scenario: Dataset with custom extensions

- **WHEN** a dataset is saved with `custom_extensions: [{ vendor_name: "archmax", data: '{"graph_x": 100, "graph_y": 200}' }]`
- **THEN** the custom extensions are stored alongside the other dataset properties in the YAML file
