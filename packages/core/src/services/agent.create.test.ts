import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreateDeepAgent, mockEnv, mockProjectFindById, mockConnectionFind } = vi.hoisted(() => ({
  mockCreateDeepAgent: vi.fn(() => ({ stream: vi.fn() })),
  mockEnv: {
    projectsDir: "/tmp/test/projects",
    AGENT_MODEL: "test-model",
    AGENT_API_KEY: "test-key",
    AGENT_API_BASE_URL: "https://example.test/v1",
    AGENT_MAX_RETRIES: "3",
    AGENT_REQUEST_TIMEOUT: "300",
  } as Record<string, string>,
  mockProjectFindById: vi.fn(() => ({ lean: vi.fn(async () => ({ _id: "proj1" })) })),
  mockConnectionFind: vi.fn(() => ({ lean: vi.fn(async () => []) })),
}));

vi.mock("deepagents", () => ({
  createDeepAgent: (...args: unknown[]) => mockCreateDeepAgent(...args),
  FilesystemBackend: class MockFilesystemBackend {
    constructor(_opts?: unknown) {}
  },
}));

vi.mock("@langchain/openai", () => ({
  ChatOpenAI: class MockChatOpenAI {
    constructor() {}
  },
}));

vi.mock("../config/env", () => ({
  getEnv: vi.fn(() => mockEnv),
}));

vi.mock("../infra/db", () => ({
  connectDB: vi.fn(),
}));

vi.mock("../models/index", () => ({
  Project: { findById: mockProjectFindById },
  Connection: { find: mockConnectionFind },
}));

// Avoid pulling the heavy tool/duckdb import chain — the tools themselves are
// irrelevant to the memory-wiring assertion under test.
vi.mock("./agent-tools", () => ({
  makeExecuteQueryTool: vi.fn(() => ({ name: "executeQuery" })),
  makeRunModelQueryTool: vi.fn(() => ({ name: "runModelQuery" })),
  makeDeleteTool: vi.fn(() => ({ name: "rm" })),
  makeMvTool: vi.fn(() => ({ name: "mv" })),
  makeCpTool: vi.fn(() => ({ name: "cp" })),
  makeReadDocumentTool: vi.fn(() => ({ name: "readDocument" })),
  makeRevertFileTool: vi.fn(() => ({ name: "revertFile" })),
  makeDiscardAllChangesTool: vi.fn(() => ({ name: "discardAll" })),
  makeListTestAgentsTool: vi.fn(() => ({ name: "listTestAgents" })),
  makeListTestCasesTool: vi.fn(() => ({ name: "listTestCases" })),
  makeDeleteTestCaseTool: vi.fn(() => ({ name: "deleteTestCase" })),
  makeCreateTestCaseTool: vi.fn(() => ({ name: "createTestCase" })),
  buildSystemPrompt: vi.fn(() => "SYSTEM PROMPT"),
}));

vi.mock("./agent-middleware", () => ({
  createToolErrorRecoveryMiddleware: vi.fn(() => ({ name: "toolErrorRecovery" })),
}));

import { createSemlayerAgent } from "./agent";

describe("createSemlayerAgent", () => {
  beforeEach(() => {
    mockCreateDeepAgent.mockClear();
  });

  it("wires the optional project-root AGENTS.md via the Deep Agents memory option", async () => {
    await createSemlayerAgent("proj1");

    expect(mockCreateDeepAgent).toHaveBeenCalledTimes(1);
    const params = mockCreateDeepAgent.mock.calls[0][0] as { memory?: string[] };
    expect(params.memory).toEqual(["AGENTS.md"]);
  });

  it("rejects an unsafe projectId before touching the agent", async () => {
    await expect(createSemlayerAgent("../etc")).rejects.toThrow(/Invalid projectId/);
    expect(mockCreateDeepAgent).not.toHaveBeenCalled();
  });
});
