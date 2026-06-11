## MODIFIED Requirements

### Requirement: Dashboard Page

The system SHALL render a project-scoped dashboard at `/$projectId` showing metric cards for each major feature area. Each card SHALL display the primary count prominently and link to the corresponding detail page.

The dashboard SHALL display three metric cards followed by an MCP calls chart:
1. **Data Connections** — executed query count (14d) as the primary value, with total connection count as a sub-stat; links to `/$projectId/connections`
2. **Data Models** — total model count as the primary value, with sub-stats for total datasets and open improvement requests; links to `/$projectId/models` (card formerly labeled "Semantic Models")
3. **MCP Access** — total MCP call count (14d) as the primary value, with sub-stats for token count and error calls; links to `/$projectId/mcp-access`
4. **MCP Calls Chart** — a full-width area chart showing calls and errors per day over the last 14 days, using CI colors (sage for calls, purple for errors). When there is no data, a centered empty-state message is shown instead.

All three metric cards SHALL use the CI color palette for their icon styling: sage (`#8c987f`) for the icon stroke and blue (`#c2d0e4`) at reduced opacity for the icon background.

#### Scenario: Dashboard with populated data

- **WHEN** an authenticated user navigates to `/$projectId`
- **THEN** three metric cards are displayed with current counts
- **AND** each card is clickable, navigating to its detail page

#### Scenario: Data Models card label

- **WHEN** the dashboard renders the model metrics card
- **THEN** the card is labeled "Data Models" and links to `/$projectId/models`

#### Scenario: Dashboard loading state

- **WHEN** the dashboard stats are being fetched
- **THEN** skeleton placeholders are shown in place of the metric cards
