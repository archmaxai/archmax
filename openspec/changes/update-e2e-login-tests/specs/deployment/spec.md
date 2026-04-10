## MODIFIED Requirements

### Requirement: Playwright E2E Tests in CI

The CI pipeline SHALL run Playwright end-to-end browser tests against the Docker image on every pull request. The E2E test infrastructure SHALL:

- Live in a dedicated `apps/e2e/` workspace package with `@playwright/test`
- Use a `docker-compose.ci.yml` that starts the application Docker image alongside MongoDB and Redis
- Run after the Docker image is built and pushed to GHCR
- Execute tests against `localhost:8080` (the nginx entrypoint of the Docker image)
- Upload Playwright HTML reports and failure screenshots as GitHub Actions artifacts
- Block the PR from merging if any E2E test fails

The CI workflow SHALL generate random `UI_USERNAME` and `UI_PASSWORD` values at runtime and inject them into the Docker Compose stack and the Playwright test environment via `E2E_USERNAME` and `E2E_PASSWORD` env vars. Credentials MUST NOT be hardcoded in any committed file (compose file, test file, or workflow).

`docker-compose.ci.yml` SHALL use environment variable interpolation (`${UI_USERNAME}`, `${UI_PASSWORD}`) instead of hardcoded credential values.

The E2E test suite SHALL read login credentials exclusively from `E2E_USERNAME` and `E2E_PASSWORD` environment variables and MUST NOT contain hardcoded usernames or passwords.

The test suite SHALL cover at minimum:
- Health endpoint returns healthy
- Unauthenticated redirect to login page
- Login page renders correctly (heading, username field, password field, sign-in button)
- Successful login with valid randomly-generated credentials
- Failed login with empty password
- Failed login with correct username and wrong password
- Failed login with wrong username and wrong password

#### Scenario: PR with passing E2E tests

- **WHEN** a pull request is opened or updated
- **AND** the Docker image builds successfully
- **THEN** the E2E job generates random `UI_USERNAME` and `UI_PASSWORD` values
- **AND** starts the Docker image with the generated credentials via Docker Compose
- **AND** waits for the health endpoint to return healthy
- **AND** runs Playwright tests with `E2E_USERNAME` and `E2E_PASSWORD` set to the generated values
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

#### Scenario: Empty password rejected at login

- **WHEN** the e2e test submits the correct username with an empty password
- **THEN** the login form shows an error
- **AND** the user remains on the login page

#### Scenario: Wrong password rejected at login

- **WHEN** the e2e test submits the correct username with an incorrect password
- **THEN** the login form shows an error banner
- **AND** the user remains on the login page

#### Scenario: Wrong username and password rejected at login

- **WHEN** the e2e test submits an unknown username with an incorrect password
- **THEN** the login form shows an error banner
- **AND** the user remains on the login page
