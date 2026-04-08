## MODIFIED Requirements
### Requirement: Connection List View

The Data Connections page SHALL display a list of all connections for the selected project. Each connection shows its name, slug (monospace), type (badge), description, and active status.

#### Scenario: List connections for a project

- **WHEN** the user navigates to `/<projectId>/connections`
- **THEN** all non-deleted connections for that project are listed
- **AND** each connection displays its name, slug in monospace, type badge, and status

#### Scenario: Empty state

- **WHEN** a project has no connections
- **THEN** an empty state message is shown with a prompt to create the first connection

### Requirement: Create Connection

The page SHALL provide a button to create a new connection. Clicking it opens a form (dialog or inline) where the user enters connection details: name, slug (optional, auto-generated from name if empty), type (dropdown), connection config (host, port, database, user, password, or URI), and description.

#### Scenario: Create a new Postgres connection with explicit slug

- **WHEN** the user fills in the form with name "Shopify Production", slug "shopify_prod", type "postgres", and valid connection config
- **THEN** a POST request is sent to `/api/projects/:projectId/connections` with the provided slug
- **AND** on success, the new connection appears in the list

#### Scenario: Create with auto-generated slug

- **WHEN** the user fills in the form with name "My Analytics DB" and leaves the slug field empty
- **THEN** the slug field shows a preview of the auto-generated slug (e.g. `my_analytics_db`)
- **AND** the POST request includes the auto-generated slug

#### Scenario: Validation error on create

- **WHEN** the user submits the form with missing required fields or an invalid slug
- **THEN** validation errors are displayed inline

### Requirement: Edit Connection

The page SHALL allow editing an existing connection. The user can update the name, slug, type, connection config, description, and active status.

#### Scenario: Edit connection slug

- **WHEN** the user modifies a connection's slug and saves
- **THEN** a PUT request is sent to `/api/projects/:projectId/connections/:id`
- **AND** the updated connection is reflected in the list
