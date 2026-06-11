## RENAMED Requirements

- FROM: `### Requirement: Re-explore Schemas Control`
- TO: `### Requirement: Re-initialize Schemas Control`

## MODIFIED Requirements

### Requirement: Re-initialize Schemas Control

The Data Sources page header SHALL display an icon-only "Re-initialize schemas" button (refresh icon with a tooltip/`title` of "Re-initialize schemas") alongside the other header tools and the "New Connection" button. Activating the button SHALL trigger a project-wide refresh that invalidates the cached DuckDB instance and re-attaches every active connection so the data browser, semantic-model agent, and MCP tools observe the current upstream schema. While the refresh is in flight, the button SHALL be disabled and display a loading spinner. On success, the page SHALL show a success toast including the number of tables visible after the refresh (e.g. `Schemas refreshed — 42 tables visible`) and SHALL invalidate the cached connection list query. On failure, the page SHALL show an error toast containing the server-provided error message. When the project has no connections, the button SHALL be disabled.

#### Scenario: Refresh schemas with attached connections

- **WHEN** the user clicks the icon-only "Re-initialize schemas" button on a project that has at least one active connection
- **THEN** a `POST` request is sent to `/api/projects/:projectId/connections/reinit`
- **AND** while the request is pending the button is disabled and shows a spinner
- **AND** on a successful response `{ ok: true, tableCount: N }` a success toast displays `Schemas refreshed — N tables visible`
- **AND** the `["connections", projectId]` query cache is invalidated

#### Scenario: Refresh fails when a connection is unreachable

- **WHEN** the user clicks "Re-initialize schemas" and the server returns `{ ok: false, error: "..." }` with HTTP 400
- **THEN** an error toast displays the server-provided error message
- **AND** the button returns to its idle state

#### Scenario: Button disabled when there are no connections

- **WHEN** the project has no active connections
- **THEN** the "Re-initialize schemas" button is rendered in a disabled state so it cannot be activated

#### Scenario: Icon-only button exposes its label accessibly

- **WHEN** the "Re-initialize schemas" button is rendered
- **THEN** it shows only an icon (no text label)
- **AND** its accessible name ("Re-initialize schemas") is available via tooltip/`title`/`aria-label`

## ADDED Requirements

### Requirement: Data Sources Header Tools

The Data Sources page header SHALL display, alongside the "New Connection" button and the "Re-initialize schemas" control, two tool buttons: **Browser** (icon plus the text label "Browser") and **Console** (icon-only, with a tooltip/accessible name of "Console").

Clicking Browser SHALL open the data browser, and clicking Console SHALL open the DuckDB federation console, each in a **full-width/full-height overlay dialog**: a modal surface sized to (near) the full viewport, with a drop shadow and a visible close control. The dialogs SHALL use the standard overlay background (`bg-popover` page-grey per the UI surface hierarchy).

The page SHALL support a `tool` search parameter on `/$projectId/connections`: `?tool=browser` opens the Browser dialog and `?tool=console` opens the Console dialog on page load. Opening or closing a dialog SHALL update/clear the `tool` search param so the dialogs are deep-linkable. Closing a dialog returns the user to the Data Sources page state.

#### Scenario: Open the data browser from the header

- **WHEN** the user clicks the "Browser" button in the Data Sources page header
- **THEN** a full-width/full-height overlay dialog with shadow opens containing the data browser
- **AND** the URL search params include `tool=browser`

#### Scenario: Open the console from the header

- **WHEN** the user clicks the icon-only Console button
- **THEN** a full-width/full-height overlay dialog with shadow opens containing the DuckDB console
- **AND** the URL search params include `tool=console`

#### Scenario: Close a tool dialog

- **WHEN** the user closes the Browser or Console dialog
- **THEN** the dialog is dismissed and the Data Sources page is visible again
- **AND** the `tool` search param is cleared

#### Scenario: Deep link opens the dialog

- **WHEN** the user navigates directly to `/<projectId>/connections?tool=console`
- **THEN** the Data Sources page renders with the Console dialog already open
