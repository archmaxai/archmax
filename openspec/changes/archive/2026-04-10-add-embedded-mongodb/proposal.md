# Change: Add embedded MongoDB to Docker image

## Why

Running `docker run` currently requires an external MongoDB instance, which adds friction for users who want a zero-dependency quick start. Embedding MongoDB (like the existing embedded Redis) lets users run archmax with just `docker run` and two environment variables (`BETTER_AUTH_SECRET`, `UI_PASSWORD`) — no external database needed. Users who prefer a managed or external MongoDB can still pass `MONGODB_URI` to skip the embedded instance entirely.

## What Changes

- **Dockerfile**: Install MongoDB Community 8.x (`mongod`) in the production stage alongside the existing `redis-server` and `nginx`.
- **Entrypoint**: When `MONGODB_URI` is not set, start `mongod` bound to `127.0.0.1:27017` with data at `/app/data/mongodb` and export `MONGODB_URI=mongodb://127.0.0.1:27017/archmax`. Remove the current hard-fail on missing `MONGODB_URI`.
- **Env schema**: Make `MONGODB_URI` optional again (`z.string().optional()`). The `connectDB()` function throws if it is still unset at call time (safety net for local dev without `.env`).
- **Data directory**: Add `/app/data/mongodb/` under the shared `/app/data` volume, consistent with `/app/data/projects/`.
- **Documentation**: Update installation, configuration reference, self-hosting guide, and Docker reference to reflect that MongoDB is now embedded when `MONGODB_URI` is omitted.

## Impact

- Affected specs: `deployment`
- Affected code: `Dockerfile`, `entrypoint.sh`, `packages/core/src/config/env.ts`, `packages/core/src/infra/db.ts`, `docker-compose.yml` (comments), `apps/docs/`
- **Conflict note**: The pending `harden-security-for-public-release` change also modifies the `Single Docker Image Deployment` requirement (adds non-root user). These changes are compatible but must be merged carefully.
- No breaking changes — existing deployments that set `MONGODB_URI` continue to work unchanged.
