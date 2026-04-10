## MODIFIED Requirements

### Requirement: Graph View Group Rendering

The system SHALL render dataset groups as rounded-rectangle bounding boxes behind their member dataset nodes in the React Flow graph view. Each group box SHALL display the group name as a label. The bounding box SHALL be auto-computed from member node positions with padding and SHALL update when nodes are dragged. Groups SHALL use a semi-transparent fill color from a fixed palette with a 1px border. Group bounding-box nodes SHALL be draggable: dragging a group SHALL translate all member dataset nodes by the same delta and persist their updated positions. The group box cursor SHALL indicate that the element is draggable.

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

#### Scenario: Dragging a group moves all member datasets

- **WHEN** a user drags a group bounding box by 100px to the right
- **THEN** every dataset node in that group is translated 100px to the right
- **AND** the group bounding box position updates accordingly
- **AND** all member dataset positions are persisted to their `custom_extensions`

#### Scenario: Group drag cursor

- **WHEN** the user hovers over a group bounding box
- **THEN** the cursor changes to a grab/move indicator

## ADDED Requirements

### Requirement: Graph View State Persistence

The system SHALL persist the graph viewport state (pan offset x, pan offset y, zoom level) to the browser's `localStorage`, keyed by project ID and model name. On re-mount, the system SHALL restore the saved viewport instead of calling `fitView`. When no saved viewport exists (first visit), the system SHALL fall back to `fitView`. The user SHALL be able to reset the viewport to the default `fitView` state, which also clears the saved viewport from `localStorage`.

#### Scenario: Viewport restored on re-mount

- **WHEN** a user pans and zooms the graph view, then navigates away and returns
- **THEN** the graph restores the previously saved pan offset and zoom level
- **AND** the view does not jump to `fitView`

#### Scenario: First visit uses fitView

- **WHEN** a user opens a model's graph view for the first time (no saved viewport in `localStorage`)
- **THEN** the graph auto-fits all nodes into the viewport

#### Scenario: Reset viewport

- **WHEN** the user triggers a viewport reset action
- **THEN** the saved viewport is cleared from `localStorage`
- **AND** the graph calls `fitView` to re-center all nodes

### Requirement: Tab Preference Persistence

The system SHALL persist the active visualization tab (Graph, Tree, or YAML) to the browser's `localStorage` per model name. On page reload, the system SHALL restore the last selected tab for the current model. When no saved preference exists, the system SHALL default to the Graph tab.

#### Scenario: Tab preference restored on reload

- **WHEN** a user selects the "YAML" tab, then reloads the page
- **THEN** the YAML tab is selected when the model visualization loads

#### Scenario: Different models remember different tabs

- **WHEN** a user selects "Tree" for model A and "YAML" for model B
- **THEN** switching between models restores each model's last selected tab independently

#### Scenario: No saved preference defaults to Graph

- **WHEN** a user opens a model for the first time with no saved tab preference
- **THEN** the Graph tab is selected by default
