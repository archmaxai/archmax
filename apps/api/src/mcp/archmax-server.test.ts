import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  mcpCallLogCreate: vi.fn(),
}));

vi.mock("@archmax/core/infra/db", () => ({ connectDB: mocks.connectDB }));
vi.mock("@archmax/core/models/index", () => ({
  McpCallLog: { create: mocks.mcpCallLogCreate },
  Improvement: { create: vi.fn() },
}));

vi.mock("@archmax/core/services/mcp-tools", () => ({
  listSemanticModels: vi.fn().mockResolvedValue({ text: "# Models\n\n## demo" }),
  getSemanticModelOverview: vi.fn().mockResolvedValue({ text: "overview" }),
  getDatasetFields: vi.fn().mockResolvedValue({ text: "fields" }),
  executeScopedQuery: vi.fn().mockResolvedValue({ text: '{"columns":[],"rows":[],"rowCount":0}', rowCount: 0, columns: [] }),
  storeQuery: vi.fn().mockResolvedValue("sq_123"),
  executeStoredQuery: vi.fn().mockResolvedValue({ text: '{"columns":[],"rows":[],"rowCount":0}', rowCount: 0, columns: [] }),
  EXECUTE_QUERY_DESCRIPTION: "Run a query",
  EXECUTE_STORED_QUERY_DESCRIPTION: "Re-run a stored query",
}));

import { writeCallLog, type McpToolContext } from "./archmax-server";

function makeCtx(overrides: Partial<McpToolContext> = {}): McpToolContext {
  return {
    projectId: "507f1f77bcf86cd799439011",
    scopes: ["demo"],
    tokenId: "507f1f77bcf86cd799439012",
    tokenName: "test-token",
    clientIp: "127.0.0.1",
    mcpPageSize: 50,
    fileSvc: {} as McpToolContext["fileSvc"],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connectDB.mockResolvedValue(undefined);
  mocks.mcpCallLogCreate.mockResolvedValue({});
});

describe("writeCallLog", () => {
  it("calls connectDB before McpCallLog.create", async () => {
    const callOrder: string[] = [];
    mocks.connectDB.mockImplementation(() => {
      callOrder.push("connectDB");
      return Promise.resolve();
    });
    mocks.mcpCallLogCreate.mockImplementation(() => {
      callOrder.push("create");
      return Promise.resolve({});
    });

    await writeCallLog(
      makeCtx(),
      "list_semantic_models",
      null,
      { content: [{ type: "text", text: "ok" }] },
      42,
    );

    expect(callOrder).toEqual(["connectDB", "create"]);
  });

  it("persists all fields correctly", async () => {
    const ctx = makeCtx();
    await writeCallLog(
      ctx,
      "execute_query",
      { modelName: "demo", sql: "SELECT 1" },
      { content: [{ type: "text", text: "5 rows, 3 columns" }] },
      120,
    );

    expect(mocks.mcpCallLogCreate).toHaveBeenCalledWith({
      project: ctx.projectId,
      tokenId: ctx.tokenId,
      tokenName: ctx.tokenName,
      method: "tools/call",
      toolName: "execute_query",
      inputArgs: { modelName: "demo", sql: "SELECT 1" },
      outputContent: "5 rows, 3 columns",
      durationMs: 120,
      isError: false,
      errorMessage: null,
      clientIp: "127.0.0.1",
    });
  });

  it("persists error fields for error results", async () => {
    await writeCallLog(
      makeCtx(),
      "get_semantic_model",
      { modelName: "missing" },
      { content: [{ type: "text", text: "Model not found" }], isError: true },
      10,
    );

    expect(mocks.mcpCallLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        isError: true,
        errorMessage: "Model not found",
      }),
    );
  });

  it("does not throw when create fails", async () => {
    mocks.mcpCallLogCreate.mockRejectedValue(new Error("DB write failure"));

    await expect(
      writeCallLog(
        makeCtx(),
        "list_semantic_models",
        null,
        { content: [{ type: "text", text: "ok" }] },
        5,
      ),
    ).resolves.toBeUndefined();
  });

  it("does not throw when connectDB fails", async () => {
    mocks.connectDB.mockRejectedValue(new Error("Connection lost"));

    await expect(
      writeCallLog(
        makeCtx(),
        "list_semantic_models",
        null,
        { content: [{ type: "text", text: "ok" }] },
        5,
      ),
    ).resolves.toBeUndefined();
  });
});
