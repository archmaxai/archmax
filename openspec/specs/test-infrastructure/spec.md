# test-infrastructure Specification

## Purpose
TBD - created by archiving change add-comprehensive-test-strategy. Update Purpose after archive.
## Requirements
### Requirement: CI Pipeline
The project SHALL provide a GitHub Actions workflow (`.github/workflows/ci.yml`) that runs on every pull request and push to main. The workflow SHALL execute two sequential jobs: `lint-and-typecheck` (runs `pnpm lint` and `pnpm typecheck` in parallel) and `test` (runs `pnpm test` with coverage, depends on lint-and-typecheck). The workflow SHALL use a MongoDB service container for tests that require a database. The workflow SHALL cache pnpm dependencies and Turborepo artifacts between runs.

#### Scenario: PR triggers CI
- **WHEN** a pull request is opened or updated targeting `main`
- **THEN** the CI workflow starts with `lint-and-typecheck`
- **AND** if linting or typechecking fails, the workflow stops without running tests
- **AND** the PR status check reports the failure

#### Scenario: Push to main triggers full pipeline
- **WHEN** a commit is pushed to `main`
- **THEN** both jobs run: lint-and-typecheck and test
- **AND** test results and coverage summary are available in the workflow output

#### Scenario: Dependency caching
- **WHEN** a CI run starts and a previous cache exists for the same lockfile hash
- **THEN** pnpm dependencies are restored from cache
- **AND** Turborepo remote cache hits reduce build time for unchanged packages

### Requirement: Coverage Configuration
The project SHALL configure Vitest coverage using `@vitest/coverage-v8` with per-workspace threshold enforcement. Coverage SHALL be reported in `json-summary` format for CI consumption, `html` for local browsing, and `text` for terminal output. Per-workspace thresholds SHALL be set as minimum floors: `packages/core` at 50% lines, `apps/api` at 30% lines, `apps/frontend` at 30% lines. Packages without meaningful test coverage (`apps/worker`, `packages/ui`) SHALL have no threshold initially. Thresholds SHALL be ratcheted upward as coverage improves.

#### Scenario: Coverage report generated on test run
- **WHEN** `pnpm test` is run with coverage enabled
- **THEN** a coverage report is generated per workspace
- **AND** the terminal shows a text summary of lines, branches, functions, and statements coverage
- **AND** an HTML report is written to `coverage/` for local inspection

#### Scenario: Coverage threshold failure
- **WHEN** a code change reduces `packages/core` line coverage below 50%
- **THEN** the test command exits with a non-zero code
- **AND** the CI pipeline fails with a clear message indicating which threshold was violated

#### Scenario: Coverage threshold ratcheting
- **WHEN** a package's actual coverage exceeds its threshold by more than 10 percentage points
- **THEN** a maintainer SHOULD update the threshold in `vitest.workspace.ts` to the new floor (current minus 5% buffer)

### Requirement: Shared Test Utilities
The project SHALL provide shared test utilities in `packages/core/src/test-utils/` exported as a barrel module. Utilities SHALL include: `mockDb()` for stubbing the database connection and returning typed model mocks, factory functions (`createProject()`, `createConnection()`, `createTestAgent()`, `createTestCase()`, `createTestRun()`) that produce valid test data with sensible defaults and override support, and `mockLlm()` for creating controllable LLM mocks with `invoke` and `stream` methods. Factory functions SHALL keep model shape in sync with Mongoose schemas by importing types from the models.

#### Scenario: Use mockDb in a unit test
- **WHEN** a test calls `mockDb()` before importing a service that depends on the database
- **THEN** all `connectDB()` calls are intercepted
- **AND** model methods (find, create, findByIdAndUpdate, etc.) are available as `vi.fn()` stubs
- **AND** the test can assert on model interactions without a running MongoDB

#### Scenario: Use factory to create test data
- **WHEN** a test calls `createTestAgent({ name: "Custom" })`
- **THEN** a plain object is returned with all required TestAgent fields populated with defaults
- **AND** the `name` field is overridden to `"Custom"`
- **AND** the object matches the TestAgent TypeScript type

#### Scenario: Use mockLlm for agent tests
- **WHEN** a test calls `mockLlm()` and configures it to return a specific response
- **THEN** the mock can be passed to any agent function expecting an LLM instance
- **AND** the test can assert on the prompts sent to `invoke` and `stream`

