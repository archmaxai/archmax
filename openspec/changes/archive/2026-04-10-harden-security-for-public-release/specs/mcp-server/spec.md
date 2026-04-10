## MODIFIED Requirements

### Requirement: MCP DuckDB Connection Hardening

Each `execute_query` invocation SHALL open a DuckDB connection with security hardening applied before query execution. The hardening SHALL include: `SET enable_external_access = false` (prevents file reads, network access, COPY operations), resource limits (`SET threads = 2`, `SET memory_limit = '512MB'`), and `SET lock_configuration = true` (prevents any setting changes by injected SQL). These settings SHALL be applied per-connection so they do not affect other DuckDB consumers (data browser, semantic model agent). The semantic model agent's `executeQuery` tool SHALL also apply the same `hardenConnection()` settings before executing any query, ensuring parity with the MCP code path.

#### Scenario: External access disabled
- **WHEN** an MCP query attempts `SELECT * FROM read_csv('/etc/passwd')`
- **THEN** the query fails because `enable_external_access` is false
- **AND** no file system content is returned

#### Scenario: Configuration locked
- **WHEN** an MCP query attempts `SET enable_external_access = true`
- **THEN** the SET statement fails because `lock_configuration` is true

#### Scenario: Resource limits applied
- **WHEN** an MCP query consumes excessive resources
- **THEN** the query is constrained by the configured thread and memory limits

#### Scenario: Agent executeQuery tool hardened
- **WHEN** the semantic model agent's `executeQuery` tool runs a query against DuckDB
- **THEN** `hardenConnection()` is applied to the connection before query execution
- **AND** `enable_external_access` is false, threads are limited to 2, memory is limited to 512MB, and configuration is locked

## ADDED Requirements

### Requirement: MCP Session Token Re-validation

When an MCP request includes an `mcp-session-id` header referencing an existing session, the server SHALL re-validate the associated bearer token before processing the request. The server SHALL store the `tokenId` when a session is created. On each subsequent session request, the server SHALL verify that the token has not been soft-deleted and has not expired. If the token is no longer valid, the session SHALL be terminated and a 401 error returned.

#### Scenario: Revoked token rejected on session request
- **WHEN** a bearer token is revoked (soft-deleted) after an MCP session was established
- **AND** a subsequent request is made using the session's `mcp-session-id`
- **THEN** the server looks up the token by `tokenId`, finds it deleted, and returns a 401 error
- **AND** the session is removed from the session map

#### Scenario: Expired token rejected on session request
- **WHEN** a bearer token's `expiresAt` passes while an MCP session is active
- **AND** a subsequent request is made using the session's `mcp-session-id`
- **THEN** the server looks up the token, finds it expired, and returns a 401 error

#### Scenario: Valid token allows session request
- **WHEN** a session request includes a valid `mcp-session-id`
- **AND** the associated token is still active and not expired
- **THEN** the request is processed normally
