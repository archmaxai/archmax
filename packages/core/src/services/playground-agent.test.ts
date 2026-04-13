import { describe, it, expect, vi, beforeEach } from "vitest";
import { encrypt } from "../infra/crypto";
import { createTestAgent } from "../test-utils";

const {
  mockEnv,
  mockFindById,
  mockCreateDeepAgent,
  toolHandlers,
  mockListSemanticModels,
  mockGetSemanticModelOverview,
  mockGetDatasetFields,
  mockExecuteScopedQuery,
} = vi.hoisted(() => {
  const mockEnv: Record<string, string | undefined> = {
    ENCRYPTION_KEY: "test-encryption-key-32-chars-ok!",
    TEST_AGENT_MAX_ITERATIONS: "100",
    ARCHMAX_DATA_DIR: "/tmp/test",
    projectsDir: "/tmp/test/projects",
  };
  return {
    mockEnv,
    mockFindById: vi.fn(),
    mockCreateDeepAgent: vi.fn(() => ({ stream: vi.fn() })),
    toolHandlers: [] as Array<{ handler: (...args: unknown[]) => unknown; config: { name: string } }>,
    mockListSemanticModels: vi.fn(async () => ({ text: "models" })),
    mockGetSemanticModelOverview: vi.fn(async () => ({ text: "overview" })),
    mockGetDatasetFields: vi.fn(async () => ({ text: "fields" })),
    mockExecuteScopedQuery: vi.fn(async () => ({ text: "results" })),
  };
});

vi.mock("../config/env", () => ({
  getEnv: vi.fn(() => mockEnv),
}));

vi.mock("../infra/db", () => ({
  connectDB: vi.fn(),
}));

vi.mock("../models/index", () => ({
  TestAgent: { findById: mockFindById },
  Improvement: { create: vi.fn() },
}));

vi.mock("deepagents", () => ({
  createDeepAgent: (...args: unknown[]) => mockCreateDeepAgent(...args),
}));

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class MockChatOpenAI {
    constructor() {}
  },
}));

vi.mock("@langchain/core/tools", () => ({
  tool: vi.fn((handler: (...args: unknown[]) => unknown, config: { name: string }) => {
    toolHandlers.push({ handler, config });
    return { name: config.name, invoke: handler };
  }),
}));

vi.mock("./semantic-model-files", () => ({
  SemanticModelFileService: class MockFileSvc {
    constructor() {}
  },
}));

vi.mock("./mcp-tools", () => ({
  listSemanticModels: (...args: unknown[]) => mockListSemanticModels(...args),
  getSemanticModelOverview: (...args: unknown[]) => mockGetSemanticModelOverview(...args),
  getDatasetFields: (...args: unknown[]) => mockGetDatasetFields(...args),
  executeScopedQuery: (...args: unknown[]) => mockExecuteScopedQuery(...args),
  EXECUTE_QUERY_DESCRIPTION: "Execute a query",
}));

import { getTestAgentRecursionLimit, decryptApiKey, createPlaygroundAgent } from "./playground-agent";

describe("getTestAgentRecursionLimit", () => {
  beforeEach(() => {
    mockEnv.TEST_AGENT_MAX_ITERATIONS = "100";
  });

  it("returns configured value from env", () => {
    mockEnv.TEST_AGENT_MAX_ITERATIONS = "50";
    expect(getTestAgentRecursionLimit()).toBe(50);
  });

  it("returns default 100 when env is undefined", () => {
    mockEnv.TEST_AGENT_MAX_ITERATIONS = undefined;
    expect(getTestAgentRecursionLimit()).toBe(100);
  });

  it("returns default 100 when env is empty string", () => {
    mockEnv.TEST_AGENT_MAX_ITERATIONS = "";
    expect(getTestAgentRecursionLimit()).toBe(100);
  });

  it("returns default 100 when env is 0", () => {
    mockEnv.TEST_AGENT_MAX_ITERATIONS = "0";
    expect(getTestAgentRecursionLimit()).toBe(100);
  });

  it("returns default 100 when env is negative", () => {
    mockEnv.TEST_AGENT_MAX_ITERATIONS = "-5";
    expect(getTestAgentRecursionLimit()).toBe(100);
  });

  it("returns default 100 when env is not a number", () => {
    mockEnv.TEST_AGENT_MAX_ITERATIONS = "abc";
    expect(getTestAgentRecursionLimit()).toBe(100);
  });

  it("handles large values", () => {
    mockEnv.TEST_AGENT_MAX_ITERATIONS = "10000";
    expect(getTestAgentRecursionLimit()).toBe(10000);
  });
});

