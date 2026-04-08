## ADDED Requirements

### Requirement: Dataset Detail Sheet in Graph View

When a user clicks a dataset node in the graph view, the system SHALL open a slide-out sheet (right panel) displaying the full details of the selected dataset. The sheet SHALL include: dataset name and source reference, AI context (description, instructions, synonyms, examples as applicable), primary key and unique keys, validated queries (description and SQL), a scrollable field list (name, data type, description, expression), and relationships connected to the dataset (filtered from the model's relationship list). Clicking outside the sheet or pressing its close button SHALL dismiss it. Dragging a node SHALL NOT open the sheet.

#### Scenario: Click dataset node opens detail sheet

- **WHEN** the user clicks a dataset node in the graph view (without dragging)
- **THEN** a sheet slides in from the right displaying the dataset's full details
- **AND** the sheet shows the dataset name as the title and source as a subtitle

#### Scenario: Sheet displays AI context

- **WHEN** the sheet is open for a dataset with `ai_context` containing instructions and synonyms
- **THEN** the instructions are displayed as a descriptive paragraph
- **AND** synonyms are displayed as a comma-separated list

#### Scenario: Sheet displays validated queries

- **WHEN** the sheet is open for a dataset that has validated queries in its COMMON custom extension
- **THEN** each validated query is rendered with its description and SQL in a code block
- **AND** queries are displayed in a numbered list

#### Scenario: Sheet displays field list

- **WHEN** the sheet is open for a dataset with fields
- **THEN** all fields are displayed in a scrollable list
- **AND** each field shows its name, data type (from COMMON extension), and description

#### Scenario: Sheet displays connected relationships

- **WHEN** the sheet is open for a dataset that appears in model relationships (as `from` or `to`)
- **THEN** the connected relationships are listed with the join direction and column mappings

#### Scenario: Drag does not trigger sheet

- **WHEN** the user drags a dataset node to reposition it
- **THEN** the detail sheet does NOT open
- **AND** node position saving proceeds as normal

#### Scenario: Dataset without optional data

- **WHEN** the sheet is open for a dataset that has no AI context, no validated queries, and no primary key
- **THEN** those sections are omitted from the sheet
- **AND** the sheet still displays the dataset name, source, and field list
