## 1. Playwright E2E Setup

- [x] 1.1 Create `apps/e2e/` workspace package with `@playwright/test` dependency
- [x] 1.2 Add `playwright.config.ts` targeting `http://localhost:8080`
- [x] 1.3 Write initial E2E tests: login flow and basic navigation
- [x] 1.4 Create `docker-compose.ci.yml` (app image + mongo + redis, port 8080)

## 2. CI Workflow Update

- [x] 2.1 Add `e2e` job to `.github/workflows/pr-docker-build.yml` dependent on `build`
- [x] 2.2 Pull the built image, start stack via `docker-compose.ci.yml`, wait for health
- [x] 2.3 Install Playwright browsers and run tests
- [x] 2.4 Upload Playwright report and screenshots as artifacts
- [x] 2.5 Capture container logs on failure

## 3. Post-Deploy Smoke Test

- [x] 3.1 Simplify `.github/workflows/deploy.yml` to use `deployment_status.target_url` (remove Railway CLI dependency)
- [x] 3.2 Add graceful skip when `target_url` is missing
- [x] 3.3 Keep health check polling loop (30s delay, 15s intervals, 20 retries)

## 4. Supporting Changes

- [x] 4.1 Add `apps/e2e/package.json` to Dockerfile deps and production stages (lockfile consistency)
- [x] 4.2 Update `pnpm-lock.yaml` with new `@playwright/test` dependency

## 5. Verification

- [ ] 5.1 Run E2E tests locally against Docker Compose to confirm they pass
- [ ] 5.2 Open a PR and confirm the E2E job runs and passes
- [ ] 5.3 Confirm post-deploy health check triggers after Railway deploys
