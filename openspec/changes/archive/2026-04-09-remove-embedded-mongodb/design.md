## Context

The `add-single-image-deployment` change embedded MongoDB and Redis into the Docker image to enable zero-dependency `docker run`. In practice, embedding MongoDB adds ~275 MB, prevents transactions (no replica set), and creates an unsupervised process inside the container. Redis is lightweight (~5 MB), ephemeral by design, and safe to keep embedded.

This change removes MongoDB from the image while retaining embedded Redis.

## Goals / Non-Goals

- **Goals**:
  - Reduce Docker image size by ~275 MB
  - Eliminate unsupervised `mongod` process from the container
  - Position `docker compose up` as the primary quick-start method
  - Keep `docker run` viable for users who supply their own `MONGODB_URI`
  - Keep embedded Redis for zero-config BullMQ queuing

- **Non-Goals**:
  - Migrating from MongoDB to another database
  - Adding process supervision (s6, supervisord) for remaining processes
  - Removing Redis from the image

## Decisions

### Remove MongoDB, keep Redis

- **Decision**: Strip all MongoDB packages from the Dockerfile. Keep `redis-server`.
- **Rationale**: MongoDB accounts for ~98% of the embedded-services size increase. Redis adds ~5 MB and provides genuine value (BullMQ job queuing with cancellation) with no operational risk.
- **Alternative considered**: Remove both and require Compose for everything — rejected because Redis is tiny, ephemeral, and the entrypoint pattern is simple.

### Make MONGODB_URI required again

- **Decision**: Revert `MONGODB_URI` to a required field in the Zod env schema.
- **Rationale**: Without an embedded fallback, a missing URI is a fatal misconfiguration. Failing fast with a clear error is better than a cryptic connection refusal.
- **Impact on local dev**: No change — developers already set `MONGODB_URI` in `.env`.

### docker-compose.yml as primary quick-start

- **Decision**: The installation docs lead with `docker compose up` instead of `docker run`.
- **Rationale**: With MongoDB required externally, Compose is the simplest path that works out of the box. A `docker run` one-liner still works but requires the user to have MongoDB available separately.

### Simplified data directory

- **Decision**: Remove `/app/data/mongodb/` from the directory layout. The persistent volume mount covers only `/app/data/projects/`.
- **Rationale**: MongoDB data is now managed by its own container/service, not embedded in the app container.

## Risks / Trade-offs

- **Breaking change for zero-dependency users** → Users who relied on `docker run` without `MONGODB_URI` must now provide one or switch to Compose. Mitigated by clear migration guidance in docs.
- **Compose is slightly more steps than `docker run`** → Acceptable; `docker compose up -d` is a single command after cloning the repo. The `.env.example` file already exists.
- **Image still bundles nginx + Redis + two Node processes** → Out of scope; this change focuses on the highest-impact removal (MongoDB).

## Open Questions

- None.
