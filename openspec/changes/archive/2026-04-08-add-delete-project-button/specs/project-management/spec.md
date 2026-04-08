## ADDED Requirements

### Requirement: Delete Project UI

The settings page (`/$projectId/settings`) SHALL display a "Danger Zone" card at the bottom of the page containing a destructive "Delete project" button.

When the user clicks the delete button, a confirmation dialog SHALL appear. The dialog SHALL require the user to type the exact project name into a text input before the delete action is enabled. The confirmation button SHALL remain disabled until the typed text matches the project title exactly (case-sensitive).

Upon confirmation, the system SHALL call `DELETE /api/projects/:id` to soft-delete the project with cascading deletes to connections and MCP tokens. On success, the user SHALL be redirected to the root project list (`/`) and a success toast SHALL be shown. On failure, an error toast SHALL be displayed and the dialog SHALL remain open.

#### Scenario: Delete button appears in danger zone

- **WHEN** the user opens the settings page for a project
- **THEN** a "Danger Zone" card is displayed below all other settings cards
- **AND** the card contains a destructive "Delete project" button

#### Scenario: Confirmation dialog requires project name

- **WHEN** the user clicks "Delete project"
- **THEN** a confirmation dialog appears asking the user to type the project name
- **AND** the confirm button is disabled until the input matches the project title exactly

#### Scenario: Successful project deletion

- **WHEN** the user types the correct project name and confirms deletion
- **THEN** the project is soft-deleted via `DELETE /api/projects/:id`
- **AND** the user is redirected to `/`
- **AND** a success toast is displayed

#### Scenario: Failed project deletion

- **WHEN** the delete API call fails
- **THEN** an error toast is displayed with the failure reason
- **AND** the dialog remains open for retry
