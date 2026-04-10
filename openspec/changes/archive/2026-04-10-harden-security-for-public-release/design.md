## Context

The codebase is being open-sourced. A comprehensive security audit identified vulnerabilities across MCP endpoints, SQL query paths, credential storage, Docker configuration, and HTTP security headers. This change addresses all findings in a single coordinated proposal because the fixes are small, independent, and collectively gate the public release.

## Goals / Non-Goals

- **Goals:**
  - Close all critical and high-severity issues before repository goes public
  - Ensure no SSRF, SQL injection, or plaintext credential storage paths remain
  - Harden Docker image and HTTP transport security
  - Remove tracked build artifacts that should be gitignored

- **Non-Goals:**
  - Multi-tenancy or per-user authorization (single-admin system, tracked separately if needed)
  - Rate limiting improvements beyond what already exists
  - Comprehensive penetration testing (this is a code-level hardening pass)

## Decisions

### SSRF mitigation on `llmBaseUrl`
- **Decision:** Validate `llmBaseUrl` at both storage time (POST/PUT) and request time (test-connection). Block RFC 1918, loopback, link-local, and metadata service addresses (`169.254.169.254`). Resolve DNS before checking to prevent DNS rebinding with known private IPs.
- **Alternatives:** Allowlist of known LLM providers — too restrictive for self-hosted models. Proxy all outbound requests through a gateway — over-engineered for current scope.

### `ENCRYPTION_KEY` enforcement
- **Decision:** Keep `ENCRYPTION_KEY` optional in the env schema (it's only needed for GitHub integration and test agents). When storing a test agent API key, if `ENCRYPTION_KEY` is not set, return a 400 error rather than storing plaintext.
- **Alternatives:** Make `ENCRYPTION_KEY` globally required — too disruptive for users who don't use test agents or GitHub integration.

### Connection config schema tightening
- **Decision:** Replace `.passthrough()` with `.strict()` on `connectionConfigSchema`. Explicitly add all known fields. Validate `schema` field with `IDENTIFIER_RE` (`/^[a-zA-Z_][a-zA-Z0-9_]*$/`).
- **Alternatives:** Keep `.passthrough()` and validate only `schema` — leaves the door open for future injection via other arbitrary fields.

### Data browser SQL parameterization
- **Decision:** Use DuckDB `information_schema` queries with identifier validation (already present via `IDENTIFIER_RE`) and keep string interpolation only for validated identifiers. DuckDB prepared statements don't support parameterized identifiers (table/schema names).
- **Alternatives:** Full parameterization — not possible for DDL/identifier positions in DuckDB SQL.

### MCP session token re-validation
- **Decision:** Store `tokenId` in the session. On each subsequent request using `mcp-session-id`, look up the token and verify it hasn't been revoked or expired. This adds one lightweight DB query per MCP request.
- **Alternatives:** Reduce `SESSION_TTL_MS` to 5 minutes — reduces the window but doesn't eliminate it. Cache token validity with a short TTL — adds complexity without full coverage.

### CSRF protection
- **Decision:** Enforce `Content-Type: application/json` on all state-changing `/api/*` routes. This leverages CORS preflight (which is already configured) to block cross-origin form submissions. No additional CSRF token needed since all mutations require JSON bodies.
- **Alternatives:** Add a CSRF token middleware — more complex and unnecessary when JSON content-type is enforced with CORS credentials mode.

## Risks / Trade-offs

- **SSRF DNS resolution check** — Adds latency (~1-5ms) per test-connection call. Acceptable given it's an admin action, not a hot path.
- **MCP session re-validation** — Adds one DB query per MCP request. Mitigated by the existing MongoDB connection pool and the lightweight nature of the query (indexed lookup by `_id`).
- **`.strict()` on connection config** — May break if users have stored connections with non-standard fields. Migration: a one-time cleanup removing unknown fields from existing documents.

## Open Questions

- None — all decisions are straightforward security hardening with clear implementation paths.
