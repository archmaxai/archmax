## ADDED Requirements

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
