---
name: /test
id: test
category: Quality
description: Ensure recent changes are covered by tests and all tests pass.
---

**Context**

This is a pnpm + Turborepo monorepo with a Vitest 4 workspace (`vitest.config.ts`) spanning four projects: `core`, `api`, `frontend`, and `worker`. Tests are colocated with source (`my-service.ts` → `my-service.test.ts`). Integration tests use `.integration.test.ts`. API integration tests use `app.request()` via the helper in `apps/api/src/test-utils/api-client.ts`. Shared test utilities (factories, mocks) live in `packages/core/src/test-utils/`.

**Steps**

1. Identify the files changed in this session (review conversation context or recent edits).
2. For each changed file, check whether a colocated `.test.ts` (or `.test.tsx`) file exists. If not, create one.
3. Write or update tests to cover the new or modified behaviour:
   - **`@archmax/core` services**: Unit test the public API. Mock external dependencies (MongoDB, DuckDB, filesystem). Use factories from `packages/core/src/test-utils/`.
   - **`apps/api` routes**: Write integration tests using `app.request()` from the API test client. Validate status codes, response shapes, and error cases.
   - **`apps/frontend` components**: Test user-visible behaviour with React Testing Library. Avoid testing implementation details.
   - **MCP tools**: Test handler logic with mock project/connection data. Verify tool output shape and error responses.
4. Run the relevant workspace project:
   ```bash
   pnpm vitest run --project <core|api|frontend|worker>
   ```
   Or run the full suite:
   ```bash
   pnpm test
   ```
5. If any test fails, fix the implementation or the test until all pass.
6. Optionally check coverage for the affected project:
   ```bash
   pnpm test:coverage
   ```
