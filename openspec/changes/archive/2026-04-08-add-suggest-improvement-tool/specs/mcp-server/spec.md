## ADDED Requirements

### Requirement: MCP Suggest Improvement Tool

The MCP server SHALL expose a `suggest_improvement` tool that allows external clients to submit structured improvement suggestions for a semantic model. The tool SHALL accept `modelName` (string, required), `title` (string, required, max 200 characters), and `description` (string, required, max 2000 characters). The tool SHALL validate that the specified `modelName` exists within the token's accessible scope before persisting. The tool SHALL reject calls from read-only tokens with an error indicating insufficient permissions. On success, an `Improvement` document SHALL be created with status `pending` and the token's name recorded as `createdVia`. The tool SHALL be logged via `McpCallLog` consistent with other tools.

#### Scenario: Successful improvement suggestion

- **WHEN** `suggest_improvement` is called with `modelName: "ecommerce"`, `title: "Missing shipping_address field"`, `description: "The orders dataset is missing the shipping_address column which exists in the source table"`
- **AND** the token has write permission and `ecommerce` is in scope
- **THEN** an `Improvement` document is created with status `pending`, `modelName: "ecommerce"`, and `createdVia` set to the token's name
- **AND** a success message is returned: "Improvement suggestion submitted successfully"

#### Scenario: Read-only token rejected

- **WHEN** `suggest_improvement` is called with a read-only token
- **THEN** an error content response with `isError: true` is returned indicating insufficient permissions

#### Scenario: Model not in scope

- **WHEN** `suggest_improvement` is called with `modelName: "datev"`
- **AND** the token's scopes are `["shopify"]`
- **THEN** an error content response with `isError: true` is returned indicating access denied

#### Scenario: Model does not exist

- **WHEN** `suggest_improvement` is called with a `modelName` that has no published model
- **THEN** an error content response with `isError: true` is returned indicating the model was not found

#### Scenario: Input validation

- **WHEN** `suggest_improvement` is called with `title` exceeding 200 characters or `description` exceeding 2000 characters
- **THEN** an error content response is returned indicating the input exceeds length limits
