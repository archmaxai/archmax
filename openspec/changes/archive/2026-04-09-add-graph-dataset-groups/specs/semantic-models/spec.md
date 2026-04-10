## ADDED Requirements

### Requirement: Dataset Group Storage

The system SHALL support storing dataset groups in a semantic model's root-level `custom_extensions` under vendor name `COMMON` with a `dataset_groups` key. Each group SHALL have: `id` (unique string), `name` (user-visible label), `datasets` (array of dataset name strings), and an optional `color` (string from a fixed palette). A dataset MAY belong to at most one group. Groups with zero datasets SHALL be automatically removed on save.

#### Scenario: Model with two groups

- **WHEN** a model root file is saved with `custom_extensions: [{ vendor_name: COMMON, data: '{"dataset_groups":[{"id":"grp_1","name":"Sales","datasets":["orders","customers"],"color":"blue"}]}' }]`
- **THEN** the `dataset_groups` array is persisted in the root YAML file
- **AND** the datasets `orders` and `customers` are considered members of the "Sales" group

#### Scenario: Empty group is pruned

- **WHEN** a group's last dataset is removed via the context menu
- **THEN** the group is automatically removed from the `dataset_groups` array

#### Scenario: Backward compatibility

- **WHEN** a model root file has no `dataset_groups` in its custom extensions
- **THEN** the graph view renders datasets without group bounding boxes (identical to current behavior)

### Requirement: Model-Level Extension Update API

The system SHALL expose a `PATCH /api/projects/:projectId/semantic-models/:name/extensions` endpoint that accepts `{ custom_extensions: Array<{ vendor_name: string; data: string }> }` and atomically updates the model root file's `custom_extensions` without affecting datasets. The `SemanticModelFileService` SHALL provide an `updateModelExtensions` method that reads the root YAML, replaces `custom_extensions`, and writes it back atomically.

#### Scenario: Update model extensions

- **WHEN** a PATCH request is sent with `{ custom_extensions: [{ vendor_name: "COMMON", data: '{"dataset_groups":[...]}' }] }`
- **THEN** the model root file's `custom_extensions` are replaced with the provided array
- **AND** datasets, relationships, and metrics in the root file remain unchanged

#### Scenario: Model not found

- **WHEN** a PATCH request targets a non-existent model name
- **THEN** the API returns a 404 error

### Requirement: Graph View Group Rendering

The system SHALL render dataset groups as rounded-rectangle bounding boxes behind their member dataset nodes in the React Flow graph view. Each group box SHALL display the group name as a label. The bounding box SHALL be auto-computed from member node positions with padding and SHALL update when nodes are dragged. Groups SHALL use a semi-transparent fill color from a fixed palette with a 1px border.

#### Scenario: Group bounding box rendered

- **WHEN** the graph view loads a model with a group containing datasets `orders` and `customers`
- **THEN** a rounded-rectangle background element is rendered that encloses both dataset nodes
- **AND** the group name is displayed as a label at the top of the bounding box

#### Scenario: Bounding box updates on drag

- **WHEN** a user drags a dataset node that belongs to a group to a new position
- **THEN** the group bounding box resizes and repositions to continue enclosing all member datasets

#### Scenario: No groups in model

- **WHEN** the model has no `dataset_groups` defined
- **THEN** no bounding-box elements are rendered

### Requirement: Graph Context Menu for Groups

The system SHALL provide a right-click context menu on dataset nodes in the graph view with the following actions:

1. **Create group** — prompts for a group name, creates a new group containing the right-clicked dataset
2. **Add to group** — shows a submenu of existing groups; clicking adds the dataset to the selected group (and removes from any previous group)
3. **Remove from group** — visible only when the dataset belongs to a group; removes the dataset from that group

The system SHALL also provide a right-click context menu on group bounding boxes with:

1. **Rename group** — prompts for a new name
2. **Delete group** — removes the group definition (datasets remain in the graph)

All group changes SHALL be persisted immediately via the model-level extensions PATCH endpoint.

#### Scenario: Create group from context menu

- **WHEN** a user right-clicks a dataset node and selects "Create group"
- **AND** enters the name "Sales"
- **THEN** a new group named "Sales" is created containing that dataset
- **AND** the bounding box is immediately rendered around the dataset
- **AND** the change is saved to the model root file

#### Scenario: Add dataset to existing group

- **WHEN** a user right-clicks a dataset node and selects "Add to group" → "Sales"
- **THEN** the dataset is added to the "Sales" group
- **AND** the bounding box expands to enclose the newly added dataset

#### Scenario: Remove dataset from group

- **WHEN** a user right-clicks a grouped dataset and selects "Remove from group"
- **THEN** the dataset is removed from its group
- **AND** the bounding box shrinks or is removed if the group becomes empty

#### Scenario: Rename group

- **WHEN** a user right-clicks a group bounding box and selects "Rename group"
- **AND** enters the new name "Revenue"
- **THEN** the group label updates to "Revenue"
- **AND** the change is persisted

#### Scenario: Delete group

- **WHEN** a user right-clicks a group bounding box and selects "Delete group"
- **THEN** the group is removed from the model
- **AND** all formerly grouped datasets remain in the graph without a bounding box

### Requirement: Group Renaming

The system SHALL allow renaming a dataset group by double-clicking its label text in the graph view or through the group context menu. The new name SHALL be persisted immediately via the model-level extensions PATCH endpoint.

#### Scenario: Rename via double-click

- **WHEN** a user double-clicks the group label text in the graph view
- **THEN** an inline text input replaces the label
- **AND** pressing Enter or clicking outside saves the new name

#### Scenario: Empty name rejected

- **WHEN** a user attempts to rename a group to an empty string
- **THEN** the rename is rejected and the original name is restored
