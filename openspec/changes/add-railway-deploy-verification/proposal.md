# Change: Add deployment verification with E2E tests and post-deploy health checks

## Why

There is no automated end-to-end testing of the application as a user would experience it, and Railway deployments have no post-deploy health verification. A crashed or broken deployment goes unnoticed until someone manually checks.

## What Changes

Two layers of deployment verification:

1. **Playwright E2E tests in CI** (pre-merge, every PR)
   - New `docker-compose.ci.yml` that spins up the built Docker image with local MongoDB and Redis
   - Playwright test suite in a new `apps/e2e/` package
   - New E2E job in `.github/workflows/pr-docker-build.yml` that runs after the Docker image is built
   - Tests run against `localhost:8080`, no Railway or external dependencies needed
   - Test results and screenshots uploaded as artifacts

2. **Post-deploy health smoke test** (after Railway deploys)
   - New `.github/workflows/deploy.yml` triggered by Railway's `deployment_status` event
   - Lightweight `curl` check against `/api/health` on the deployed URL
   - No `RAILWAY_TOKEN` needed; uses `deployment_status.target_url` from the event

## Impact

- Affected specs: `deployment`
- New files: `docker-compose.ci.yml`, `apps/e2e/` (Playwright config + tests), updated `pr-docker-build.yml`, new `deploy.yml`
- New dev dependency: `@playwright/test`
- No new secrets required
