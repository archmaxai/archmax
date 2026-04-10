## Context

The `remove-embedded-mongodb` change (archived 2026-04-09) stripped MongoDB from the Docker image citing ~275 MB image size and lack of replica set support. However, requiring an external MongoDB increases onboarding friction for new users. This change re-introduces embedded MongoDB following the exact same conditional pattern as the existing embedded Redis.

## Goals / Non-Goals

- **Goals**:
  - Enable zero-dependency `docker run` (only `BETTER_AUTH_SECRET` and `UI_PASSWORD` required)
  - Follow the same conditional-start pattern as Redis: install always, start only when `MONGODB_URI` is unset
  - Store MongoDB data under `/app/data/mongodb` so a single volume mount captures all persistent state
  - Keep `docker compose up` as the recommended production deployment

- **Non-Goals**:
  - Adding replica set or transaction support for embedded mode
  - Adding process supervision (s6, supervisord)
  - Changing the MongoDB driver or Mongoose version

## Decisions

### Install MongoDB Community 8.x in the image

- **Decision**: Add the official MongoDB apt repository and install `mongodb-org-server` in the Dockerfile production stage.
- **Rationale**: Matches the pattern established for Redis. MongoDB 8.x is the current LTS and matches the `mongo:8` image used in `docker-compose.yml`.
- **Trade-off**: Adds ~275 MB to the image. Acceptable for the convenience of zero-dependency deployment. Users who need a minimal image can always use Docker Compose with the separate `mongo:8` container.

### Conditional start in entrypoint

- **Decision**: If `MONGODB_URI` is unset, start `mongod --bind_ip 127.0.0.1 --dbpath /app/data/mongodb --logpath /var/log/mongod.log --fork`, wait for readiness, then export `MONGODB_URI=mongodb://127.0.0.1:27017/archmax`.
- **Rationale**: Mirrors the existing Redis block. Forked `mongod` starts before the Node processes.
- **Readiness check**: Poll `mongosh --eval 'db.runCommand({ping:1})' --quiet` in a loop (max ~10 seconds) before proceeding.

### MongoDB data at /app/data/mongodb

- **Decision**: Store embedded MongoDB data at `/app/data/mongodb/`, alongside `/app/data/projects/`.
- **Rationale**: A single `-v` mount to `/app/data` captures both project files and database data, consistent with the existing layout.

### Make MONGODB_URI optional

- **Decision**: Revert `MONGODB_URI` to `z.string().optional()` in the env schema.
- **Rationale**: The entrypoint provides a fallback when running in Docker. The `connectDB()` function already validates at connection time.

## Risks / Trade-offs

- **Image size increase (~275 MB)** → Acceptable for zero-dependency UX. Production users who need smaller images use Compose.
- **No replica set in embedded mode** → Transactions are not available. This is fine for single-user archmax. Documented as a limitation.
- **Unsupervised mongod process** → If `mongod` crashes, the container must be restarted. Consistent with how embedded Redis is handled (no supervision either).

## Open Questions

- None.
