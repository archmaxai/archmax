## ADDED Requirements

### Requirement: Project Settings UI

The settings page (`/$projectId/settings`) SHALL display a "Project Identity" card that allows editing the project's `title` and `slug`. The card SHALL appear above the existing settings cards.

The title field SHALL be a text input pre-filled with the current project title. On blur or Enter, the system SHALL save the updated title via the project update API.

The slug field SHALL be a text input pre-filled with the current project slug. It SHALL be validated client-side against the pattern `^[a-z0-9][a-z0-9-]*[a-z0-9]$` (minimum 2 characters). On blur or Enter, the system SHALL save the updated slug via the project update API if valid.

When the title is changed, the slug field SHALL display an auto-generated slug suggestion (derived from the new title), but the user MAY override it before saving.

The MCP Items Per Page input SHALL NOT render browser-native spinner buttons (up/down arrows). The input SHALL accept only numeric values and behave as a plain text field with numeric constraints.

#### Scenario: Edit project title

- **WHEN** the user changes the title field to "My New Name" and presses Enter
- **THEN** a PUT request updates the project title
- **AND** the sidebar project selector reflects the new name

#### Scenario: Edit project slug

- **WHEN** the user changes the slug field to "my-new-slug" and blurs the input
- **THEN** a PUT request updates the project slug if the format is valid and the slug is unique

#### Scenario: Invalid slug rejected client-side

- **WHEN** the user enters a slug with uppercase letters or special characters (e.g. "My Slug!")
- **THEN** the input shows a validation error
- **AND** the value is not submitted to the API

#### Scenario: Title change suggests new slug

- **WHEN** the user edits the title from "Old Name" to "New Name"
- **THEN** the slug field updates to "new-name" as a suggestion
- **AND** the user can accept or further edit the slug before saving

#### Scenario: MCP page size input has no spinner buttons

- **WHEN** the settings page renders the MCP Items Per Page input
- **THEN** no browser-native increment/decrement spinner arrows are visible
- **AND** the input still accepts numeric values via keyboard
