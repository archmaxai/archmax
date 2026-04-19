## ADDED Requirements

### Requirement: Git Directory Exclusion

All file listing operations SHALL exclude entries whose names start with `.` (dotfiles and dotdirs). This applies to: `SemanticModelFileService.list()` and `get()` directory traversals, `DocumentFileService.list()`, the agent filesystem `listFiles` operation, and the publish `collectFiles` helper. Specifically, the `.git/` directory and its contents SHALL never appear in model listings, document listings, agent file operations, or published content.

#### Scenario: Model listing excludes .git

- **WHEN** a project directory contains `src/sales.yaml`, `src/.git/`, and `src/.hidden.yaml`
- **THEN** `SemanticModelFileService.list()` returns only the `sales` model
- **AND** `.git` directory contents are not traversed

#### Scenario: Agent filesystem excludes dotfiles

- **WHEN** the agent lists files in the project directory
- **THEN** `.git/` and other dotfiles/dotdirs are not included in the listing

#### Scenario: Publish assembly excludes dotfiles

- **WHEN** the publish build assembly processes the project directory
- **THEN** `.git/` contents are not included in the build output

### Requirement: Merge Conflict Detection in YAML

The `SemanticModelFileService` SHALL detect Git merge conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) in YAML files. When listing models, files with conflict markers SHALL still appear in the model list with a `hasConflicts: true` flag, but their parsed content SHALL be marked as invalid. The `get()` method SHALL return the raw file content alongside the conflict flag so the frontend can display it.

#### Scenario: List models with a conflicted file

- **WHEN** `list()` is called and `src/sales.yaml` contains Git conflict markers
- **THEN** the model `sales` appears in the list with `hasConflicts: true`
- **AND** other valid models are returned normally

#### Scenario: Get a conflicted model

- **WHEN** `get("sales")` is called and the file contains conflict markers
- **THEN** the response includes `hasConflicts: true` and the raw YAML content
- **AND** parsed fields (datasets, relationships, metrics) are empty or absent

### Requirement: Conflict Visualization in Graph and Tree Views

When a semantic model has `hasConflicts: true`, the graph and tree visualization tabs SHALL display an error banner indicating that the YAML file contains merge conflicts and cannot be visualized. The error banner SHALL include the message "This model has merge conflicts that must be resolved before it can be visualized." The YAML tab SHALL still display the raw content (including conflict markers) so the user can see and understand the conflicts. The model SHALL still appear in the sidebar model list but with a visual conflict indicator (e.g., a warning icon).

#### Scenario: Graph view shows conflict error

- **WHEN** the user views a model with merge conflicts in the Graph tab
- **THEN** an error banner is displayed instead of the graph
- **AND** the banner text explains the merge conflict situation

#### Scenario: Tree view shows conflict error

- **WHEN** the user views a model with merge conflicts in the Tree tab
- **THEN** an error banner is displayed instead of the tree
- **AND** the banner text explains the merge conflict situation

#### Scenario: YAML tab shows raw content

- **WHEN** the user views a model with merge conflicts in the YAML tab
- **THEN** the raw YAML content (including conflict markers) is displayed
- **AND** the conflict markers are visually highlighted

#### Scenario: Sidebar shows conflict indicator

- **WHEN** the model list sidebar includes a model with merge conflicts
- **THEN** the model entry shows a warning icon or badge indicating conflicts
