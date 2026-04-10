# Change: Harden security for public release

## Why
The repository is being open-sourced. A full security audit identified critical and high-severity vulnerabilities that must be resolved before the codebase becomes publicly accessible.

## What Changes

### Critical
- **SSRF via test agent `llmBaseUrl`**: The `test-connection` endpoint makes HTTP requests to a user-controlled URL, enabling internal network probing and API key exfiltration. Add URL validation to block private/loopback addresses.
- **Missing DuckDB hardening on agent queries**: The semantic model agent's `executeQuery` tool does not call `hardenConnection()`, leaving `enable_external_access` enabled. Agent-injected SQL could read local files or make outbound requests.
- **API keys stored in plaintext when `ENCRYPTION_KEY` is unset**: `ENCRYPTION_KEY` is optional in the env schema. When absent, test agent API keys are stored unencrypted in MongoDB. Make `ENCRYPTION_KEY` required when test agents exist, or refuse to store keys without it.
- **SQL injection via connection `schema` field in data browser**: The `connectionConfigSchema` uses `.passthrough()`, allowing arbitrary fields including unvalidated `schema` strings that are later interpolated into SQL.

### High
- **Remove `.passthrough()` from `connectionConfigSchema`**: Tighten the Zod schema to `.strict()` to prevent arbitrary fields from reaching MongoDB and downstream SQL.
- **CSRF gap on state-changing API routes**: Add explicit CSRF protection or enforce JSON-only content types on mutation endpoints.
- **GitHub OAuth state comparison not constant-time**: Replace `Buffer.equals()` with `crypto.timingSafeEqual()` in `github.ts`.
- **Tracked build artifacts**: Remove `apps/docs/.astro/` and `skills-lock.json` from git tracking.

### Medium
- **MCP session re-authentication**: After a token is revoked, existing MCP sessions remain valid for up to 30 minutes. Re-validate token status on each session request.
- **Missing nginx security headers**: Add `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`.

### Low / Informational
- **Docker image runs as root**: Add a non-root user in the production Dockerfile stage.
- **`UI_PASSWORD` has no minimum length**: Add `.min(8)` to the env schema.
- **Cookie hardening not explicit**: Configure Better Auth cookie attributes (`secure`, `httpOnly`, `sameSite`) explicitly.

## Impact
- Affected specs: `mcp-server`, `data-connections`, `data-browser`, `testing-suite`, `hono-api`, `deployment`, `auth`
- Affected code:
  - `packages/core/src/services/agent-tools.ts` — add `hardenConnection()`
  - `packages/core/src/config/env.ts` — `ENCRYPTION_KEY` + `UI_PASSWORD` constraints
  - `apps/api/src/routes/test-agents.ts` — URL validation, encryption requirement
  - `apps/api/src/routes/connections.ts` — remove `.passthrough()`, validate `schema`
  - `apps/api/src/routes/data-browser.ts` — parameterize SQL, validate identifiers
  - `apps/api/src/routes/github.ts` — `crypto.timingSafeEqual()`
  - `apps/api/src/mcp/archmax-route.ts` — session token re-validation
  - `apps/api/src/lib/auth.ts` — cookie config, CSRF
  - `apps/api/src/app.ts` — content-type enforcement
  - `apps/frontend/nginx.conf` — security headers
  - `Dockerfile` — non-root user
  - `.gitignore` — add `.astro/`
