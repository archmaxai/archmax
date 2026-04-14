# Change: Add APP_BASE_URL for proxy-safe deployments

## Why

When archmax runs behind a reverse proxy (cloud hosting, Cloudflare Tunnel, etc.), Better Auth rejects every request with "invalid origin" because both `CORS_ORIGINS` and `AUTH_BASE_URL` default to localhost. Operators must independently discover and set two separate env vars (`CORS_ORIGINS` and `AUTH_BASE_URL`) to the same public URL — a common source of misconfiguration that produces a cryptic error with no actionable guidance.

## What Changes

- Add `APP_BASE_URL` env var as the canonical public URL of the instance (e.g. `https://archmax.example.com`)
- When `APP_BASE_URL` is set:
  - `AUTH_BASE_URL` defaults to `APP_BASE_URL` (unless explicitly overridden)
  - `CORS_ORIGINS` defaults to `APP_BASE_URL` (unless explicitly overridden)
- Update `docker-compose.yml` to use `APP_BASE_URL` instead of hardcoded `CORS_ORIGINS`
- Update `.env.example`, configuration docs, and Docker docs to prominently document `APP_BASE_URL`
- Add a startup warning when `NODE_ENV=production` and `APP_BASE_URL` is not set

## Impact

- Affected specs: `deployment`, `hono-api`
- Affected code: `packages/core/src/config/env.ts`, `apps/api/src/lib/auth.ts`, `apps/api/src/middleware/cors.ts`, `docker-compose.yml`, `.env.example`, docs
