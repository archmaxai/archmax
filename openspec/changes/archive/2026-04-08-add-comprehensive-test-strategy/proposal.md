# Change: Add comprehensive test strategy for open-source readiness

## Why
The project has 17 test files with ad-hoc mocking patterns, no CI pipeline, no coverage tracking, no E2E tests, and no shared test utilities. For an open-source project, contributors need a clear testing contract: a CI gate that catches regressions, coverage visibility that highlights under-tested areas, and documented patterns that make writing tests straightforward. Without this, contributions are unreliable and maintainers carry the full verification burden.

## What Changes
- **CI pipeline**: GitHub Actions workflow for PRs and main — lint, typecheck, test, coverage
- **Coverage configuration**: Vitest coverage-v8 with per-package thresholds and a combined report
- **Shared test utilities**: `packages/core/src/test-utils/` with DB mock helpers, factory functions, and an API test client helper
- **Integration test patterns**: Hono `app.request()` based API route tests that exercise full middleware stacks without a running server
- **PR quality gates**: Required status checks, coverage diff reporting, Dockerfile test stage
- **Contributor documentation**: `CONTRIBUTING.md` testing section with patterns and examples

## Impact
- Affected specs: new `test-infrastructure` capability
- Affected code:
  - `.github/workflows/ci.yml` — new CI workflow
  - `vitest.workspace.ts` — coverage configuration
  - `packages/core/src/test-utils/` — new shared test helpers
  - `packages/core/src/test-utils/db-mock.ts` — reusable DB/model mocking
  - `packages/core/src/test-utils/factories.ts` — test data factories
  - `apps/api/src/test-utils/api-client.ts` — Hono test client wrapper
  - `Dockerfile` — add test stage
  - `CONTRIBUTING.md` — testing section (new or updated)
