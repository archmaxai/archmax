## ADDED Requirements

### Requirement: Dashboard Stats API

The system SHALL provide a `GET /api/projects/:projectId/dashboard-stats` endpoint that returns aggregate statistics for the project in a single response. The response SHALL include:
- `connections.total` — count of non-deleted connections
- `connections.totalQueries` — count of MCP call log entries where `toolName` is `execute_query` or `execute_stored_query` within the stats window
- `semanticModels.total` — count of semantic model files
- `semanticModels.openImprovements` — count of improvement requests with status `pending`
- `semanticModels.totalDatasets` — total count of datasets across all models
- `mcpAccess.tokens` — count of non-deleted MCP tokens
- `mcpAccess.totalCalls` — count of MCP call log entries within the stats window
- `mcpAccess.errorCalls` — count of MCP call log entries with `isError: true` within the stats window
- `mcpAccess.callsByDay` — array of `{ date, calls, errors }` objects for each day in the stats window, with zero-filled gaps

The stats window SHALL default to 14 days and MAY be overridden via a `days` query parameter (integer, 1–90).

#### Scenario: Stats for a populated project

- **WHEN** a `GET /api/projects/:projectId/dashboard-stats` request is made for a project with 3 connections, 2 semantic models (containing 15 total datasets), 1 open improvement, 2 MCP tokens, 50 calls (3 errors, 42 queries) in the last 14 days
- **THEN** the response is `{ connections: { total: 3, totalQueries: 42 }, semanticModels: { total: 2, openImprovements: 1, totalDatasets: 15 }, mcpAccess: { tokens: 2, totalCalls: 50, errorCalls: 3, callsByDay: [...] } }`

#### Scenario: Stats for an empty project

- **WHEN** a `GET /api/projects/:projectId/dashboard-stats` request is made for a project with no connections, models, or tokens
- **THEN** all counts are 0 and `callsByDay` contains zero-filled entries for every day in the window

#### Scenario: Custom stats window

- **WHEN** the request includes `?days=1`
- **THEN** MCP call, error, and query counts reflect only the last 24 hours, and `callsByDay` contains a single day

### Requirement: Dashboard Page

The system SHALL render a project-scoped dashboard at `/$projectId` showing metric cards for each major feature area. Each card SHALL display the primary count prominently and link to the corresponding detail page.

The dashboard SHALL display three metric cards followed by an MCP calls chart:
1. **Data Connections** — executed query count (14d) as the primary value, with total connection count as a sub-stat; links to `/$projectId/connections`
2. **Semantic Models** — total model count as the primary value, with sub-stats for total datasets and open improvement requests; links to `/$projectId/models`
3. **MCP Access** — total MCP call count (14d) as the primary value, with sub-stats for token count and error calls; links to `/$projectId/mcp-access`
4. **MCP Calls Chart** — a full-width area chart showing calls and errors per day over the last 14 days, using CI colors (sage for calls, purple for errors). When there is no data, a centered empty-state message is shown instead.

All three metric cards SHALL use the CI color palette for their icon styling: sage (`#8c987f`) for the icon stroke and blue (`#c2d0e4`) at reduced opacity for the icon background.

#### Scenario: Dashboard with populated data

- **WHEN** an authenticated user navigates to `/$projectId`
- **THEN** three metric cards are displayed with current counts
- **AND** each card is clickable, navigating to its detail page

#### Scenario: Dashboard loading state

- **WHEN** the dashboard stats are being fetched
- **THEN** skeleton placeholders are shown in place of the metric cards

### Requirement: Dashboard Onboarding Flow

When a project has incomplete setup, the dashboard SHALL guide the user through a progressive onboarding flow instead of (or in addition to) showing empty metric cards.

The onboarding flow SHALL present three steps in order:
1. **Create a data connection** — active when the project has 0 connections; call-to-action links to `/$projectId/connections`
2. **Create a semantic model** — active when connections exist but 0 semantic models; call-to-action links to `/$projectId/models`
3. **Try it via MCP** — active when models exist but 0 MCP tokens; call-to-action links to `/$projectId/mcp-access`

Each completed step SHALL be visually marked as done (e.g., checkmark). The current step SHALL be visually prominent. Future steps SHALL appear as upcoming/locked.

#### Scenario: Empty project shows step 1

- **WHEN** a project has 0 connections, 0 models, and 0 tokens
- **THEN** the dashboard shows the onboarding flow with step 1 ("Create a data connection") as the active step
- **AND** steps 2 and 3 are shown as upcoming

#### Scenario: Connections exist, no models

- **WHEN** a project has connections but 0 models and 0 tokens
- **THEN** step 1 is marked as complete
- **AND** step 2 ("Create a semantic model") is the active step

#### Scenario: Models exist, no tokens

- **WHEN** a project has connections and models but 0 tokens
- **THEN** steps 1 and 2 are marked as complete
- **AND** step 3 ("Try it via MCP") is the active step

#### Scenario: All steps complete

- **WHEN** a project has connections, models, and tokens
- **THEN** the onboarding flow is not shown
- **AND** the full metric card dashboard is displayed

