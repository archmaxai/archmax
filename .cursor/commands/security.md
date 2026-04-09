---
name: /security
id: security
category: Quality
description: Audit recent changes for security issues specific to this project.
---

**Scope**

Review the files changed in this session against the threat surfaces below. Flag concrete issues with file paths and line references — do not produce generic checklists.

**Threat Surfaces**

1. **MCP endpoint auth** — Every MCP route must validate the bearer token and scope it to the correct project. Verify that:
   - Token lookup and project association happen before any tool handler runs.
   - Invalid or expired tokens return a proper JSON-RPC error, not a stack trace.
   - Token scopes restrict which semantic models the caller can access.

2. **Query execution sandboxing** — The `execute_query` MCP tool must enforce read-only SQL against DuckDB VIEWs. Check that:
   - Queries cannot write, drop, or alter objects.
   - Queries are scoped to the semantic model's VIEWs, not raw underlying tables.
   - Query timeouts and result-size limits are enforced.

3. **Admin auth (Better Auth)** — Session-based login for the admin UI. Verify:
   - Session secret (`BETTER_AUTH_SECRET`) is validated at startup (min 32 chars).
   - CSRF protection is active on state-changing routes.
   - Cookies use `Secure`, `HttpOnly`, and `SameSite` attributes in production.

4. **API input validation** — All Hono route handlers must validate input with Zod before processing. Check for:
   - Missing or incomplete Zod schemas on request bodies, params, and query strings.
   - Unvalidated user input reaching MongoDB queries (injection risk) or DuckDB queries (SQL injection).

5. **Environment secrets** — Sensitive values (`BETTER_AUTH_SECRET`, `AGENT_API_KEY`, database passwords) must not be:
   - Logged to stdout/stderr.
   - Returned in API responses or error messages.
   - Committed in `.env.local` or hardcoded in source.

6. **Dependency exposure** — If new dependencies were added, verify they are actively maintained and do not introduce known vulnerabilities (check with `pnpm audit` if in doubt).

**Output**

For each issue found, state: the file and location, what the risk is, and a concrete fix. If no issues are found, confirm the changes look secure and state which surfaces you checked.
