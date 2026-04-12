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
