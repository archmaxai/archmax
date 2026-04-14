## 1. Core env schema

- [x] 1.1 Add `APP_BASE_URL` to the Zod env schema in `packages/core/src/config/env.ts` (optional string, URL format)
- [x] 1.2 In `buildParsedEnv`, derive `AUTH_BASE_URL` from `APP_BASE_URL` when `AUTH_BASE_URL` is not explicitly set
- [x] 1.3 In `buildParsedEnv`, derive `CORS_ORIGINS` from `APP_BASE_URL` when `CORS_ORIGINS` is not explicitly set (preserving the ability to add extra origins via comma-separated list)
- [x] 1.4 Add a startup warning (to stderr) when `NODE_ENV=production` and `APP_BASE_URL` is not set

## 2. Auth and CORS wiring

- [x] 2.1 Confirm `apps/api/src/lib/auth.ts` already reads `AUTH_BASE_URL` from parsed env (no change expected — derivation happens in env.ts)
- [x] 2.2 Confirm `apps/api/src/middleware/cors.ts` already reads `corsOrigins` from parsed env (no change expected)

## 3. Docker and compose

- [x] 3.1 Update `docker-compose.yml` to replace hardcoded `CORS_ORIGINS: http://localhost:8080` with `APP_BASE_URL: ${APP_BASE_URL:-http://localhost:8080}`
- [x] 3.2 Update `docker-compose.ci.yml` to set `APP_BASE_URL: http://localhost:8080` (replacing separate `CORS_ORIGINS` and `AUTH_BASE_URL`)

## 4. Configuration files

- [x] 4.1 Add `APP_BASE_URL` to `.env.example` with a comment explaining its purpose
- [x] 4.2 Add `APP_BASE_URL` hint to `ENV_HINTS` in `env.ts` for the startup error banner

## 5. Documentation

- [x] 5.1 Update `apps/docs/src/content/docs/reference/configuration.mdx` — add `APP_BASE_URL` to the Server table as the recommended way to configure the public URL, and note that `CORS_ORIGINS` / `AUTH_BASE_URL` are advanced overrides
- [x] 5.2 Update `apps/docs/src/content/docs/reference/docker.mdx` — mention `APP_BASE_URL` in the env var table and proxy/cloud deployment section
- [x] 5.3 Update `apps/docs/src/content/docs/getting-started/installation.mdx` if it references CORS or auth URL config

## 6. Tests

- [x] 6.1 Add unit tests for the `APP_BASE_URL` derivation logic in env.ts (APP_BASE_URL alone, APP_BASE_URL + explicit CORS_ORIGINS override, APP_BASE_URL + explicit AUTH_BASE_URL override)
