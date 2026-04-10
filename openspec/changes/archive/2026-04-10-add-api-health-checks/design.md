## Context

The container runs multiple processes (API, worker, nginx, optionally embedded Redis and MongoDB). The only health signal today is a static JSON response that tells nothing about actual readiness. Docker, Kubernetes, and monitoring tools need a real probe.

## Goals / Non-Goals

- Goals:
  - Probe Redis, MongoDB, env vars, and data directory from a single unauthenticated endpoint
  - Return structured JSON with per-component results so operators can pinpoint failures
  - Integrate with Docker `HEALTHCHECK` for native container health status
  - Keep the probe fast (<500 ms timeout per check) so it doesn't block orchestrator polling
- Non-Goals:
  - Deep application-level checks (e.g. "can we run a DuckDB query") — those are per-project and belong in a readiness probe, not a liveness probe
  - Checking nginx from inside the API (circular — if nginx is down, the request never arrives)
  - Exposing sensitive information (connection strings, passwords) in the response

## Decisions

### Response shape

```jsonc
{
  "status": "healthy" | "unhealthy",
  "checks": {
    "mongodb": { "status": "up" | "down", "latencyMs": 12 },
    "redis":   { "status": "up" | "down", "latencyMs": 3 },
    "env":     { "status": "ok" | "missing", "missing": ["BETTER_AUTH_SECRET"] },
    "dataDir": { "status": "ok" | "error", "path": "/app/data/projects" }
  },
  "timestamp": "2026-04-10T12:00:00.000Z"
}
```

- **healthy**: all checks pass (MongoDB up, Redis up, required env vars set, data dir writable)
- **unhealthy**: any check fails
- HTTP status: 200 for healthy, 503 for unhealthy. Docker `HEALTHCHECK` uses exit code from `curl --fail` which maps 503 to unhealthy.

### All checks are critical

| Check | Rationale |
|-------|-----------|
| MongoDB connectivity | Core data store — nothing works without it |
| Redis connectivity | Required for BullMQ job queue and pub/sub; always expected to be available (embedded or external) |
| Required env vars (`BETTER_AUTH_SECRET`, `UI_PASSWORD`) | App cannot function without auth config |
| Data directory writable | Semantic model reads/writes will fail |

### Probe implementation

Each probe is an independent async function in `packages/core/src/infra/health.ts`:

- `checkMongoDB()` — calls `mongoose.connection.db.admin().ping()` with a 2 s timeout
- `checkRedis()` — calls `redis.ping()` with a 2 s timeout, or returns `not_configured` if `REDIS_URL` is unset
- `checkEnvVars()` — validates the Zod schema and reports any missing required fields
- `checkDataDir()` — calls `fs.access(ARCHMAX_DATA_DIR, fs.constants.W_OK)`

The handler in `app.ts` runs all probes concurrently via `Promise.allSettled`, computes the rollup, and returns the result.

### Docker HEALTHCHECK

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -sf http://127.0.0.1:3000/api/health || exit 1
```

Hits the API directly (not through nginx) so the check works even if nginx is misconfigured. The `--start-period` gives embedded MongoDB and Redis time to boot.

## Risks / Trade-offs

- **Latency**: Each probe has a 2 s timeout; worst-case the health endpoint takes ~2 s (probes run in parallel). Acceptable for a 30 s poll interval.
- **Information leakage**: The response lists which env vars are missing by name (not value). This is intentional for operability — the endpoint is behind the container network. If a future requirement calls for external exposure, we can add a `?verbose=false` mode.
- **curl in image**: The production image already installs curl for MongoDB setup, so no additional dependency.

## Open Questions

- None — design is intentionally minimal and extensible.
