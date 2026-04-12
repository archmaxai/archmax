# Change: Randomize E2E login credentials and expand login test coverage

## Why

The current E2E tests hardcode `admin` / `testpass123` in both `docker-compose.ci.yml` and `smoke.spec.ts`. This exposes the test password in the repository and makes the test fragile if someone changes the compose defaults. Additionally, the login failure tests only cover a single wrong-username/wrong-password case but miss important edge cases (empty password, correct username with wrong password).

## What Changes

- CI workflow generates random `UI_USERNAME` and `UI_PASSWORD` at runtime and injects them into both the Docker Compose stack and the Playwright test environment
- `docker-compose.ci.yml` switches from hardcoded credentials to environment variable interpolation (`${UI_USERNAME}`, `${UI_PASSWORD}`)
- `smoke.spec.ts` reads credentials from `E2E_USERNAME` / `E2E_PASSWORD` env vars instead of hardcoding them
- New test cases: empty password submission and correct username with wrong password
- Existing invalid credentials test updated to also verify correct-username-wrong-password

## Impact

- Affected specs: `deployment` (Playwright E2E Tests in CI)
- Affected code: `.github/workflows/pr-docker-build.yml`, `docker-compose.ci.yml`, `apps/e2e/tests/smoke.spec.ts`
