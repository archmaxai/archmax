## MODIFIED Requirements

### Requirement: Edit Connection

The page SHALL allow editing an existing connection. The user can update the name, type, connection config, description, and active status. The password field SHALL be write-only: it is always shown as empty when editing, and the form SHALL only include password in the request payload when the user explicitly enters a new value.

#### Scenario: Edit connection config
- **WHEN** the user modifies a connection's host and saves
- **THEN** a PUT request is sent to `/api/projects/:projectId/connections/:id`
- **AND** the updated connection is reflected in the list

#### Scenario: Edit without changing password
- **WHEN** the user edits a connection without entering a new password
- **THEN** the PUT request omits the password field (or sends empty)
- **AND** the server preserves the existing stored password

#### Scenario: Edit with new password
- **WHEN** the user enters a new password in the edit form and saves
- **THEN** the PUT request includes the new password
- **AND** the server updates the stored password to the new value
