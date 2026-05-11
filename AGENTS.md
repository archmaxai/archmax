<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

## E2E Testing with Docker

When running E2E tests locally against the Docker Compose stack (`docker-compose.ci.yml`):

### Stale Docker images

The compose file defaults to `${APP_IMAGE:-ghcr.io/archmaxai/archmax:latest}`. If you build a
local image with `docker build -t archmax:local .`, you **must** pass the tag explicitly:

```bash
APP_IMAGE=archmax:local docker compose -f docker-compose.ci.yml --env-file /dev/null up -d
```

Without this, `docker compose up` pulls or reuses the remote `:latest` image and your local code
changes will not be reflected — tests will run against stale code with no visible error.

After rebuilding the image, always **force-recreate** the app container so Docker picks up the new
image layers:

```bash
APP_IMAGE=archmax:local docker compose -f docker-compose.ci.yml --env-file /dev/null up -d --force-recreate app
```

### Fresh state

Rate-limit records and other ephemeral data accumulate in MongoDB across runs. If login tests
start returning 429, tear down and recreate all containers:

```bash
APP_IMAGE=archmax:local docker compose -f docker-compose.ci.yml --env-file /dev/null down
APP_IMAGE=archmax:local docker compose -f docker-compose.ci.yml --env-file /dev/null up -d
```

## Cursor Cloud specific instructions

### Services

| Service | Purpose | Dev URL |
|---------|---------|---------|
| API (Hono) | Backend REST + MCP server | http://localhost:3000 |
| Frontend (Vite + React) | SPA with TanStack Router | http://localhost:5173 |
| Worker (BullMQ) | Background agent/test jobs | (no HTTP endpoint) |
| Docs (Astro Starlight) | Documentation site | http://localhost:4321 |

### Prerequisites before `pnpm dev`

MongoDB and Redis must be running locally. The update script installs them if missing and starts
them automatically. If they die between runs, restart them:

```bash
sudo mongod --dbpath /data/db --fork --logpath /var/log/mongod.log --quiet
sudo redis-server --daemonize yes
```

### Environment file

The app loads `.env.local` (takes precedence) then `.env` from the repo root
(see `packages/core/src/config/bootstrap.ts`). A working `.env.local` needs at minimum:

- `BETTER_AUTH_SECRET` — session encryption (min 32 chars)
- `UI_USERNAME` / `UI_PASSWORD` — admin credentials (default user: `admin`)
- `MONGODB_URI` — e.g. `mongodb://localhost:27017/archmax`
- `REDIS_URL` — e.g. `redis://localhost:6379`
- `AGENT_API_KEY` — required only for AI agent features; can be a dummy value to start the app

The data directory (`/workspace/data`) must exist; create it with `mkdir -p /workspace/data`.

### Running checks

| Task | Command | Notes |
|------|---------|-------|
| Lint | `pnpm lint` | Runs ESLint via Turborepo across all packages |
| Typecheck | `pnpm typecheck` | Runs `tsc --noEmit` across all packages |
| Unit/integration tests | `npx vitest run` | Run from repo root; uses workspace config in `vitest.config.ts` |
| Tests (turbo) | `pnpm test` | May fail with "no test files" on packages without tests; prefer `npx vitest run` |
| Coverage | `pnpm test:coverage` | Generates text + HTML + JSON reports |
| Dev servers | `pnpm dev` | Starts API, frontend, worker, docs concurrently via Turborepo |

### Build scripts approval

`msgpackr-extract` and `sharp` need build-script approval in `package.json` under
`pnpm.onlyBuiltDependencies`. This is already configured in the repo.
