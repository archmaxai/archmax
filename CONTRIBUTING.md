# Contributing to archmax

## Getting Started

```bash
# Install dependencies
pnpm install

# Start dev servers (API, frontend, worker)
pnpm dev

# Run the full test suite
pnpm test

# Run tests with coverage report
pnpm test:coverage
```

## Testing

### Running Tests

```bash
# Full suite (via Turborepo)
pnpm test

# Full suite with coverage (via Vitest workspace)
pnpm test:coverage

# Single package
pnpm --filter @archmax/core test
pnpm --filter @archmax/api test
pnpm --filter @archmax/frontend test

# Watch mode (single package)
pnpm --filter @archmax/core exec vitest
```

### Test File Conventions

- Test files are colocated with source: `my-service.ts` → `my-service.test.ts`
- Integration tests use the suffix `.integration.test.ts`
- Use `describe` / `it` / `expect` from Vitest
- Name test files after the module they test, not after the feature

### Writing a Unit Test

Unit tests verify a single function or module in isolation. Mock external dependencies with `vi.mock()`.

```typescript
// packages/core/src/services/my-service.test.ts
import { describe, it, expect, vi } from "vitest";

// Mock DB and models (hoisted above imports)
vi.mock("../infra/db", () => ({ connectDB: vi.fn() }));
vi.mock("../models/index", () => ({
  MyModel: { find: vi.fn(), create: vi.fn() },
}));

import { myFunction } from "./my-service";

describe("myFunction", () => {
  it("returns expected result", () => {
    expect(myFunction("input")).toBe("output");
  });
});
```

**Using shared test utilities:**

```typescript
import { createTestAgent, createMockLlm } from "../test-utils";

it("processes agent with LLM", async () => {
  const agent = createTestAgent({ name: "Custom" });
  const llm = createMockLlm({ content: '{"answer": 42}' });

  const result = await processAgent(agent, llm);
  expect(result.answer).toBe(42);
  expect(llm.invoke).toHaveBeenCalledOnce();
});
```

### Writing an Integration Test

Integration tests verify API routes through the full Hono middleware stack without starting an HTTP server.

```typescript
// apps/api/src/routes/my-route.integration.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mock functions so vi.mock factories can reference them
const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  create: vi.fn(),
}));

vi.mock("@archmax/core/infra/db", () => ({ connectDB: vi.fn() }));
vi.mock("@archmax/core/models/index", () => ({
  MyModel: { find: mocks.find, create: mocks.create },
}));

import { createTestApp, jsonBody } from "../test-utils/api-client";
import myRoute from "./my-route";

const app = createTestApp("/api/projects/:projectId/my-route", myRoute);

beforeEach(() => vi.clearAllMocks());

describe("GET /my-route", () => {
  it("returns items", async () => {
    mocks.find.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ name: "Item 1" }]),
      }),
    });

    const res = await app.request("/api/projects/p1/my-route", { method: "GET" });
    expect(res.status).toBe(200);

    const body = await jsonBody<any[]>(res);
    expect(body).toHaveLength(1);
  });
});
```

### Mocking Strategy

| What to mock | How |
|---|---|
| Database connection | `vi.mock("../infra/db", () => ({ connectDB: vi.fn() }))` |
| Mongoose models | Inline in `vi.mock("../models/index", () => ({ ... }))` |
| LLM calls | `createMockLlm()` from `@archmax/core/test-utils` |
| Env config | `vi.mock("@archmax/core/config/env", () => ({ getEnv: vi.fn(() => ({...})) }))` |
| External HTTP | Mock the function that calls `fetch`, not `fetch` itself |

**Important:** `vi.mock()` factories are hoisted above all imports. You cannot reference module-scope variables inside them. Use `vi.hoisted()` to create values that both `vi.mock` factories and test bodies can access.

### Shared Test Utilities

Available from `@archmax/core/test-utils`:

- **Factories** — `createProject()`, `createConnection()`, `createTestAgent()`, `createTestCase()`, `createTestRun()`, `createTestCaseResult()`, `createImprovement()`, `createConversation()`, `createMcpToken()` — each returns a plain object with sensible defaults. Pass overrides: `createProject({ title: "Custom" })`.
- **`createMockLlm(response?)`** — returns `{ invoke, stream }` stubs. Pass `{ content: "..." }` for success or `new Error(...)` for failure.
- **`createModelMock()`** — creates a mock Mongoose model with `find`, `findOne`, `create`, etc. as `vi.fn()` stubs.

Available from `apps/api/src/test-utils/api-client`:

- **`createTestApp(basePath, route)`** — wraps a Hono route sub-app with error handling for testing via `app.request()`.
- **`jsonBody<T>(res)`** — parses a `Response` as JSON with type inference.

### Coverage

Coverage is configured with `@vitest/coverage-v8`. After running `pnpm test:coverage`:

- **Terminal** — text summary printed to stdout
- **HTML report** — open `coverage/index.html` in a browser
- **JSON summary** — `coverage/coverage-summary.json` for CI consumption

### E2E Tests (Playwright)

End-to-end tests run Playwright against the full Docker image with federated database services. They live in `apps/e2e/`.

The `docker-compose.ci.yml` starts the app image alongside MongoDB, Redis, PostgreSQL, MySQL, Microsoft SQL Server, and mounts a SQLite fixture file. This is the same stack CI uses.

**Running locally:**

```bash
# 1. Build (or pull) the app image
docker build -t archmax:local .
# -- or pull from GHCR:
# docker pull ghcr.io/archmaxai/archmax:latest

# 2. Start the full stack (set APP_IMAGE to your local tag)
APP_IMAGE=archmax:local docker compose -f docker-compose.ci.yml up -d

# 3. Wait for the health endpoint
curl --retry 30 --retry-delay 5 --retry-connrefused http://localhost:8080/api/health

# 4. Install Playwright browsers (first time only)
pnpm --filter @archmax/e2e exec playwright install --with-deps chromium

# 5. Run the tests
pnpm --filter @archmax/e2e test

# 6. Tear down
docker compose -f docker-compose.ci.yml down -v
```

Default credentials are `admin` / `testpass123`. Override with `UI_USERNAME` / `UI_PASSWORD` env vars on compose and `E2E_USERNAME` / `E2E_PASSWORD` for the test runner if you change them.

**Note:** The MSSQL container (`mcr.microsoft.com/mssql/server:2022-latest`) requires at least 2 GB RAM and runs only on `linux/amd64`. On Apple Silicon Macs, Docker Desktop runs it under Rosetta emulation, which works but is slower to start. The compose file pins `platform: linux/amd64` for this service.

## Code Style

- TypeScript strict mode everywhere
- ESM-only (`"type": "module"`)
- No comments that just narrate what code does
- Use `cn()` for Tailwind class composition in React components

## Git Workflow

1. Create a feature branch from `main`
2. Make changes, add tests
3. Run `pnpm test` and `pnpm typecheck` locally
4. Open a PR targeting `main`
5. CI runs lint, typecheck, and tests automatically

## Dependency Updates

Dependabot raises weekly pull requests every Monday across three ecosystems:

| Ecosystem | Scope | Commit prefix |
|---|---|---|
| `npm` | `pnpm-lock.yaml` + every workspace `package.json` | `chore(deps)` |
| `github-actions` | action versions in `.github/workflows/*.yml` | `chore(ci)` |
| `docker` | base image in the root `Dockerfile` | `chore(docker)` |

Config lives in [`.github/dependabot.yml`](.github/dependabot.yml).

- **Grouping.** Minor and patch `npm` bumps are combined into a single weekly PR labelled
  `dependencies`. Major bumps stay in their own PRs so breaking changes get a deliberate
  review.
- **CI gate.** Every Dependabot PR runs the same `Lint & Typecheck` and `Test` jobs as
  human-authored PRs. Merge only after both pass.
- **OpenSpec exemption.** Dependabot-authored PRs do **not** require an
  `openspec/changes/<id>/` entry. This matches the existing exemption for
  "non-breaking dependency updates" in `openspec/project.md`.

## Releases

Releases are created automatically when a labeled PR is merged to `main`. No manual tagging or version files needed.

### How it works

1. Add one of these labels to your PR before merging:

   | Label | When to use | Example |
   |---|---|---|
   | `release` | Bug fixes, small improvements (bumps **patch**) | `v1.2.3` → `v1.2.4` |
   | `release:minor` | New features, non-breaking changes (bumps **minor**) | `v1.2.3` → `v1.3.0` |
   | `release:major` | Breaking changes (bumps **major**) | `v1.2.3` → `v2.0.0` |

2. When the PR merges, the release workflow:
   - Creates a git tag with the new version
   - Publishes a GitHub Release with auto-generated notes
   - Builds and pushes a Docker image to `ghcr.io`

3. PRs without a release label are merged normally with no release.

### Docker images

Released images are pushed to GitHub Container Registry:

```bash
# Latest release
docker pull ghcr.io/archmaxai/archmax:latest

# Pinned version
docker pull ghcr.io/archmaxai/archmax:1.2.3
```
