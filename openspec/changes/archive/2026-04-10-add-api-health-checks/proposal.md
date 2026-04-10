# Change: Add comprehensive API health checks

## Why

The current `GET /api/health` endpoint returns a static `{ "status": "ok" }` regardless of actual system state. This is useless for monitoring, Docker `HEALTHCHECK`, and debugging startup/runtime issues in production. A real health endpoint should probe every dependency so operators and orchestrators can detect degraded or unhealthy containers quickly.

## What Changes

- **Health endpoint** (`apps/api/src/app.ts`): Replace the static `{ status: "ok" }` response with a handler that probes Redis, MongoDB, required env vars, and data directory writability. Return per-component status and an overall `healthy` / `unhealthy` rollup.
- **Health check module** (`packages/core/src/infra/health.ts`): New module with individual probe functions (`checkRedis`, `checkMongoDB`, `checkEnvVars`, `checkDataDir`) that can be composed and tested independently.
- **Docker HEALTHCHECK**: Add a `HEALTHCHECK` instruction to the `Dockerfile` that curls the health endpoint, giving Docker native container health status.
- **Documentation**: Update the Docker reference page to document the health endpoint response format and the `HEALTHCHECK` instruction.

## Impact

- Affected specs: `hono-api`, `deployment`
- Affected code: `apps/api/src/app.ts`, `packages/core/src/infra/health.ts` (new), `Dockerfile`, `apps/docs/`
- No breaking changes — the endpoint path stays the same (`GET /api/health`), but the response body shape changes from `{ status }` to `{ status, checks, timestamp }`. All checks (MongoDB, Redis, env vars, data dir) are critical — any failure results in `unhealthy`.
- **Conflict note**: The `harden-security-for-public-release` change modifies `app.ts` and `Dockerfile` (non-root user, nginx config). These changes are compatible but should be merged carefully.
