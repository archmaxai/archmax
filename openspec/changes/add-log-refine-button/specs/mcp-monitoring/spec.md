## MODIFIED Requirements
### Requirement: MCP Call Log UI
The monitoring page at `/:projectId/monitoring` SHALL display a table of MCP call log entries for the current project using the same Card > Table layout as the MCP Access page but with more vertically condensed rows. The table SHALL show columns: timestamp, token name, method/tool name, duration, and status (success/error badge). Clicking a row SHALL open a detail view showing the full input arguments as formatted JSON and the full output content rendered as markdown. The page SHALL support pagination and provide a refresh button. The page SHALL default to showing only `tools/call` entries, with a toggle to include `tools/list` entries.

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

#### Scenario: Empty state
- **WHEN** the project has no MCP call logs
- **THEN** the table shows an empty state message indicating no calls have been recorded yet

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
