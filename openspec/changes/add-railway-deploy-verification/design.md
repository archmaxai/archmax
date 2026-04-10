## Context

The project builds a Docker image on every PR (`pr-docker-build.yml`) and deploys to Railway after CI passes ("Wait for CI" enabled). There is no browser-level end-to-end testing and no automated verification that Railway deployments are healthy.

The API exposes `GET /api/health` (unauthenticated), returning `{ status: "healthy"|"unhealthy", checks: {...}, timestamp }` with HTTP 200 or 503. The frontend is a React SPA served by nginx on port 8080.

## Goals / Non-Goals

- **Goal**: Automated E2E browser tests on every PR, running against the actual Docker image
- **Goal**: Lightweight post-deploy health check after Railway deploys
- **Goal**: No Railway tokens or hardcoded URLs needed
- **Non-goal**: Full E2E suite against live Railway (too slow, circular with "Wait for CI")
- **Non-goal**: Automatic rollback of failed deployments

## Decisions

### Two-layer testing strategy

| Layer | What | Where | When |
|-------|------|-------|------|
| Playwright E2E | Full user flows in browser | CI (Docker Compose on localhost) | Every PR |
| Health smoke test | `/api/health` curl | `deployment_status` workflow | After Railway deploys |

### E2E: Playwright against Docker image in CI

The existing `pr-docker-build.yml` already builds and pushes the Docker image. A new `e2e` job, dependent on `build`, starts the image alongside MongoDB and Redis via `docker-compose.ci.yml`, waits for the health endpoint, and runs Playwright tests.

**Why not test against Railway?** "Wait for CI" creates a circular dependency: Railway waits for CI to pass, but CI would be waiting for Railway to deploy. Running against the Docker image locally avoids this entirely and gives faster feedback.

**Compose setup**: `docker-compose.ci.yml` references the image built by the prior job (`ghcr.io/<repo>:pr-<number>`), adds `mongo:8` and `redis:8-alpine`, and exposes port 8080. The CI job pulls the just-pushed image, starts the stack, and waits for `/api/health` before running tests.

**Playwright package**: A new `apps/e2e/` workspace package with `@playwright/test`. Tests are browser-only (no Node API tests, those are already covered by vitest). Initial tests cover login flow and basic navigation to validate the Docker image serves the full stack correctly.

### Post-deploy smoke test: `deployment_status` event

Railway sends `deployment_status` events to GitHub when deployments succeed. The workflow:

1. Triggers on `deployment_status` with state `success`
2. Extracts the service URL from `github.event.deployment_status.target_url`
3. Polls `/api/health` with retries (30s initial delay, 15s intervals, 20 attempts)
4. Passes on HTTP 200 + `"healthy"`, fails otherwise

**No Railway token needed**: The event payload contains the service URL. This is a simple smoke test, not a full E2E run. If `target_url` is empty (known issue with Railway PR environments), the health check is skipped with a warning rather than failing.

## Risks / Trade-offs

- **CI time**: E2E adds ~2-3 minutes to PR builds (Playwright install + test execution). Mitigated by running in parallel with the Docker push.
- **Docker image pull**: The E2E job needs to pull the image that was just pushed. This requires the GHCR login and depends on the build job completing first.
- **Flaky browser tests**: Playwright tests can be flaky due to timing. Use `expect.toBeVisible()` with timeouts rather than hard waits.
- **`target_url` reliability**: Railway may not always populate `target_url`, especially for PR preview environments. The smoke test handles this gracefully by skipping.
