# Change: Streamline single Docker image deployment

## Why

Running archsem currently requires a separate MongoDB instance and optionally a separate Redis instance. This creates friction for first-time users and small-team deployments. By embedding MongoDB and Redis inside the Docker image as automatic fallbacks, a single `docker run` command with zero external dependencies gets users to a working instance.

## What Changes

- **Embedded MongoDB**: When `MONGODB_URI` is not provided, the entrypoint starts a `mongod` process inside the container with data stored at `/app/data/mongodb`.
- **Embedded Redis**: When `REDIS_URL` is not provided, the entrypoint starts a `redis-server` instance in the container (data in `/tmp/redis`, ephemeral by design).
- **Unified data directory**: All persistent state lives under `/app/data/` — projects at `/app/data/projects`, MongoDB at `/app/data/mongodb` — so a single volume mount (`-v host:/app/data`) backs up everything.
- **`MONGODB_URI` becomes optional**: The Zod env schema makes `MONGODB_URI` optional with an automatic fallback to the embedded instance (`mongodb://127.0.0.1:27017/archsem`).
- **`docker-compose.yml` at repo root**: A production-oriented Compose file with separate MongoDB and Redis services for users who prefer external infrastructure.
- **Documentation updates**: Installation and configuration docs updated to cover both zero-dependency single-image mode and Compose-based mode.

## Impact

- Affected specs: new `deployment` capability
- Affected code: `Dockerfile`, `entrypoint.sh`, `packages/core/src/config/env.ts`, `apps/docs/`
- No breaking changes — existing deployments that already set `MONGODB_URI` continue to work unchanged
