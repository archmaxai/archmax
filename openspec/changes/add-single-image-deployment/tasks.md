## 1. Dockerfile — install embedded services

- [x] 1.1 Add MongoDB 7.x community `mongod` binary to the production stage (official apt repo for `node:20-slim` / Debian Bookworm)
- [x] 1.2 Add `redis-server` to the production stage (`apt-get install redis-server`)
- [x] 1.3 Create `/app/data/mongodb` directory in the image
- [x] 1.4 Verify image builds successfully with the new packages

## 2. Entrypoint — conditional service startup

- [x] 2.1 If `MONGODB_URI` is unset, start `mongod --bind_ip 127.0.0.1 --dbpath /app/data/mongodb --logpath /var/log/mongod.log --fork` and export `MONGODB_URI=mongodb://127.0.0.1:27017/archsem`
- [x] 2.2 Add a readiness loop that waits for `mongod` to accept connections before proceeding (poll with `mongosh --eval "db.adminCommand('ping')"` or a TCP check)
- [x] 2.3 If `REDIS_URL` is unset, start `redis-server --daemonize yes --dir /tmp/redis --bind 127.0.0.1` and export `REDIS_URL=redis://127.0.0.1:6379`
- [x] 2.4 Ensure `mkdir -p` for `/app/data/mongodb` and `/tmp/redis` in the entrypoint (handle fresh volumes)

## 3. Env schema — make MONGODB_URI optional

- [x] 3.1 Change `MONGODB_URI: z.string()` to `MONGODB_URI: z.string().optional()` in `packages/core/src/config/env.ts`
- [x] 3.2 Update `getMongoUri()` in `packages/core/src/infra/db.ts` to throw a clear error if `MONGODB_URI` is still undefined at connection time (safety net for non-Docker local dev without `.env`)

## 4. Docker Compose file

- [x] 4.1 Create `docker-compose.yml` at repository root with `archsem`, `mongo`, and `redis` services
- [x] 4.2 Include `.env.example` or inline comments documenting required variables (`BETTER_AUTH_SECRET`, `UI_PASSWORD`, `AGENT_API_KEY`)
- [x] 4.3 Verify `docker compose up` starts all services and archsem connects to external Mongo/Redis

## 5. Documentation

- [x] 5.1 Rewrite `apps/docs/src/content/docs/getting-started/installation.mdx`:
  - Replace the current "Quick Start" `docker run` with a zero-dependency version (only `BETTER_AUTH_SECRET` + `UI_PASSWORD` required, single `-v archsem-data:/app/data` mount)
  - Add a note that MongoDB and Redis are embedded automatically when their env vars are omitted
  - Move the current external-MongoDB `docker run` example into an "Advanced: External Services" subsection
  - Update the Docker Compose section to reference the repo-root `docker-compose.yml` instead of inlining YAML; show how to clone + `docker compose up`
  - Remove "A MongoDB instance (local or hosted)" from Prerequisites
- [x] 5.2 Update `apps/docs/src/content/docs/reference/configuration.mdx`:
  - Move `MONGODB_URI` from "Required Variables" to a new "Database" section; mark it as optional with a note that the Docker image embeds MongoDB when unset
  - Add a "Data Directory" section documenting `/app/data/` layout (`projects/`, `mongodb/`) and the single-volume strategy
  - Add a note to the `REDIS_URL` row that the Docker image embeds Redis when unset
- [x] 5.3 Create `apps/docs/src/content/docs/guides/self-hosting.mdx` — a dedicated self-hosting guide covering:
  - Deployment modes: single image vs. Docker Compose vs. Kubernetes (Compose + external services recommended for production)
  - Data backup: how to back up the `/app/data` volume (stop container, copy/tar the volume, or use `docker cp`)
  - Upgrading: pulling a new image, restarting, and data migration notes
  - Resource recommendations (RAM, disk) for small/medium deployments
  - When to use external MongoDB (replication, auth, managed hosting) vs. embedded
- [x] 5.4 Create `apps/docs/src/content/docs/reference/docker.mdx` — an in-depth Docker reference covering:
  - Image contents (what's bundled: API, worker, SPA, nginx, embedded MongoDB, embedded Redis)
  - Exposed port (`8080`)
  - Complete environment variable table with every variable, its default, whether it's required, and Docker-specific notes (e.g. `MONGODB_URI` — omit to use embedded MongoDB, `REDIS_URL` — omit to use embedded Redis, `ARCHSEM_DATA_DIR` — defaults to `/app/data/projects` inside the container)
  - Volumes: `/app/data` (persistent — projects + embedded MongoDB), `/tmp/redis` (ephemeral), `/var/log/mongod.log` (embedded MongoDB log)
  - Entrypoint behavior: decision tree for embedded vs. external services, startup order (mongod → readiness check → redis → worker → API → nginx)
  - Health check recommendations (e.g. `curl -f http://localhost:8080/api/health`)
  - Resource requirements (minimum RAM/disk recommendations)
  - Examples: minimal `docker run`, `docker run` with external services, Compose reference
  - Troubleshooting: common issues (port conflicts, volume permissions, mongod startup failures)
- [x] 5.5 Add the Docker reference and self-hosting guide to the sidebar in `apps/docs/astro.config.mjs` (Docker under "Reference", self-hosting under "Guides")
- [x] 5.6 Update `apps/docs/src/content/docs/getting-started/quickstart.mdx` — no MongoDB mentions found; no changes needed

## 6. Validation

- [x] 6.1 Build the Docker image and verify zero-dependency startup (`docker run` with only `BETTER_AUTH_SECRET` and `UI_PASSWORD`)
- [x] 6.2 Verify external `MONGODB_URI` overrides embedded MongoDB
- [x] 6.3 Verify Compose stack starts with separate services
- [x] 6.4 Verify existing local dev workflow still requires `MONGODB_URI` in `.env`
