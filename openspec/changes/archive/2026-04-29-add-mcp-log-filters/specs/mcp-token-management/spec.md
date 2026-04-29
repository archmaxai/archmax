## MODIFIED Requirements

### Requirement: Token CRUD API

The API SHALL expose CRUD endpoints for MCP tokens at `/api/projects/:projectId/mcp-tokens`:

- `GET /` — List all non-deleted tokens for the project (name, scopes, expiresAt, lastUsedAt, createdAt, eventCount30d; never the hash). Each item SHALL include `eventCount30d: number`, the count of `McpCallLog` entries for that token in the last 30 days (server-clock time), computed via a single aggregation. Tokens with no recorded calls in the window return `0`.
- `POST /` — Create a new token (accepts name, scopes, expiresAt; returns the raw token once)
- `DELETE /:tokenId` — Soft-delete (revoke) a token

All endpoints SHALL require admin session auth (same as other `/api/*` routes).

#### Scenario: List tokens for a project

- **WHEN** a GET request is made to `/api/projects/:projectId/mcp-tokens`
- **THEN** all non-deleted tokens for the project are returned with name, scopes, expiresAt, lastUsedAt, createdAt, and eventCount30d
- **AND** the tokenHash field is never included in the response

#### Scenario: eventCount30d reflects last 30 days only

- **WHEN** a token has 3 `McpCallLog` entries within the last 30 days and 5 entries older than 30 days
- **AND** a GET request is made to `/api/projects/:projectId/mcp-tokens`
- **THEN** the token's `eventCount30d` is `3`

#### Scenario: eventCount30d is zero for unused tokens

- **WHEN** a token has no `McpCallLog` entries
- **AND** a GET request is made to `/api/projects/:projectId/mcp-tokens`
- **THEN** the token's `eventCount30d` is `0`

#### Scenario: Create a token

- **WHEN** a POST request is made with `{ name: "Dev Agent", scopes: ["shopify", "datev"], expiresAt: null }`
- **THEN** the token is created and the response includes the raw token string (shown once)
- **AND** the response status is 201

#### Scenario: Revoke a token

- **WHEN** a DELETE request is made to `/api/projects/:projectId/mcp-tokens/:tokenId`
- **THEN** the token is soft-deleted
- **AND** subsequent MCP requests with that token are rejected with 401

#### Scenario: Create token with invalid scopes

- **WHEN** a POST request includes a scope name that doesn't match any semantic model in the project
- **THEN** a 400 error is returned indicating the invalid scope

### Requirement: MCP Access Management UI

The frontend SHALL provide an MCP Access page at `/:projectId/mcp-access` displaying:

1. **Endpoint info** — The project's MCP endpoint URL (`BASE_URL/mcp/:slug/mcp`) with a copy button
2. **Token list** — A table of all active tokens showing: name, scopes (as badges), expiry status, last used (relative time), events in the last 30 days, and a revoke button
3. **Create token dialog** — A form to create a new token with fields: name, scope selection (multi-select from available semantic models), and expiry option (never / custom date)
4. **Token reveal** — After creation, a one-time display of the raw token with a copy button and a warning that it cannot be shown again

The `Last Used` cell SHALL render as a relative-time string (e.g. "5 min ago", "2 hours ago", "3 days ago"), with a `Tooltip` on hover showing the absolute local timestamp including time-of-day. When `lastUsedAt` is null the cell SHALL show a muted em dash.

The `Events (30d)` cell SHALL render `eventCount30d` from the API as a tabular-nums number; the value `0` SHALL be rendered with `text-muted-foreground` styling so dormant tokens are visually distinct.

#### Scenario: View MCP endpoint URL

- **WHEN** the user navigates to the MCP Access page
- **THEN** the project's full MCP endpoint URL is displayed
- **AND** a copy-to-clipboard button is available next to it

#### Scenario: Token row shows relative last-used and 30-day event count

- **WHEN** the user views the token list
- **AND** a token has `lastUsedAt = 5 minutes ago` and `eventCount30d = 42`
- **THEN** the `Last Used` cell shows a relative label like "5 min ago"
- **AND** hovering the cell reveals a tooltip with the absolute local timestamp including the time-of-day
- **AND** the `Events (30d)` cell shows `42`

#### Scenario: Dormant token displays muted zero count

- **WHEN** a token has `eventCount30d = 0`
- **THEN** the `Events (30d)` cell shows `0` rendered with muted foreground styling

#### Scenario: Never-used token displays em dash

- **WHEN** a token has `lastUsedAt = null`
- **THEN** the `Last Used` cell shows a muted em dash
- **AND** no tooltip is shown

#### Scenario: Create and reveal a new token

- **WHEN** the user fills in the create token form and submits
- **THEN** a dialog shows the raw token with a copy button
- **AND** a warning states the token will not be shown again
- **AND** the token list refreshes to include the new token

#### Scenario: Revoke a token from the list

- **WHEN** the user clicks the revoke button on a token row
- **THEN** a confirmation dialog appears
- **AND** on confirm, the token is soft-deleted via the API
- **AND** the token disappears from the list

#### Scenario: Token with expired status

- **WHEN** a token's `expiresAt` is in the past
- **THEN** the token row shows an "Expired" badge
- **AND** the token is no longer accepted for MCP authentication

#### Scenario: Scope selection shows available models

- **WHEN** the user opens the create token dialog
- **THEN** the scope selector lists all semantic models in the current project
- **AND** the user can select one or more models to scope the token to
