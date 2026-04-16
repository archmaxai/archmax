## MODIFIED Requirements

### Requirement: Improvement API Endpoints

The API SHALL expose endpoints under `/api/projects/:projectId/improvements` for managing improvement suggestions. The endpoints SHALL be protected by session-based admin auth (consistent with other project-scoped routes).

- `GET /` — List improvements for the project, with optional `modelName` and `status` query filters, sorted by `createdAt` descending
- `GET /:id` — Get a single improvement by ID
- `PATCH /:id/implement` — Transition an improvement to `implemented` status, setting `implementedAt` to the current time
- `DELETE /:id` — Soft-delete an improvement, returning 200 on success

#### Scenario: List improvements filtered by model

- **WHEN** `GET /improvements?modelName=ecommerce` is called
- **THEN** only improvements targeting the `ecommerce` model are returned, sorted newest first

#### Scenario: List improvements filtered by status

- **WHEN** `GET /improvements?status=pending` is called
- **THEN** only pending improvements are returned

#### Scenario: Mark improvement as implemented

- **WHEN** `PATCH /improvements/:id/implement` is called for a pending improvement
- **THEN** the improvement's status becomes `implemented` and `implementedAt` is set
- **AND** the updated document is returned

#### Scenario: Get improvement not found

- **WHEN** `GET /improvements/:id` is called with a non-existent ID
- **THEN** a 404 error is returned

#### Scenario: Delete improvement

- **WHEN** `DELETE /improvements/:id` is called for an existing improvement
- **THEN** the improvement is soft-deleted and no longer appears in list queries
- **AND** a 200 response is returned

#### Scenario: Delete improvement not found

- **WHEN** `DELETE /improvements/:id` is called with a non-existent or already-deleted ID
- **THEN** a 404 error is returned

### Requirement: Improvements UI in Semantic Models Sidebar

The Semantic Models page sidebar SHALL include an "Improvements" accordion section below the "History" section. The section SHALL display all improvement suggestions for the project, grouped or filterable by model. Each item SHALL show a lightbulb icon, the truncated title, and a checkmark overlay if the improvement has been implemented. Clicking an improvement SHALL navigate to a detail view in the main content area. Each improvement row SHALL show a trash icon on hover that soft-deletes the improvement when clicked, matching the conversation row delete pattern.

#### Scenario: Sidebar shows pending improvements

- **WHEN** the user views the Semantic Models page and there are 3 pending improvements
- **THEN** the "Improvements" accordion section shows 3 items with lightbulb icons and no checkmarks

#### Scenario: Sidebar shows implemented improvements

- **WHEN** an improvement has status `implemented`
- **THEN** it appears in the sidebar with a checkmark icon overlay

#### Scenario: Empty state

- **WHEN** there are no improvements for the project
- **THEN** the "Improvements" section shows a message: "Improvement requests are submitted by MCP clients"

#### Scenario: Delete improvement from sidebar

- **WHEN** the user hovers over an improvement row and clicks the trash icon
- **THEN** the improvement is soft-deleted via the API and removed from the list
- **AND** if the deleted improvement was the active detail view, the user is navigated away

### Requirement: Improvement Detail View

When an improvement is selected from the sidebar, the main content area SHALL display the improvement's title, description, target model name, creation date, and the MCP token name that submitted it (`createdVia`). A prominent "Implement" button SHALL appear at the top of the view. Clicking "Implement" SHALL mark the improvement as implemented (via `PATCH /implement`) and navigate to a new chat with the improvement's description pre-filled in the message input textarea. The user still needs to manually submit the message. A delete action SHALL be available in the detail view header that soft-deletes the improvement and navigates the user away.

#### Scenario: View improvement detail

- **WHEN** the user clicks on an improvement titled "Missing shipping_address field"
- **THEN** the main content area displays the title, full description, model name "ecommerce", creation date, and token name

#### Scenario: Implement improvement

- **WHEN** the user clicks "Implement" on a pending improvement
- **THEN** the improvement is marked as `implemented` (API call)
- **AND** the user is navigated to a new chat at `/$projectId/models/chat/new`
- **AND** the chat message input is pre-filled with the improvement's description
- **AND** the user must still click send to submit

#### Scenario: Re-implement improvement

- **WHEN** the user clicks "Implement" on an already-implemented improvement
- **THEN** the user is navigated to a new chat with the description pre-filled (no status change needed)

#### Scenario: Delete improvement from detail view

- **WHEN** the user clicks the delete action in the improvement detail header
- **THEN** the improvement is soft-deleted via the API
- **AND** the user is navigated away from the detail view
- **AND** the sidebar list is refreshed
