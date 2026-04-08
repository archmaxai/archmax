import { vi } from "vitest";

type MockModel = Record<string, ReturnType<typeof vi.fn>>;

function chainable(model: MockModel, method: string) {
  const fn = vi.fn();
  fn.mockReturnValue({ lean: vi.fn().mockResolvedValue([]), exec: vi.fn().mockResolvedValue([]) });
  model[method] = fn;
  return fn;
}

/**
 * Creates a mock Mongoose model with common query methods as vi.fn() stubs.
 * Each method returns a chainable object with `.lean()` and `.exec()`.
 */
export function createModelMock(): MockModel {
  const model: MockModel = {};
  for (const m of ["find", "findOne", "findById", "findByIdAndUpdate", "findOneAndUpdate", "create", "updateOne", "deleteOne", "countDocuments"]) {
    chainable(model, m);
  }
  return model;
}

/**
 * Creates mocks for all Mongoose models in the project.
 *
 * NOTE: Because vi.mock factories are hoisted above imports, you cannot
 * use createDbMocks() directly inside vi.mock(). Instead, use inline mocks
 * for vi.mock and createDbMocks/createModelMock for test body setup:
 *
 * ```ts
 * // Inline vi.mock (hoisted — can't reference imports)
 * vi.mock("../infra/db", () => ({ connectDB: vi.fn() }));
 * vi.mock("../models/index", () => ({
 *   TestRun: { updateOne: vi.fn(), findById: vi.fn() },
 * }));
 *
 * // Use createModelMock in test bodies for additional setup
 * import { createModelMock } from "../test-utils";
 * ```
 */
export function createDbMocks() {
  return {
    Project: createModelMock(),
    Connection: createModelMock(),
    Conversation: createModelMock(),
    McpToken: createModelMock(),
    McpCallLog: createModelMock(),
    PublishEvent: createModelMock(),
    TestAgent: createModelMock(),
    TestCase: createModelMock(),
    TestRun: createModelMock(),
    Improvement: createModelMock(),
  };
}

export type DbMocks = ReturnType<typeof createDbMocks>;