describe("decryptApiKey", () => {
  beforeEach(() => {
    mockEnv.ENCRYPTION_KEY = "test-encryption-key-32-chars-ok!";
  });

  it("decrypts a properly encrypted key", () => {
    const original = "sk-test-api-key-12345";
    const encrypted = encrypt(original, mockEnv.ENCRYPTION_KEY!);
    expect(decryptApiKey(encrypted)).toBe(original);
  });

  it("returns raw value when ENCRYPTION_KEY is not set", () => {
    mockEnv.ENCRYPTION_KEY = undefined;
    expect(decryptApiKey("raw-api-key")).toBe("raw-api-key");
  });

  it("returns raw value when ENCRYPTION_KEY is empty", () => {
    mockEnv.ENCRYPTION_KEY = "";
    expect(decryptApiKey("raw-api-key")).toBe("raw-api-key");
  });

  it("returns encrypted string unchanged when decryption fails", () => {
    mockEnv.ENCRYPTION_KEY = "some-key";
    expect(decryptApiKey("not-valid-hex-encrypted-data")).toBe("not-valid-hex-encrypted-data");
  });

  it("returns encrypted string when key changed after encryption", () => {
    const original = "sk-test-key";
    const encrypted = encrypt(original, "original-encryption-key-32chars!");
    mockEnv.ENCRYPTION_KEY = "different-encryption-key-32chars!";
    expect(decryptApiKey(encrypted)).toBe(encrypted);
  });
});

describe("createPlaygroundAgent", () => {
  const agentData = createTestAgent({
    semanticModels: ["hr", "shopify"],
    project: "proj-123",
  });

  beforeEach(() => {
    toolHandlers.length = 0;
    mockFindById.mockReset();
    mockCreateDeepAgent.mockReset().mockReturnValue({ stream: vi.fn() });
    mockListSemanticModels.mockClear();
    mockGetSemanticModelOverview.mockClear();
    mockGetDatasetFields.mockClear();
    mockExecuteScopedQuery.mockClear();
    mockFindById.mockReturnValue({ lean: () => Promise.resolve(agentData) });
  });

  it("throws when agent is not found", async () => {
    mockFindById.mockReturnValue({ lean: () => Promise.resolve(null) });
    await expect(createPlaygroundAgent("missing-id")).rejects.toThrow("Test agent not found");
  });

  it("uses all agent semanticModels when no semanticModelScope is given", async () => {
    await createPlaygroundAgent(agentData._id);

    const listHandler = toolHandlers.find((h) => h.config.name === "list_semantic_models");
    expect(listHandler).toBeDefined();
    await listHandler!.handler();
    expect(mockListSemanticModels).toHaveBeenCalledWith(
      expect.anything(),
      agentData.project,
      ["hr", "shopify"],
    );
  });

  it("narrows scopes to semanticModelScope when provided", async () => {
    await createPlaygroundAgent(agentData._id, { semanticModelScope: "shopify" });

    const listHandler = toolHandlers.find((h) => h.config.name === "list_semantic_models");
    await listHandler!.handler();
    expect(mockListSemanticModels).toHaveBeenCalledWith(
      expect.anything(),
      agentData.project,
      ["shopify"],
    );

    const queryHandler = toolHandlers.find((h) => h.config.name === "execute_query");
    await queryHandler!.handler({ modelName: "shopify", sql: "SELECT 1", params: [] });
    expect(mockExecuteScopedQuery).toHaveBeenCalledWith(
      expect.anything(),
      agentData.project,
      ["shopify"],
      "shopify",
      "SELECT 1",
      [],
    );
  });

  it("creates 5 tools by default", async () => {
    await createPlaygroundAgent(agentData._id);
    expect(mockCreateDeepAgent).toHaveBeenCalledTimes(1);
    const call = mockCreateDeepAgent.mock.calls[0][0];
    expect(call.tools).toHaveLength(5);
  });

  it("applies tool budget when maxToolCalls is set", async () => {
    await createPlaygroundAgent(agentData._id, { maxToolCalls: 3 });
    const call = mockCreateDeepAgent.mock.calls[0][0];
    expect(call.tools).toHaveLength(5);
  });
});
