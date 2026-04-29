## ADDED Requirements

### Requirement: Distinct Tool Names Endpoint

The API SHALL expose a `GET /api/projects/:projectId/mcp-logs/tools` endpoint that returns the distinct non-null `toolName` values found in the project's `McpCallLog` collection, sorted alphabetically, as a JSON array of strings. The endpoint SHALL require admin session authentication.

#### Scenario: Returns distinct tool names

- **WHEN** `GET /api/projects/:projectId/mcp-logs/tools` is called for a project with logs containing `execute_query`, `execute_query`, `get_semantic_model`, and a `tools/list` call (`toolName: null`)
- **THEN** the response is `["execute_query", "get_semantic_model"]`

#### Scenario: Empty project returns empty array

- **WHEN** `GET /api/projects/:projectId/mcp-logs/tools` is called for a project with no logs
- **THEN** the response is `[]`
- **AND** the status code is 200

#### Scenario: Unauthenticated request is rejected

- **WHEN** `GET /api/projects/:projectId/mcp-logs/tools` is called without a valid admin session
- **THEN** a 401 response is returned

## MODIFIED Requirements

### Requirement: MCP Call Log UI

The monitoring page at `/:projectId/monitoring` SHALL display a table of MCP call log entries for the current project using the same Card > Table layout as the MCP Access page but with more vertically condensed rows. The table SHALL show columns: timestamp, token name, method/tool name, duration, and status (success/error badge). Clicking a row SHALL open a detail view showing the full input arguments as formatted JSON and the full output content rendered as markdown. The page SHALL support pagination and provide a refresh button. The page SHALL default to showing only `tools/call` entries, with a toggle to include `tools/list` entries.

The page SHALL render a filter bar directly above the table (using the project's inline filter convention — `.filter-trigger` styling, `flex items-center gap-1.5`) with the following controls, in order: a Tool selector populated from the project's distinct tool names (`GET /mcp-logs/tools`), a Status selector with options `All` / `Success` / `Error`, a Token selector populated from the project's active MCP tokens, and a date range picker composed of a shadcn `Popover` + `Calendar` (`mode="range"`) presenting two calendar inputs for start and end date. When at least one filter is active, a ghost icon `X` button SHALL appear to clear all filters. Changing any filter SHALL reset pagination to page 1 and refetch the table.

The Status selector SHALL map to the API as: `All` → no `errorOnly` param, `Success` → `errorOnly=false` (filter excludes `isError: true`), `Error` → `errorOnly=true`. The date range SHALL map to `from` (start-of-day UTC of the selected start date) and `to` (end-of-day UTC of the selected end date) so both endpoints are inclusive.

The detail view SHALL include a "Refine" button when the log entry is a `tools/call` entry and a semantic model name can be extracted from the input arguments (`inputArgs.modelName`). The "Refine" button SHALL navigate to `/$projectId/models/chat/new` with a `prefill` search parameter containing a prompt that describes the MCP call context (tool name, input arguments, output or error content) and instructs the semantic model agent to improve the model's navigability — ai_context descriptions, naming, relationships, and structure. The button SHALL use an outline style with a wand icon, matching the Refine button in the test run detail page.

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

#### Scenario: Empty state with no logs

- **WHEN** the project has no MCP call logs and no filters are active
- **THEN** the table shows an empty state message indicating no calls have been recorded yet

#### Scenario: Empty state with active filters

- **WHEN** filters are applied that match no log entries
- **THEN** the table shows an empty state message indicating no logs match the current filters
- **AND** a "Clear filters" button is shown that resets every filter to its default value

#### Scenario: Filter by tool

- **WHEN** the user selects `execute_query` from the Tool selector
- **THEN** the table refetches with `toolName=execute_query` and shows only matching entries
- **AND** the page is reset to 1

#### Scenario: Filter by status

- **WHEN** the user selects `Error` from the Status selector
- **THEN** the table refetches with `errorOnly=true` and shows only error entries
- **AND** the page is reset to 1

#### Scenario: Filter by token

- **WHEN** the user selects a specific token from the Token selector
- **THEN** the table refetches with `tokenId=<id>` and shows only entries for that token
- **AND** the page is reset to 1

#### Scenario: Filter by date range

- **WHEN** the user picks a start date and an end date in the date range picker and confirms
- **THEN** the table refetches with `from=<start-of-day-UTC>` and `to=<end-of-day-UTC>` ISO strings
- **AND** only entries within the inclusive range are shown
- **AND** the page is reset to 1

#### Scenario: Clear filters

- **WHEN** at least one filter is active and the user clicks the clear-all `X` button
- **THEN** every filter resets to its default value
- **AND** the table refetches without any filter query parameters

#### Scenario: Refine model from log detail

- **WHEN** the user opens a log detail sheet for a `tools/call` entry
- **AND** the entry's `inputArgs` contain a `modelName` field
- **THEN** a "Refine" button with a wand icon is displayed below the output/error sections
- **AND** clicking the button navigates to `/$projectId/models/chat/new?prefill=<prompt>`
- **AND** the prefill prompt includes the tool name, input arguments, output or error content, and instructions to improve the semantic model

#### Scenario: Refine button hidden for tools/list entries

- **WHEN** the user opens a log detail sheet for a `tools/list` entry
- **THEN** no "Refine" button is displayed

#### Scenario: Refine button hidden when no model name available

- **WHEN** the user opens a log detail sheet for a `tools/call` entry
- **AND** the entry's `inputArgs` do not contain a `modelName` field
- **THEN** no "Refine" button is displayed