### Requirement: Integration Test Patterns
The project SHALL support integration tests for API routes using Hono's `app.request()` method. Integration tests SHALL import the Hono sub-app for a route module, mock the database layer using shared utilities, and exercise the full middleware stack (auth, validation, error handling, serialization) without starting an HTTP server. Each API route module in `apps/api/src/routes/` SHALL have a corresponding `*.test.ts` file that includes at least one integration test verifying the happy path and one verifying error handling.

#### Scenario: Integration test for a GET endpoint
- **WHEN** an integration test calls `app.request("/api/projects/:projectId/test-agents", { method: "GET" })` with a mocked auth session
- **THEN** the request passes through auth middleware
- **AND** the route handler is invoked with the mocked database
- **AND** the response status and JSON body can be asserted

#### Scenario: Integration test for validation error
- **WHEN** an integration test sends an invalid POST body to a route
- **THEN** the Zod validation middleware rejects the request
- **AND** the response has status 400 with a structured error message

#### Scenario: Integration test for auth failure
- **WHEN** an integration test sends a request without a valid session
- **THEN** the auth middleware returns 401
- **AND** the route handler is never invoked

### Requirement: Dockerfile Test Stage
The Dockerfile SHALL include a `test` stage that runs the full test suite (`pnpm test`) after dependency installation and before the production build. The test stage SHALL use the same base image and dependency cache as the build stage. When building for CI or production, the test stage MUST pass before the build stage executes. For local development builds, the test stage MAY be skipped using `--target=build`.

#### Scenario: Docker build with tests
- **WHEN** `docker build .` is run without a target override
- **THEN** the test stage executes `pnpm test`
- **AND** if any test fails, the Docker build fails and no image is produced

#### Scenario: Docker build skipping tests
- **WHEN** `docker build --target=build .` is run
- **THEN** the test stage is skipped
- **AND** the image is built directly from dependencies

### Requirement: Contributor Testing Documentation
The project SHALL provide a testing section in `CONTRIBUTING.md` that documents: how to run the full test suite (`pnpm test`), how to run tests for a specific package (`pnpm --filter @archmax/core test`), how to run tests in watch mode, how to view coverage reports, the project's test file naming convention (`*.test.ts` colocated with source), the mocking strategy (when to use `vi.mock` vs shared `mockDb`), and examples of writing unit tests and integration tests. The documentation SHALL include a quick-start example that a new contributor can follow to write their first test.

#### Scenario: New contributor writes a unit test
- **WHEN** a new contributor reads `CONTRIBUTING.md` and follows the testing quick-start
- **THEN** they can create a `*.test.ts` file next to the source file they want to test
- **AND** they can import shared test utilities from `@archmax/core/test-utils`
- **AND** they can run `pnpm test` and see their test pass or fail

#### Scenario: Contributor checks coverage locally
- **WHEN** a contributor runs `pnpm test -- --coverage`
- **THEN** a coverage report is generated
- **AND** the contributor can open `coverage/index.html` to see which lines are covered

### Requirement: E2E Docker Compose stack documentation

The project SHALL document how to run Playwright E2E tests locally using `docker-compose.ci.yml` with the same services as CI: the application image, MongoDB, Redis, PostgreSQL, MySQL, Microsoft SQL Server, and the SQLite file mount. The documentation SHALL include: setting `APP_IMAGE` (or building a local tag), aligning `E2E_USERNAME` and `E2E_PASSWORD` with `UI_USERNAME` and `UI_PASSWORD` in compose, installing Playwright browsers (`pnpm --filter @archmax/e2e exec playwright install --with-deps chromium`), running tests, and tearing down with `docker compose ... down -v`. It SHALL note MSSQL container resource expectations and that the supported image is pulled from `mcr.microsoft.com/mssql/server`. The `docker-compose.ci.yml` app service SHALL provide a writable `ARCHMAX_DATA_DIR` (`/data`) via tmpfs so the application can write semantic model files and published builds required by the MCP E2E tests.

#### Scenario: Contributor runs federated E2E before CI

- **WHEN** a contributor follows the documented steps on a clean machine with Docker and pnpm
- **THEN** they can start the full stack and execute the E2E suite successfully
- **AND** federated-database tests behave the same as in GitHub Actions

#### Scenario: MCP E2E tests use writable data volume

- **WHEN** the Docker Compose stack is started
- **THEN** the app container has a writable data directory at `/data`
- **AND** semantic models created via the API are persisted and available to the MCP endpoint after publish

