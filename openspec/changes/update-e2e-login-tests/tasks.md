## 1. CI Workflow - Random Credential Generation

- [x] 1.1 In `.github/workflows/pr-docker-build.yml`, add a step in the `e2e` job that generates a random `UI_USERNAME` (e.g., `e2e-user-<random>`) and `UI_PASSWORD` (e.g., 24-char alphanumeric) using shell commands (`openssl rand` or `uuidgen`)
- [x] 1.2 Export `UI_USERNAME` and `UI_PASSWORD` as environment variables for the Docker Compose `up` step
- [x] 1.3 Export `E2E_USERNAME` and `E2E_PASSWORD` (same values) as environment variables for the Playwright test step

## 2. Docker Compose CI Configuration

- [x] 2.1 Update `docker-compose.ci.yml` to use `${UI_USERNAME}` and `${UI_PASSWORD}` variable interpolation instead of hardcoded `admin` / `testpass123`

## 3. E2E Test Updates

- [x] 3.1 Update `apps/e2e/tests/smoke.spec.ts` to read credentials from `E2E_USERNAME` and `E2E_PASSWORD` env vars (with fallbacks for local dev if desired)
- [x] 3.2 Update existing "can log in with valid credentials" test to use the env-var-sourced credentials
- [x] 3.3 Add test: empty password submission shows error and stays on login page
- [x] 3.4 Add test: correct username with wrong password shows error banner and stays on login page
- [x] 3.5 Update existing "shows error with invalid credentials" test to use wrong-username/wrong-password (not hardcoded)

## 4. Verification

- [x] 4.1 Confirm no hardcoded credentials remain in `smoke.spec.ts`, `docker-compose.ci.yml`, or `pr-docker-build.yml`
- [x] 4.2 Verify local dev still works (Playwright config `webServer` starts compose, env vars default gracefully)
