# mcp-token-management Specification

## Purpose
TBD - created by archiving change add-mcp-token-management. Update Purpose after archive.
## Requirements
### Requirement: McpToken Model

The system SHALL provide an `McpToken` Mongoose model with the following fields: `name` (string, required), `tokenHash` (string, required, indexed), `project` (ObjectId ref to Project, required, indexed), `scopes` (array of strings — semantic model names the token grants access to), `expiresAt` (Date, optional — null means no expiry), `lastUsedAt` (Date, optional), `deleted` (boolean, default false), `deletedAt` (Date, optional), `createdAt` (Date), `updatedAt` (Date). The model SHALL use the shared soft-delete plugin.

#### Scenario: Create a token scoped to one model

- **WHEN** an McpToken is created with `name: "CI Agent"`, `project: "<projectId>"`, `scopes: ["shopify"]`
- **THEN** the token is persisted with the hashed token value and the given scopes

#### Scenario: Create a token with no expiry

- **WHEN** an McpToken is created with `expiresAt: null`
- **THEN** the token never expires and is valid indefinitely until revoked

#### Scenario: Create a token with expiry

- **WHEN** an McpToken is created with `expiresAt: "2026-12-31T00:00:00Z"`
- **THEN** the token is valid until the specified date and rejected after

#### Scenario: Soft-delete revokes a token

- **WHEN** an McpToken is soft-deleted
- **THEN** the token's `deleted` flag is set to true
- **AND** the token is no longer accepted for MCP authentication

### Requirement: Token Hashing

The system SHALL hash MCP tokens with SHA-256 before storage. The raw token SHALL be generated as a cryptographically random 32-byte hex string, prefixed with `sml_` for easy identification. The raw token SHALL be returned exactly once in the creation response and never retrievable again.

#### Scenario: Token created and displayed once

- **WHEN** a new MCP token is created via the API
- **THEN** the response includes the raw token value (e.g. `sml_a1b2c3...`)
- **AND** only the SHA-256 hash is stored in the database
- **AND** subsequent GET requests return the token name, scopes, and metadata but never the raw token

### Requirement: Token CRUD API

The API SHALL expose CRUD endpoints for MCP tokens at `/api/projects/:projectId/mcp-tokens`:

- `GET /` — List all non-deleted tokens for the project (name, scopes, expiresAt, lastUsedAt, createdAt; never the hash)
- `POST /` — Create a new token (accepts name, scopes, expiresAt; returns the raw token once)
- `DELETE /:tokenId` — Soft-delete (revoke) a token

All endpoints SHALL require admin session auth (same as other `/api/*` routes).

#### Scenario: List tokens for a project

- **WHEN** a GET request is made to `/api/projects/:projectId/mcp-tokens`
- **THEN** all non-deleted tokens for the project are returned with name, scopes, expiresAt, lastUsedAt, and createdAt
- **AND** the tokenHash field is never included in the response

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
2. **Token list** — A table of all active tokens showing: name, scopes (as badges), expiry status, last used date, and a revoke button
3. **Create token dialog** — A form to create a new token with fields: name, scope selection (multi-select from available semantic models), and expiry option (never / custom date)
4. **Token reveal** — After creation, a one-time display of the raw token with a copy button and a warning that it cannot be shown again

#### Scenario: View MCP endpoint URL

- **WHEN** the user navigates to the MCP Access page
- **THEN** the project's full MCP endpoint URL is displayed
- **AND** a copy-to-clipboard button is available next to it

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

### Requirement: MCP Token Lifecycle E2E Coverage

The E2E test suite SHALL verify the full MCP token lifecycle through the UI and MCP endpoint: creation via the MCP Access page, usage as a bearer token for MCP authentication, and revocation via the UI. The test SHALL navigate to the MCP Access page, create a token through the Create Token dialog (filling name, selecting scopes, submitting), extract the raw token from the one-time reveal dialog, use the token for MCP requests, then revoke it through the UI by clicking the trash icon and confirming in the revoke dialog.

#### Scenario: Token creation through the UI

- **WHEN** the user navigates to the MCP Access page
- **AND** clicks "Create Token", fills in a name, selects the `e2e_federation` scope, and submits
- **THEN** the reveal dialog appears showing the raw token (prefixed with `sml_`)
- **AND** the token appears in the token list table after the dialog is closed
- **AND** the raw token can be used as a bearer token to authenticate MCP requests at `/mcp/:slug/mcp`

#### Scenario: Token revocation through the UI

- **WHEN** the user clicks the revoke button on a token row in the MCP Access page
- **AND** confirms in the revoke dialog
- **THEN** the token disappears from the token list
- **AND** subsequent MCP requests using the revoked token return a 401 error

#### Scenario: No token returns 401

- **WHEN** an MCP request is sent without an `Authorization` header
- **THEN** the MCP endpoint returns a 401 error

#### Scenario: Invalid token returns 401

- **WHEN** an MCP request is sent with `Authorization: Bearer invalid_garbage_value`
- **THEN** the MCP endpoint returns a 401 error

