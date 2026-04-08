## 1. Coverage Configuration
- [x] 1.1 Install `@vitest/coverage-v8` as a root dev dependency
- [x] 1.2 Update `vitest.workspace.ts` with workspace config; add `vitest.config.ts` with coverage config (reporters: `json-summary`, `html`, `text`; include/exclude patterns); add `test:coverage` script to root `package.json`
- [x] 1.3 Add `coverage/` to `.gitignore` (already present)
- [x] 1.4 Verify `pnpm test:coverage` generates reports — 21 files, 373 tests, full HTML/text/JSON reports

## 2. Shared Test Utilities
- [x] 2.1 Create `packages/core/src/test-utils/index.ts` barrel export
- [x] 2.2 Create `packages/core/src/test-utils/db-mock.ts` with `createDbMocks()` and `createModelMock()` — stubs common Mongoose query methods
- [x] 2.3 Create `packages/core/src/test-utils/factories.ts` with factory functions for all models (Project, Connection, Conversation, McpToken, TestAgent, TestCase, TestRun, TestCaseResult, Improvement)
- [x] 2.4 Create `packages/core/src/test-utils/llm-mock.ts` with `createMockLlm()` returning controllable invoke/stream stubs
- [x] 2.5 Export test-utils from `packages/core/package.json` exports map (already covered by `"./*": "./src/*.ts"`)
- [x] 2.6 Refactor `test-runner.test.ts` to use `createMockLlm` from shared utilities; keep `mcp-tools.test.ts` patterns consistent

## 3. Integration Test Patterns
- [x] 3.1 Create `apps/api/src/test-utils/api-client.ts` — `createTestApp()` helper to mount route sub-apps with error handling; `jsonBody()` response parser
- [x] 3.2 Write integration test for `test-agents` routes (GET list, POST create, POST validation, DELETE, DELETE 404) using `app.request()` — 6 tests
- [x] 3.3 Document `vi.hoisted()` pattern for integration test mock setup
- [x] 3.4 Document the integration test pattern in `CONTRIBUTING.md`

## 4. CI Pipeline
- [x] 4.1 Create `.github/workflows/ci.yml` with `lint-and-typecheck` job (parallel `pnpm lint` + `pnpm typecheck`)
- [x] 4.2 Add `test` job: `pnpm test:coverage`, depends on lint-and-typecheck, uses `mongo:7` service container
- [x] 4.3 Configure pnpm dependency caching via `actions/setup-node` cache
- [x] 4.4 Add concurrency group and coverage artifact upload

## 5. Dockerfile Test Stage
- [x] 5.1 Add a `test` stage to the multi-stage Dockerfile between `deps` and `build-api`
- [x] 5.2 Test stage copies all source and runs `pnpm test:coverage`; build stages are independent (can skip via `--target`)

## 6. Contributor Documentation
- [x] 6.1 Create `CONTRIBUTING.md` with Testing section covering: run commands, file conventions, mocking strategy, test utility usage
- [x] 6.2 Add quick-start example: writing a unit test with vi.mock and shared factories
- [x] 6.3 Add integration test example: testing a new API route with vi.hoisted and createTestApp
