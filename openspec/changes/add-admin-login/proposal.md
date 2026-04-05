# Change: Add simple admin login

## Why
The admin UI is currently unauthenticated — anyone with network access can view and modify data source configurations and connection strings. A simple credential gate using environment variables provides baseline access control without introducing a user management system.

## What Changes
- New `POST /api/auth/login` and `POST /api/auth/logout` endpoints on the API
- Session middleware on `/api/*` routes (excluding `/api/health` and `/api/auth/login`) that rejects unauthenticated requests
- New `UI_USERNAME` and `UI_PASSWORD` environment variables validated in the Zod env schema
- New `/login` route on the frontend with a login form
- Auth-guarded layout route that redirects unauthenticated users to `/login`
- The MCP endpoint (`/mcp/semlayer`) remains unaffected — it uses its own bearer token auth

## Impact
- Affected specs: `hono-api`, `spa-architecture`
- Affected code: `packages/core/src/config/env.ts`, `apps/api/src/app.ts`, `apps/api/src/middleware/`, `apps/api/src/routes/`, `apps/frontend/src/routes/`, `apps/frontend/src/lib/`, `.env.example`
