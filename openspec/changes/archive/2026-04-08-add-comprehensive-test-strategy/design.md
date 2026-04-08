## Context

Semlayer is preparing for open-source release. Contributors need confidence that their changes don't break existing behavior, and maintainers need automated gates to catch regressions before merge. The current test setup is ad-hoc: 17 test files with inline mock helpers, no CI, no coverage, no E2E. This design establishes the testing architecture across all layers.

## Goals / Non-Goals

- Goals:
  - Automated CI that runs on every PR and push to main
  - Coverage tracking with visibility into under-tested areas
  - Reusable test utilities that reduce friction for new tests
  - Integration tests for API routes using Hono's built-in test client
  - Clear contributor documentation on how to write and run tests

- Non-Goals:
  - E2E / browser-based testing (deferred to a follow-up proposal)
  - 100% coverage mandates (pragmatic thresholds over vanity metrics)
  - Visual regression testing (defer until design system stabilizes)
  - Load/performance testing (separate initiative)
  - Mutation testing (too slow for CI at this stage)

## Decisions

### 1. CI Platform: GitHub Actions

- **Decision**: GitHub Actions with a single `ci.yml` workflow
- **Rationale**: Native GitHub integration, free for public repos, ubiquitous in open-source
- **Structure**: Three jobs — `lint-and-typecheck`, `test`, `e2e` — with `test` depending on `lint-and-typecheck` to fail fast
- **Alternatives considered**: CircleCI (requires separate account), Buildkite (complex setup), none of which match GitHub's zero-config for public repos

### 2. Coverage: Vitest coverage-v8

- **Decision**: Use `@vitest/coverage-v8` with per-workspace thresholds
- **Rationale**: V8 native coverage is fast, zero-config with Vitest, and doesn't require Istanbul instrumentation
- **Thresholds**: Start with realistic floors based on current state — 50% lines for `packages/core` (strongest today), 30% for `apps/api` and `apps/frontend`, no threshold for `apps/worker` and `packages/ui` initially. Ratchet up as coverage grows.
- **Reporting**: `json-summary` for CI, `html` for local dev, `text` for terminal output
- **Alternatives considered**: Istanbul/c8 (redundant with v8), Codecov (adds external dependency — can add later for badge/PR comments)

### 3. Shared Test Utilities: packages/core/src/test-utils/

- **Decision**: Colocate test utilities in `packages/core/src/test-utils/` as a barrel export
- **Rationale**: Core already holds models and services; test helpers for those naturally live there. API-specific helpers live in `apps/api/src/test-utils/`.
- **Helpers**:
  - `db-mock.ts` — `mockDb()` that stubs `connectDB` and returns typed model mocks; consolidates the ad-hoc `vi.mock("../infra/db")` patterns
  - `factories.ts` — `createProject()`, `createConnection()`, `createTestAgent()`, `createTestCase()` etc. with sensible defaults and overrides
  - `llm-mock.ts` — `mockLlm()` returning a controllable fake with `invoke`, `stream` methods
- **Alternatives considered**: Separate `packages/test-utils` package (over-engineered for current scale)

### 4. Integration Tests: Hono app.request()

- **Decision**: Test API routes by calling `app.request()` directly on the Hono app instance
- **Rationale**: Exercises the full middleware stack (auth, validation, error handling) without starting a server. Fast, deterministic, and tests the real routing logic.
- **Pattern**: Each route module exports its Hono sub-app. Integration tests import it, mock the DB layer, and call `app.request(path, { method, body, headers })`.
- **Alternatives considered**: Supertest (requires HTTP server), MSW (intercepts fetch, doesn't test Hono middleware)

### 5. Dockerfile Test Stage

- **Decision**: Add a `test` stage between `deps` and `build` in the multi-stage Dockerfile
- **Rationale**: Ensures the Docker build fails if tests fail, preventing broken images from being pushed
- **Trade-off**: Increases build time by ~30-60s. Acceptable for CI; local dev can skip with `--target=build`.

## Risks / Trade-offs

- **CI cost on large PRs** → Mitigate by running lint/typecheck first and failing fast
- **Test maintenance burden** → Mitigate with factory functions (single place to update when models change) and integration tests that are resilient to implementation details
- **MongoDB in CI** → Use GitHub Actions service container (`mongo:7`) for integration tests that need a real DB; unit tests remain mock-based

## Open Questions

- Should we adopt Codecov or Coveralls for PR coverage comments and badge, or keep it simple with CI-only reports for now?
- Is there appetite for a `pnpm test:watch` experience with Vitest UI for local development?
