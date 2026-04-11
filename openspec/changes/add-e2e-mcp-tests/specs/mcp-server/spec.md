## ADDED Requirements

### Requirement: MCP E2E Test Coverage

The project SHALL include a Playwright E2E test suite (`apps/e2e/tests/mcp.spec.ts`) that exercises the MCP server's full stack: bearer token authentication, tool invocation, scope enforcement, and token revocation. The test SHALL create a semantic model via the REST API referencing the e2e federated databases (Postgres, MySQL, MSSQL), publish it, and then interact with the MCP endpoint using JSON-RPC over HTTP. The test SHALL run in both CI and local Docker Compose environments using the same `docker-compose.ci.yml` stack.

#### Scenario: MCP tools return correct data from federated databases

- **WHEN** a semantic model `e2e_federation` is created with datasets sourced from Postgres (`e2e_products`), MySQL (`e2e_orders`), and MSSQL (`e2e_customers`)
- **AND** the model is published
- **AND** an MCP token scoped to `["e2e_federation"]` is created
- **THEN** `list_semantic_models` returns `e2e_federation`
- **AND** `get_semantic_model` returns the model overview with all three datasets
- **AND** `get_datasets` returns field details for each dataset
- **AND** `execute_query` with `SELECT * FROM _scope_e2e_federation."products" LIMIT 10` returns rows from the Postgres `e2e_products` table

#### Scenario: MCP scope enforcement in E2E

- **WHEN** an MCP token is scoped to `["other_model"]`
- **AND** the token is used to call `get_semantic_model` with `modelName: "e2e_federation"`
- **THEN** the response contains `isError: true` with an access denied message
- **AND** `list_semantic_models` returns no models

#### Scenario: MCP request improvement tool in E2E

- **WHEN** `request_improvement` is called with a valid token, `modelName: "e2e_federation"`, a title, and a description
- **THEN** the response indicates the improvement request was submitted successfully
