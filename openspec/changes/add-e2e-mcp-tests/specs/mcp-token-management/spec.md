## ADDED Requirements

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
