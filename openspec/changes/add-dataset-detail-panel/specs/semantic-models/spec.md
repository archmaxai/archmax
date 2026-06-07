## ADDED Requirements

### Requirement: Dataset Detail Panel in Graph View

The system SHALL render a vertical dataset detail panel anchored to the far-right edge of the graph view area. The panel SHALL be hidden by default and SHALL slide in from the right when a user clicks a dataset node in the graph. Clicking a dataset node SHALL set it as the selected dataset; clicking the empty graph pane SHALL clear the selection. The panel SHALL be collapsible/closable via a control in the panel header, and closing the panel SHALL NOT clear the underlying graph selection ring. While the panel is open, clicking a different dataset node SHALL update the panel content to that dataset without closing the panel. The graph canvas SHALL reflow to use the remaining width while the panel is open.

#### Scenario: Clicking a dataset opens the panel

- **WHEN** a user clicks a dataset node in the graph view
- **THEN** the dataset detail panel slides in from the far right
- **AND** the panel displays the clicked dataset's metadata

#### Scenario: Switching datasets updates the open panel

- **WHEN** the detail panel is open and the user clicks a different dataset node
- **THEN** the panel content updates to the newly clicked dataset
- **AND** the panel remains open

#### Scenario: Closing the panel

- **WHEN** the user clicks the close/collapse control in the panel header
- **THEN** the panel slides out and the graph canvas reclaims the freed width

#### Scenario: Clicking the empty pane clears selection

- **WHEN** a dataset is selected and the user clicks the empty graph pane
- **THEN** the dataset selection is cleared

### Requirement: Dataset Detail Panel Content

The dataset detail panel SHALL display, for the selected dataset, the dataset name, source reference, the AI description / `ai_context` (rendered as instructions, synonyms, and examples when `ai_context` is a structured object, or as text when it is a string), the dataset description/summary, and a scrollable list of the dataset's fields. Each field entry SHALL show the field name, its data type (from the COMMON `data_type` custom extension when present), its description, and its `ai_context`. The panel SHALL read this metadata from the already-loaded full semantic model and SHALL NOT require an additional fetch.

#### Scenario: Panel shows dataset AI description and summary

- **WHEN** the selected dataset has a `description` and an `ai_context` object with `instructions`
- **THEN** the panel displays both the description and the AI instructions

#### Scenario: Panel lists fields with descriptions

- **WHEN** the selected dataset has fields with `description` and `data_type` COMMON extensions
- **THEN** the panel lists each field with its name, data type, and description

#### Scenario: Dataset with no AI context

- **WHEN** the selected dataset has no `ai_context`
- **THEN** the panel omits the AI description section without error

### Requirement: Manual Dataset Metadata Editing

The dataset detail panel SHALL provide editable inputs for the dataset description, the dataset `ai_context` instructions, and each field's description. The panel SHALL include a **Save** button that persists the edits via the dataset metadata update API. The Save button SHALL be disabled when there are no unsaved changes and SHALL show a pending state while the request is in flight. On success, the system SHALL show a success toast ("Dataset saved") and invalidate the cached semantic model so the panel reflects the persisted content. On failure, the system SHALL show an error toast with the server message and SHALL preserve the user's in-progress edits.

#### Scenario: Saving edited dataset metadata

- **WHEN** the user edits the dataset description and clicks Save
- **THEN** the edit is persisted via the dataset metadata update API
- **AND** a "Dataset saved" success toast is shown
- **AND** the cached semantic model is invalidated

#### Scenario: Save disabled with no changes

- **WHEN** the panel is open and the user has made no edits
- **THEN** the Save button is disabled

#### Scenario: Save failure preserves edits

- **WHEN** a save request fails
- **THEN** an error toast with the server message is shown
- **AND** the user's in-progress edits remain in the inputs

### Requirement: Dataset Metadata Update API

The system SHALL expose a `PATCH /api/projects/:projectId/semantic-models/:name/datasets/:datasetName` endpoint, protected by session-based admin auth, that accepts a partial dataset metadata payload `{ description?: string; ai_context?: AiContext; fields?: Array<{ name: string; description?: string; ai_context?: AiContext }> }`. The endpoint SHALL atomically merge the provided metadata into the dataset's YAML file without altering `source`, `primary_key`, `unique_keys`, field `expression` values, `custom_extensions`, or the dataset `view_query`. Field entries SHALL be matched by `name`; unknown field names SHALL be rejected with a descriptive error. Requests targeting a non-existent model or dataset SHALL return a 404. The `SemanticModelFileService` SHALL provide an `updateDatasetMetadata` method that reads the dataset file, merges the metadata, and writes it back atomically (temp file + rename).

#### Scenario: Patch updates dataset description and ai_context

- **WHEN** a PATCH request is sent with `{ description: "Order line items", ai_context: { instructions: "Use for revenue analysis" } }`
- **THEN** the dataset YAML file's `description` and `ai_context` are updated
- **AND** the dataset's `source`, fields' `expression`, and `custom_extensions` are unchanged

#### Scenario: Patch updates individual field descriptions

- **WHEN** a PATCH request includes `fields: [{ name: "total_price", description: "Line total in USD" }]`
- **THEN** only the `total_price` field's description is updated
- **AND** all other fields are unchanged

#### Scenario: Patch with unknown field name is rejected

- **WHEN** a PATCH request references a field name not present in the dataset
- **THEN** the API returns an error and no changes are written

#### Scenario: Patch targets non-existent dataset

- **WHEN** a PATCH request targets a dataset name that does not exist in the model
- **THEN** the API returns a 404 error

### Requirement: Typed AI Context on Frontend Model Types

The frontend `SemanticModelFull`, `DatasetFull`, and `FieldFull` TypeScript types SHALL include an explicitly-typed optional `ai_context` field matching the schema shape (a string, or an object with optional `instructions`, `synonyms`, and `examples`). The graph view and detail panel SHALL read `ai_context` through this typed field rather than via an untyped index-signature cast.

#### Scenario: Detail panel reads typed ai_context

- **WHEN** the detail panel renders a dataset whose `ai_context` is a structured object
- **THEN** it reads `instructions`, `synonyms`, and `examples` through the typed `ai_context` field without an unsafe cast
