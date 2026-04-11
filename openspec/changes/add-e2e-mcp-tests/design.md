## Context

The MCP server exposes semantic model data to AI agents via JSON-RPC over HTTP at `/mcp/:slug/mcp`. Authentication uses bearer tokens (SHA-256 hashed, stored per-project). Tools filter results by token scopes. The `execute_query` tool creates scoped DuckDB VIEWs from published semantic model YAMLs in `<ARCHMAX_DATA_DIR>/projects/<projectId>/build/`.

E2E tests run in Playwright against a Docker Compose stack (`docker-compose.ci.yml`) that includes the app, MongoDB, Redis, and four federated databases (Postgres, MySQL, MSSQL, SQLite).

## Goals / Non-Goals

- **Goals**:
  - Verify the full MCP auth lifecycle (create token, use token, delete token, reject after deletion)
  - Verify MCP tool execution against real databases through the published semantic model path
  - Verify scope enforcement (token can only access models in its scopes)
  - Run locally and in CI with the same Docker Compose stack

- **Non-Goals**:
  - Testing the test MCP endpoint (`/mcp/:slug/test/mcp`) which assembles from `src/`
  - Testing MCP session management / Streamable HTTP (JSON-RPC single-request mode is sufficient)
  - Testing rate limiting (timing-sensitive, better suited for integration tests)
  - Comprehensive UI testing of the MCP Access page beyond the token create/revoke flows used in this suite

## Decisions

### Semantic model fixture approach

**Decision**: Create the semantic model via the REST API during the test, then publish it.

**Rationale**: The semantic model must be stored under `<ARCHMAX_DATA_DIR>/projects/<projectId>/src/` with the correct project ID. Since project IDs are generated at runtime (MongoDB ObjectIds), pre-mounting a fixture at a known path is not possible. Instead:
1. The test creates the semantic model JSON via `POST /api/projects/:projectId/semantic-models`
2. The test publishes it via `POST /api/projects/:projectId/publish`
3. The MCP endpoint then reads from `<projectId>/build/`

This avoids docker exec, volume hacks, or needing to know the project ID in advance.

**Alternatives considered**:
- Mount a YAML fixture and copy via `docker exec`: Requires shell access to the container from tests, fragile
- Use the test MCP endpoint (`/test/mcp`): Would skip the publish pipeline, not testing the production code path
- Pre-seed via MongoDB init script: Semantic models are file-based, not in MongoDB

### Semantic model content

**Decision**: Create a single model named `e2e_federation` with three datasets referencing the existing e2e database tables:
- `products` from Postgres connection (`e2e_postgres.public.e2e_products`)
- `orders` from MySQL connection (`e2e_mysql.e2e_test.e2e_orders`)
- `customers` from MSSQL connection (`e2e_mssql.dbo.e2e_customers`)

The connection slug names must match the DuckDB-attached catalog names. The test will discover the actual connection slugs via the connections API.

### MCP protocol for tests

**Decision**: Use plain HTTP POST with JSON-RPC payloads via Playwright's `request` API context.

The MCP server accepts standard JSON-RPC over HTTP. No need for an MCP client SDK. The test sends:
- `{"jsonrpc":"2.0","method":"initialize","id":1,...}` to establish a session
- `{"jsonrpc":"2.0","method":"tools/list","id":2}` to list tools
- `{"jsonrpc":"2.0","method":"tools/call","id":3,"params":{"name":"...","arguments":{...}}}` to invoke tools

### Token creation and revocation through the UI

**Decision**: Create the primary MCP token through the MCP Access page UI, not the API. Revoke it through the UI as well.

**Rationale**: This verifies the full user journey: opening the Create Token dialog, filling in the name, selecting model scopes via the popover checkbox list, submitting, and reading the raw token from the one-time reveal dialog. After MCP tool testing, the token is revoked via the UI by clicking the trash icon on the token row and confirming in the revoke dialog. This catches frontend regressions (broken scope selector, token reveal not rendering, revoke dialog not wired up) that API-only tests would miss.

**Token extraction**: The reveal dialog renders the raw token in a `<code>` element with class `select-all`. The test reads `textContent` from that element. No clipboard interaction needed.

**Second token for scope enforcement**: Created via the API (not UI) since its purpose is to test MCP scope filtering, not the UI flow.

### Auth testing strategy

**Decision**: Test four auth states in sequence:
1. **No token**: Request without `Authorization` header, expect 401
2. **Invalid token**: Request with `Authorization: Bearer invalid_garbage`, expect 401
3. **Valid token**: Token created via the UI, request succeeds
4. **Revoked token**: After revoking via the UI, request with the same token, expect 401

### Test isolation

**Decision**: The MCP test suite runs serially (like `data-federation.spec.ts`) and depends on the project and connections created by the data-federation suite. The Playwright config already runs with `workers: 1` in CI.

The test authenticates via the admin session API, reuses the "E2E Federation" project, and creates its own semantic model and MCP tokens which it cleans up after.

## Risks / Trade-offs

- **Dependency on data-federation test**: The MCP test assumes connections already exist. If data-federation fails, MCP tests will also fail. Mitigation: the MCP test will independently ensure connections exist (same pattern as data-federation).
- **Connection slug discovery**: The semantic model references connections by their DuckDB catalog name (the connection slug). The test must look up the actual slugs via the API. Mitigation: deterministic slug generation from connection names (`e2e-postgres`, `e2e-mysql`, `e2e-mssql`).
- **Publish timing**: After calling the publish endpoint, the MCP endpoint must serve the new model. The publish is synchronous (assembles to `build/`), so no race condition.

## Open Questions

- None currently.
