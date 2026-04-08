## Context

The MCP server currently authenticates with a single global bearer token (`MCP_BEARER_TOKEN` env var) and serves all projects from one endpoint (`/mcp/semlayer`). There is no way to:
- Limit which semantic models a token can access
- Control read vs write permissions per token
- Set token expiry or revoke individual tokens
- Scope tokens to a specific project

This change introduces project-scoped MCP endpoints with managed bearer tokens that have fine-grained permissions.

## Goals / Non-Goals

- Goals:
  - Project-scoped MCP endpoints with human-readable URLs (`/mcp/:slug/mcp`)
  - Per-project token management with CRUD API and UI
  - Token scoping to specific semantic models within a project
  - Read / read-write permission flag per token
  - Token expiry with optional "never expires" option
  - Field-level access enforcement based on token scope
  - Token display-once-on-creation pattern (hash stored, raw shown once)

- Non-Goals:
  - Multi-user / team token ownership (single-user system)
  - OAuth2 / OIDC integration for MCP tokens
  - Per-field or per-dataset permission granularity beyond model-level scope
  - Rate limiting per token (existing IP-based rate limiting remains)

## Decisions

### Custom McpToken model vs BetterAuth

**Decision**: Use a dedicated `McpToken` Mongoose model, not BetterAuth.

**Rationale**: BetterAuth is session/cookie-based, designed for browser auth flows. MCP tokens are long-lived bearer tokens with domain-specific requirements (model-level scoping, read/write permissions, custom expiry). BetterAuth's session model doesn't support these features. A custom model is simpler and more appropriate.

**Alternatives considered**:
- BetterAuth `bearer` plugin — lacks custom scopes, no model-level permissions
- BetterAuth API keys — designed for user-level API access, not project-scoped with semantic model granularity

### Token hashing

**Decision**: Store tokens as SHA-256 hashes. Show the raw token only once at creation time.

**Rationale**: Follows the GitHub PAT pattern. If the database is compromised, raw tokens are not exposed. The trade-off is that lost tokens cannot be recovered — users must create a new one.

### Project slug for MCP URLs

**Decision**: Add a `slug` field to the Project model, auto-generated from the title (lowercase, alphanumeric + hyphens), with a unique index.

**Rationale**: The MCP URL pattern `BASE_URL/mcp/:slug/mcp` should be human-readable for AI agent configuration files. MongoDB ObjectIds are opaque and error-prone to copy/paste. Slugs are editable if the user wants a custom URL.

### MCP tool scoping strategy

**Decision**: Filter at the MCP tool level — tools receive the token's scope and filter their results accordingly.

**Rationale**: This is simpler than DuckDB-level enforcement and covers the current tool set (metadata-only, no query execution). When a query execution tool is added, field-level validation against the semantic model's field definitions will be enforced before the query reaches DuckDB.

### Read / read-write permission

**Decision**: Store as `permission: "read" | "read-write"` on the token. Default is `read`.

**Rationale**: Read tokens can access all metadata tools and execute read-only queries. Read-write tokens additionally allow write queries (INSERT, UPDATE, etc.) when query execution is available. This aligns with the existing `ensureReadonly` project-level setting but is per-token.

## Risks / Trade-offs

- **Breaking change** — Existing MCP clients must update their endpoint URL and obtain a project-scoped token. → Mitigation: Document migration clearly; the old `/mcp/semlayer` endpoint can return a 410 Gone with migration instructions during a transition period.
- **Slug uniqueness** — Slug collisions if multiple projects have similar titles. → Mitigation: Auto-append numeric suffix on conflict; allow manual slug editing.
- **Token leakage** — Tokens shown in plain text once at creation. → Mitigation: SHA-256 hash in DB; clear UI warning to copy the token immediately; no way to retrieve it later.
- **Scope drift** — If a semantic model is renamed or deleted, tokens referencing it become partially invalid. → Mitigation: Tokens with stale scopes silently lose access to removed models; UI shows warnings for stale scopes.

## Resolved Questions

- **Old endpoint**: The `/mcp/semlayer` endpoint is removed immediately with no deprecation period. Clients must migrate to `/mcp/:slug/mcp`.
- **Wildcard scope**: No "all models" wildcard. Token scopes always require explicit model selection to enforce least-privilege access.
