## 1. Semantic model fixture

- [x] 1.1 Define the `e2e_federation` semantic model JSON object in the test file, referencing datasets `products` (Postgres `e2e_products`), `orders` (MySQL `e2e_orders`), `customers` (MSSQL `e2e_customers`) with correct source references using connection slugs and field expressions

## 2. Docker Compose updates

- [x] 2.1 Configure writable `ARCHMAX_DATA_DIR` (`/data/projects`) in `docker-compose.ci.yml` via tmpfs so the app container can write semantic model files and publish builds

## 3. Test file: `apps/e2e/tests/mcp.spec.ts`

- [x] 3.1 Create the test file with serial test suite structure, login helper, and project/connection setup (reuse patterns from `data-federation.spec.ts`)
- [x] 3.2 Implement setup test: log in, ensure project exists, ensure all four connections exist (Postgres, MySQL, MSSQL, SQLite)
- [x] 3.3 Look up connection slugs via `GET /api/projects/:id/connections` and construct the semantic model with correct `<slug>.<schema>.<table>` source references
- [x] 3.4 Create the semantic model via `POST /api/projects/:projectId/semantic-models` using Playwright API request context
- [x] 3.5 Publish the semantic model via `POST /api/projects/:projectId/publish`

## 4. MCP auth tests (pre-token)

- [x] 4.1 Test: request to `/mcp/:slug/mcp` with no `Authorization` header returns 401
- [x] 4.2 Test: request with `Authorization: Bearer invalid_token_value` returns 401

## 5. Token creation via UI

- [x] 5.1 Navigate to the MCP Access page (`/:projectId/mcp-access`)
- [x] 5.2 Click "Create Token" button to open the create dialog
- [x] 5.3 Fill in the token name via the `#token-name` input
- [x] 5.4 Open the scope selector popover and select the `e2e_federation` model
- [x] 5.5 Click "Create Token" in the dialog footer
- [x] 5.6 Wait for the token reveal dialog to appear (title "Token Created")
- [x] 5.7 Extract the raw token value from the `<code>` element in the reveal dialog
- [x] 5.8 Verify the token starts with `sml_`
- [x] 5.9 Close the reveal dialog
- [x] 5.10 Verify the new token appears in the token list table

## 6. MCP auth test (valid token)

- [x] 6.1 Test: MCP initialize with valid bearer token succeeds and returns session ID + archmax server info

## 7. MCP tool tests

- [x] 7.1 Test `list_semantic_models`: verify the `e2e_federation` model is listed
- [x] 7.2 Test `get_semantic_model`: call with `modelName: "e2e_federation"`, verify datasets, relationships, and metrics are present in the overview
- [x] 7.3 Test `get_datasets`: call with `modelName: "e2e_federation"` and dataset entries for `products`, `orders`, `customers` with page 1, verify fields are returned
- [x] 7.4 Test `execute_query`: run `SELECT * FROM _scope_e2e_federation."products" LIMIT 10` and verify rows are returned with expected columns (id, name, price)
- [x] 7.5 Test `execute_query` cross-database: run a query that joins data from Postgres and MySQL scoped VIEWs
- [x] 7.6 Test `request_improvement`: submit an improvement request for `e2e_federation`, verify success response

## 8. Scope enforcement tests

- [x] 8.1 Test out-of-scope model name returns access denied error with the main token
- [x] 8.2 Create a dummy `e2e_scope_test` model, publish, and create a token scoped only to it
- [x] 8.3 Test: `list_semantic_models` with the narrowly scoped token returns only `e2e_scope_test`, not `e2e_federation`
- [x] 8.4 Test: `get_semantic_model` with `modelName: "e2e_federation"` using the wrong-scope token returns `isError: true`
- [x] 8.5 Clean up the dummy model and narrow-scope token

## 9. Token revocation via UI

- [x] 9.1 Navigate to the MCP Access page
- [x] 9.2 Click the revoke (trash) button on the token row created in step 5
- [x] 9.3 Confirm in the revoke dialog by clicking "Revoke"
- [x] 9.4 Verify the token disappears from the token list
- [x] 9.5 Test: request to MCP endpoint with the revoked token returns 401

## 10. Cleanup

- [x] 10.1 Delete the semantic model via `DELETE /api/projects/:projectId/semantic-models/e2e_federation`

## 11. CI integration

- [x] 11.1 Test runs in the existing CI workflow (`pr-docker-build.yml`) without additional configuration (Playwright discovers all `*.spec.ts` files automatically)
- [x] 11.2 Local execution via `docker compose -f docker-compose.ci.yml` uses the same `archmax-data` named volume
