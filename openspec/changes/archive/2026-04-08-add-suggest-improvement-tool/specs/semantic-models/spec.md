## ADDED Requirements

### Requirement: Improvement Model

The system SHALL provide an `Improvement` Mongoose model stored in MongoDB for tracking improvement suggestions submitted via MCP. Each document SHALL contain: `project` (ObjectId reference to Project, required), `modelName` (string, required — the semantic model the suggestion targets), `title` (string, required, max 200 characters), `description` (string, required, max 2000 characters), `status` (enum: `pending` | `implemented`, default `pending`), `implementedAt` (Date, optional — set when status transitions to `implemented`), and `createdVia` (string — the MCP token name that submitted the suggestion). The model SHALL use the shared `softDeletePlugin` and Mongoose timestamps.

#### Scenario: Improvement created via MCP

- **WHEN** an MCP client submits a suggestion for model `ecommerce`
- **THEN** an `Improvement` document is created with `status: "pending"`, `modelName: "ecommerce"`, timestamps, and `createdVia` set to the token name

#### Scenario: Improvement marked as implemented

- **WHEN** an admin clicks "Implement" in the frontend
- **THEN** the improvement's `status` is set to `implemented` and `implementedAt` is set to the current timestamp

#### Scenario: Soft delete

- **WHEN** an improvement is soft-deleted
- **THEN** it no longer appears in default queries but remains in the database

### Requirement: Improvement API Endpoints

The API SHALL expose endpoints under `/api/projects/:projectId/improvements` for managing improvement suggestions. The endpoints SHALL be protected by session-based admin auth (consistent with other project-scoped routes).

- `GET /` — List improvements for the project, with optional `modelName` and `status` query filters, sorted by `createdAt` descending
- `GET /:id` — Get a single improvement by ID
- `PATCH /:id/implement` — Transition an improvement to `implemented` status, setting `implementedAt` to the current time

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

### Requirement: Improvements UI in Semantic Models Sidebar

The Semantic Models page sidebar SHALL include an "Improvements" accordion section below the "History" section. The section SHALL display all improvement suggestions for the project, grouped or filterable by model. Each item SHALL show a lightbulb icon, the truncated title, and a checkmark overlay if the improvement has been implemented. Clicking an improvement SHALL navigate to a detail view in the main content area.

#### Scenario: Sidebar shows pending improvements

- **WHEN** the user views the Semantic Models page and there are 3 pending improvements
- **THEN** the "Improvements" accordion section shows 3 items with lightbulb icons and no checkmarks

#### Scenario: Sidebar shows implemented improvements

- **WHEN** an improvement has status `implemented`
- **THEN** it appears in the sidebar with a checkmark icon overlay

#### Scenario: Empty state

- **WHEN** there are no improvements for the project
- **THEN** the "Improvements" section shows a message: "No improvement suggestions yet"

### Requirement: Improvement Detail View

When an improvement is selected from the sidebar, the main content area SHALL display the improvement's title, description, target model name, creation date, and the MCP token name that submitted it (`createdVia`). A prominent "Implement" button SHALL appear at the top of the view. Clicking "Implement" SHALL mark the improvement as implemented (via `PATCH /implement`) and navigate to a new chat with the improvement's description pre-filled in the message input textarea. The user still needs to manually submit the message.

#### Scenario: View improvement detail

- **WHEN** the user clicks on an improvement titled "Missing shipping_address field"
- **THEN** the main content area displays the title, full description, model name "ecommerce", creation date, and token name

#### Scenario: Implement improvement

- **WHEN** the user clicks "Implement" on a pending improvement
- **THEN** the improvement is marked as `implemented` (API call)
- **AND** the user is navigated to a new chat at `/$projectId/models/chat/new`
- **AND** the chat message input is pre-filled with the improvement's description
- **AND** the user must still click send to submit

#### Scenario: Already implemented

- **WHEN** the user views an improvement that is already `implemented`
- **THEN** the "Implement" button is replaced with a "Implemented" badge showing the implementation date
