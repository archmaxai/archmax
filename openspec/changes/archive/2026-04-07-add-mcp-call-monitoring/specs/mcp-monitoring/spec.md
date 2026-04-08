## ADDED Requirements

### Requirement: MCP Call Log Persistence
The system SHALL persist a log entry for every MCP request (both `tools/list` and `tools/call`) to the `McpCallLog` MongoDB collection. Each entry SHALL include: project reference, token ID and name, JSON-RPC method, tool name (if applicable), full input arguments, full output content (the text returned to the agent), duration in milliseconds, error status, error message (if applicable), client IP, and creation timestamp. Log writes SHALL be fire-and-forget so they never delay the MCP response.

#### Scenario: Successful tool call is logged with input and output
- **WHEN** an MCP `tools/call` request completes successfully
- **THEN** an `McpCallLog` document is created with `isError: false`, the tool name, full `inputArgs`, full `outputContent` (the text content from the MCP result), and `durationMs`

#### Scenario: Failed tool call is logged with input and output
- **WHEN** an MCP `tools/call` request returns an error or throws
- **THEN** an `McpCallLog` document is created with `isError: true`, the `errorMessage` field populated, the full `inputArgs`, and the `outputContent` containing the error response text

#### Scenario: tools/list call is logged
- **WHEN** an MCP `tools/list` request is received
- **THEN** an `McpCallLog` document is created with `method: "tools/list"`, `toolName: null`, and `outputContent` containing the serialized tool list

#### Scenario: Log write failure does not affect MCP response
- **WHEN** the log write to MongoDB fails
- **THEN** the error is logged to stderr
- **AND** the original MCP response is unaffected

### Requirement: MCP Call Log API
The API SHALL expose a `GET /api/projects/:projectId/mcp-logs` endpoint that returns paginated MCP call log entries for the given project, sorted by newest first. The endpoint SHALL support query parameters: `page` (default 1), `limit` (default 50, max 200), `toolName` (filter by tool), `tokenId` (filter by token), `errorOnly` (boolean, show only errors), `from` and `to` (ISO date range filter on `createdAt`). The endpoint SHALL require admin session authentication.

#### Scenario: Fetch recent logs with default pagination
- **WHEN** `GET /api/projects/:projectId/mcp-logs` is called without query parameters
- **THEN** the 50 most recent log entries for the project are returned, sorted newest first
- **AND** the response includes `total` count and `page`/`limit` metadata

#### Scenario: Filter logs by tool name
- **WHEN** `GET /api/projects/:projectId/mcp-logs?toolName=get_semantic_model_overview` is called
- **THEN** only log entries where `toolName` matches are returned

#### Scenario: Filter error-only logs
- **WHEN** `GET /api/projects/:projectId/mcp-logs?errorOnly=true` is called
- **THEN** only log entries where `isError` is `true` are returned

#### Scenario: Filter by date range
- **WHEN** `GET /api/projects/:projectId/mcp-logs?from=2026-04-01&to=2026-04-07` is called
- **THEN** only log entries with `createdAt` within the specified range are returned

#### Scenario: Unauthenticated request is rejected
- **WHEN** `GET /api/projects/:projectId/mcp-logs` is called without a valid admin session
- **THEN** a 401 response is returned

### Requirement: MCP Call Log UI
The monitoring page at `/:projectId/monitoring` SHALL display a table of MCP call log entries for the current project using the same Card > Table layout as the MCP Access page but with more vertically condensed rows. The table SHALL show columns: timestamp, token name, method/tool name, duration, and status (success/error badge). Clicking a row SHALL open a detail view showing the full input arguments as formatted JSON and the full output content rendered as markdown. The page SHALL support pagination and provide a refresh button. The page SHALL default to showing only `tools/call` entries, with a toggle to include `tools/list` entries.

#### Scenario: View call log table
- **WHEN** the user navigates to `/:projectId/monitoring`
- **THEN** a table of MCP call log entries is displayed inside a Card with columns: timestamp, token name, tool, duration, status
- **AND** entries are sorted newest first
- **AND** rows are vertically condensed compared to the MCP Access tokens table

#### Scenario: View full output on row click
- **WHEN** the user clicks a row in the call log table
- **THEN** a detail view opens showing the full input arguments as formatted JSON and the full output content as rendered markdown

#### Scenario: Paginate through logs
- **WHEN** the user clicks the next/previous page controls
- **THEN** the table fetches and displays the corresponding page of results

#### Scenario: Refresh logs
- **WHEN** the user clicks the refresh button
- **THEN** the current page of logs is re-fetched from the API

#### Scenario: Toggle tools/list visibility
- **WHEN** the user enables the "Show list calls" toggle
- **THEN** `tools/list` entries are included in the table alongside `tools/call` entries

#### Scenario: Empty state
- **WHEN** the project has no MCP call logs
- **THEN** the table shows an empty state message indicating no calls have been recorded yet
