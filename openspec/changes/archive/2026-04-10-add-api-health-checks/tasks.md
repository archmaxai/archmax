## 1. Health Probe Module
- [x] 1.1 Create `packages/core/src/infra/health.ts` with probe functions: `checkMongoDB`, `checkRedis`, `checkEnvVars`, `checkDataDir`
- [x] 1.2 `checkMongoDB` — call `mongoose.connection.db.admin().ping()` with a 2 s timeout; return `{ status, latencyMs }`
- [x] 1.3 `checkRedis` — call `redis.ping()` with a 2 s timeout; return `{ status, latencyMs }`
- [x] 1.4 `checkEnvVars` — re-parse `process.env` against the Zod schema and report missing required fields by name (never values)
- [x] 1.5 `checkDataDir` — call `fs.access(ARCHMAX_DATA_DIR, fs.constants.W_OK)`; return `ok` or `error`
- [x] 1.6 Add `runHealthChecks()` that runs all probes via `Promise.allSettled`, returns `healthy` when all pass, `unhealthy` when any fail

## 2. API Endpoint
- [x] 2.1 Replace the static handler in `apps/api/src/app.ts` (`GET /api/health`) with a call to `runHealthChecks()`
- [x] 2.2 Return HTTP 200 for `healthy`, HTTP 503 for `unhealthy`

## 3. Docker HEALTHCHECK
- [x] 3.1 Add `HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD curl -sf http://127.0.0.1:3000/api/health || exit 1` to the production stage of `Dockerfile`
- [x] 3.2 Ensure `curl` is available in the production image (kept from MongoDB install step — removed from purge list)

## 4. Tests
- [x] 4.1 Unit tests for each probe function in `packages/core/src/infra/health.test.ts` (mock mongoose, ioredis, fs, env)

## 5. Documentation
- [ ] 5.1 Update the Docker reference page (`apps/docs/src/content/docs/reference/docker.mdx`) to document the health endpoint response format and the `HEALTHCHECK` instruction

## 6. Verification
- [x] 6.1 Run `pnpm typecheck` — must pass
- [x] 6.2 Run `pnpm test` — must pass
