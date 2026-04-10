## ADDED Requirements

### Requirement: Playwright E2E Tests in CI

The CI pipeline SHALL run Playwright end-to-end browser tests against the Docker image on every pull request. The E2E test infrastructure SHALL:

- Live in a dedicated `apps/e2e/` workspace package with `@playwright/test`
- Use a `docker-compose.ci.yml` that starts the application Docker image alongside MongoDB and Redis
- Run after the Docker image is built and pushed to GHCR
- Execute tests against `localhost:8080` (the nginx entrypoint of the Docker image)
- Upload Playwright HTML reports and failure screenshots as GitHub Actions artifacts
- Block the PR from merging if any E2E test fails

The initial test suite SHALL cover at minimum:
- Login flow (navigate to app, authenticate with `UI_USERNAME` / `UI_PASSWORD`)
- Basic navigation (verify the main pages load without errors)

#### Scenario: PR with passing E2E tests

- **WHEN** a pull request is opened or updated
- **AND** the Docker image builds successfully
- **THEN** the E2E job starts the Docker image with MongoDB and Redis via Docker Compose
- **AND** waits for the health endpoint to return healthy
- **AND** runs Playwright tests against the running application
- **AND** the GitHub check is marked as successful

#### Scenario: PR with failing E2E tests

- **WHEN** a Playwright test fails (e.g., login page does not render, navigation error)
- **THEN** the GitHub check is marked as failed
- **AND** the Playwright HTML report and failure screenshots are uploaded as artifacts
- **AND** the PR is blocked from merging

#### Scenario: Docker image fails to start

- **WHEN** the Docker image starts but the health endpoint does not return healthy within 60 seconds
- **THEN** the E2E job fails without running Playwright tests
- **AND** the container logs are captured for debugging

### Requirement: Railway Post-Deploy Health Smoke Test

The CI pipeline SHALL include a GitHub Actions workflow that verifies Railway deployments are healthy after they complete. The workflow SHALL:

- Trigger on the `deployment_status` GitHub event emitted by Railway
- Filter for `deployment_status.state == 'success'`
- Extract the deployed service URL from `github.event.deployment_status.target_url`
- Poll `GET /api/health` on the extracted URL with retries (at least 20 attempts, 15-second intervals, 30-second initial delay)
- Pass when the health endpoint returns HTTP 200 with `{ "status": "healthy" }`
- Fail the GitHub check when the health endpoint is unreachable or unhealthy after all retries
- Skip gracefully (with a warning) if `target_url` is not present in the event payload

No Railway tokens or hardcoded service URLs SHALL be required.

#### Scenario: Successful production deployment

- **WHEN** Railway deploys to production and sends `deployment_status: success` with a `target_url`
- **THEN** the workflow polls the health endpoint until HTTP 200 with `status: "healthy"`
- **AND** the GitHub check is marked as successful

#### Scenario: Deployment is unhealthy after all retries

- **WHEN** the health endpoint returns HTTP 503 or is unreachable after all retry attempts
- **THEN** the GitHub check is marked as failed
- **AND** the last health response is logged for debugging

#### Scenario: Missing target_url in event

- **WHEN** Railway sends `deployment_status: success` but `target_url` is empty or missing
- **THEN** the workflow logs a warning and exits successfully (does not block)
