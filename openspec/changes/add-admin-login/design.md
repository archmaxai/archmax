## Context
Single-user admin tool needs a credential gate. No user database, no multi-tenancy — just a username/password pair from environment variables.

## Goals / Non-Goals
- Goals: Prevent unauthorized UI/API access with minimal complexity
- Non-Goals: User management, role-based access, password reset, remember-me, OAuth

## Decisions

### Session mechanism: httpOnly cookie with in-memory token store
- **Decision**: On successful login, the API generates a random 32-byte hex token, stores it in a `Set<string>` in memory, and sets it as an `httpOnly`, `sameSite=lax`, `path=/` cookie named `session`.
- **Alternatives considered**:
  - JWT: Adds `jose` dependency and token expiry management — overkill for single-user.
  - Signed Hono cookie: Requires a signing secret env var — unnecessary indirection.
- **Trade-off**: In-memory store means sessions are lost on API restart. Acceptable for a single-user admin tool.

### Auth middleware placement
- **Decision**: Insert session-check middleware on `/api/*` after the existing CORS/cache middleware, but carve out `/api/health` and `/api/auth/login` as public routes. The MCP route (`/mcp/semlayer`) is mounted before the auth middleware and keeps its own bearer token auth.
- **Rationale**: Matches the existing blueprint pattern from archmax_chat where public and MCP routes are mounted before the auth middleware.

### Frontend auth flow
- **Decision**: A `_auth` layout route wraps all admin pages. Its `beforeLoad` hook calls `GET /api/auth/me` — if it returns 401, redirect to `/login`. The login page lives outside the `_auth` layout. On successful login, redirect to `/`. On logout, call `POST /api/auth/logout` and redirect to `/login`.
- **Rationale**: TanStack Router's `beforeLoad` is the idiomatic guard mechanism. A `/api/auth/me` check is simpler than tracking client-side state for page refreshes.

## Risks / Trade-offs
- Sessions lost on restart — user must re-login after deploy. Low impact for single-user.
- No CSRF protection — `sameSite=lax` cookie mitigates the common case. Full CSRF tokens can be added later if needed.
- No brute-force protection on login — acceptable for an internal tool. Rate limiting can be layered on later.

## Open Questions
- None — scope is tightly defined.
