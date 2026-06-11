## MODIFIED Requirements

### Requirement: DuckDB Console Page

The frontend SHALL render the federation console inside a full-width/full-height overlay dialog opened from the Data Sources page header (icon-only Console button, or deep link `/$projectId/connections?tool=console`). The previous standalone route `/$projectId/connections/console` SHALL redirect to `/$projectId/connections?tool=console`. The Console SHALL NOT appear as a sidebar navigation item.

The console SHALL present a **single SQL editor** (textarea is sufficient) and a **Run** control in the dialog header. Run SHALL route the submitted statement based on its leading keyword:

- Statements beginning with `INSTALL` or `LOAD` SHALL be submitted to `POST .../duckdb-console/extensions`; on success a `toast.success` SHALL confirm the loaded extension.
- All other statements SHALL be submitted to `POST .../duckdb-console/query` and the results rendered in a table with column headers.

The console SHALL NOT render a separate setup-commands panel or a separate extension-install control; the one editor serves both purposes. The console MAY load `GET .../duckdb-console/setup` to determine whether the project has active connections.

When the project has no active connections, the console SHALL show an empty state directing the user to add connections on the Data Sources page, and the **Run** control SHALL be disabled.

#### Scenario: Run query from console

- **WHEN** the user enters `SELECT 1` and clicks **Run**
- **THEN** the results table shows one row
- **AND** a success toast is not shown for query success (results are sufficient); errors use `toast.error` with the server message

#### Scenario: Install extension from the same editor

- **WHEN** the user enters `INSTALL spatial FROM community` and clicks **Run**
- **THEN** the statement is sent to the extensions endpoint
- **AND** a `toast.success` confirms the extension was loaded

#### Scenario: Open console from the Data Sources header

- **WHEN** the user clicks the icon-only Console button on the Data Sources page
- **THEN** the console opens in a full-width/full-height overlay dialog with shadow
- **AND** the URL search params include `tool=console`

#### Scenario: Legacy console route redirects

- **WHEN** the user navigates to `/<projectId>/connections/console`
- **THEN** they are redirected to `/<projectId>/connections?tool=console`
- **AND** the Console dialog opens automatically
