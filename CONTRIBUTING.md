# Contributing to archsem

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
pnpm --filter @archsem/core test
pnpm --filter @archsem/api test
pnpm --filter @archsem/frontend test

# Watch mode (single package)
pnpm --filter @archsem/core exec vitest
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

vi.mock("@archsem/core/infra/db", () => ({ connectDB: vi.fn() }));
vi.mock("@archsem/core/models/index", () => ({
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
| LLM calls | `createMockLlm()` from `@archsem/core/test-utils` |
| Env config | `vi.mock("@archsem/core/config/env", () => ({ getEnv: vi.fn(() => ({...})) }))` |
| External HTTP | Mock the function that calls `fetch`, not `fetch` itself |

**Important:** `vi.mock()` factories are hoisted above all imports. You cannot reference module-scope variables inside them. Use `vi.hoisted()` to create values that both `vi.mock` factories and test bodies can access.

### Shared Test Utilities

Available from `@archsem/core/test-utils`:

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
docker pull ghcr.io/<org>/archmax_semlayer:latest

# Pinned version
docker pull ghcr.io/<org>/archmax_semlayer:1.2.3
```
