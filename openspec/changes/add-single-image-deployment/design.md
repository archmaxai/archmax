## Context

archsem ships as a single Docker image that bundles the API, worker, frontend, and nginx. MongoDB and Redis are required as external services, which complicates the simplest deployment path. This change embeds both services as optional fallbacks inside the image while preserving the ability to use external instances.

## Goals / Non-Goals

- **Goals**:
  - Zero external dependencies for a working `docker run` command
  - Single volume mount covers all persistent data
  - Existing `MONGODB_URI` / `REDIS_URL` deployments continue unaffected
  - Production-quality `docker-compose.yml` for users who want dedicated services
  - Documentation updated to reflect both modes

- **Non-Goals**:
  - Embedded MongoDB replication or authentication (single-node, dev/small-team use)
  - Redis persistence (agent queue is transient; data loss on restart is acceptable)
  - Supporting non-Docker deployment modes (e.g., systemd units)

## Decisions

### Embedded MongoDB via mongod

- **Decision**: Install `mongod` directly in the Docker image using the official MongoDB apt repository (community edition 7.x). Start it from the entrypoint when `MONGODB_URI` is unset.
- **Alternatives considered**:
  - *MongoDB-in-a-container sidecar* — defeats the single-image goal.
  - *SQLite as an alternative* — would require rewriting all Mongoose models; too invasive.
- **Data path**: `/app/data/mongodb` — under the shared `/app/data` volume alongside projects.
- **Default URI**: `mongodb://127.0.0.1:27017/archsem` — set automatically in the entrypoint so the rest of the application is unaware of the embedded mode.
- **Configuration**: `mongod` runs with `--bind_ip 127.0.0.1 --dbpath /app/data/mongodb --logpath /var/log/mongod.log --fork`. No authentication (container-internal only).

### Embedded Redis via redis-server

- **Decision**: Install `redis-server` from the Debian apt repository. Start it from the entrypoint when `REDIS_URL` is unset.
- **Alternatives considered**:
  - *Skip Redis entirely* — agent already falls back to in-process mode. However, enabling Redis provides proper BullMQ job queuing and cancellation even in single-image mode.
  - *Keydb/Dragonfly* — unnecessary for the scale; standard `redis-server` is simpler.
- **Data path**: `/tmp/redis` — ephemeral, no persistence needed. Queue data is transient.
- **Default URL**: `redis://127.0.0.1:6379` — set automatically in the entrypoint.

### Unified data directory layout

```
/app/data/
├── projects/      # Semantic model YAML files (ARCHSEM_DATA_DIR)
└── mongodb/       # Embedded MongoDB data files
```

A single `-v archsem-data:/app/data` captures all persistent state. Redis is intentionally excluded (stored in `/tmp`).

### Env schema changes

`MONGODB_URI` becomes optional in the Zod schema. When not provided:
- In Docker (embedded mode): the entrypoint sets `MONGODB_URI=mongodb://127.0.0.1:27017/archsem` before starting the Node processes.
- In local dev: the bootstrap file already loads `.env` / `.env.local`, so developers must still provide it there.

The env validation in `packages/core/src/config/env.ts` gains a default value only in the Docker entrypoint (not in the Zod schema itself), keeping the contract explicit for non-Docker users.

### Docker Compose file

A root-level `docker-compose.yml` provides the recommended production setup:
- `archsem` service with explicit `MONGODB_URI` and `REDIS_URL` pointing to companion services
- `mongo` service (mongo:7, data volume)
- `redis` service (redis:7-alpine, no persistence)
- Named volumes for `archsem-data`, `mongo-data`

### Image size consideration

Adding `mongod` (~150MB) and `redis-server` (~5MB) increases the image significantly. This is acceptable for the deployment ergonomics gained. Users who don't need embedded services can use the Compose file with a slimmer custom build in the future (non-goal for now).

## Risks / Trade-offs

- **Increased image size** (~150-200MB larger) → Acceptable for simplicity; document Compose alternative for size-conscious users.
- **Embedded MongoDB is single-node, no auth** → Clearly document as suitable for evaluation, dev, and small-team use. Production deployments should use external MongoDB.
- **Redis data loss on container restart** → By design; BullMQ queue data is transient. Running jobs will be lost on hard restart regardless.
- **`mongod` startup race** → Entrypoint must wait for `mongod` to be ready before starting the API. A readiness loop (poll `mongosh --eval "db.adminCommand('ping')"`) handles this.

## Open Questions

- None — all decisions are straightforward given the single-user, single-image constraints.
