import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  mcpCallLogCreate: vi.fn(),
  listSemanticModels: vi.fn(),
  executeScopedQuery: vi.fn(),
  storeQuery: vi.fn(),
  executeStoredQuery: vi.fn(),
}));

vi.mock("@archmax/core/infra/db", () => ({ connectDB: mocks.connectDB }));
vi.mock("@archmax/core/models/index", () => ({
  McpCallLog: { create: mocks.mcpCallLogCreate },
  Improvement: { create: vi.fn() },
}));

vi.mock("@archmax/core/services/mcp-tools", () => ({
  listSemanticModels: mocks.listSemanticModels,
  getSemanticModelOverview: vi.fn().mockResolvedValue({ text: "overview" }),
  getDatasetFields: vi.fn().mockResolvedValue({ text: "fields" }),
  executeScopedQuery: mocks.executeScopedQuery,
  storeQuery: mocks.storeQuery,
  executeStoredQuery: mocks.executeStoredQuery,
  EXECUTE_QUERY_DESCRIPTION: "Run a query",
  EXECUTE_STORED_QUERY_DESCRIPTION: "Re-run a stored query",
}));

import { writeCallLog, registerArchmaxTools, type McpToolContext } from "./archmax-server";

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

type ToolHandler = (...args: unknown[]) => Promise<unknown>;

function createMockServer() {
  const handlers = new Map<string, ToolHandler>();
  const server = {
    registerTool: vi.fn((name: string, _config: unknown, handler: ToolHandler) => {
      handlers.set(name, handler);
    }),
  };
  return { server, handlers };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.connectDB.mockResolvedValue(undefined);
  mocks.mcpCallLogCreate.mockResolvedValue({});
  mocks.listSemanticModels.mockResolvedValue({ text: "# Models\n\n## demo" });
  mocks.executeScopedQuery.mockResolvedValue({
    text: '{"columns":["a"],"rows":[[1]],"rowCount":1}',
    rowCount: 1,
    columns: ["a"],
  });
  mocks.storeQuery.mockResolvedValue("sq_123");
  mocks.executeStoredQuery.mockResolvedValue({
    text: '{"columns":[],"rows":[],"rowCount":0}',
    rowCount: 0,
    columns: [],
  });
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

describe("registerArchmaxTools", () => {
  it("registers all six tools", async () => {
    const { server, handlers } = createMockServer();
    await registerArchmaxTools(server as never, makeCtx());

    expect(handlers.size).toBe(6);
    expect([...handlers.keys()]).toEqual([
      "list_semantic_models",
      "get_semantic_model",
      "get_datasets",
      "execute_query",
      "execute_stored_query",
      "request_improvement",
    ]);
  });
});

describe("loggedTool (via registered handlers)", () => {
  let handlers: Map<string, ToolHandler>;

  beforeEach(async () => {
    const mock = createMockServer();
    handlers = mock.handlers;
    await registerArchmaxTools(mock.server as never, makeCtx());
  });

  it("returns tool result and writes a call log for successful calls", async () => {
    const handler = handlers.get("list_semantic_models")!;
    const result = await handler();

    expect(result).toEqual({
      content: [{ type: "text", text: "# Models\n\n## demo" }],
    });

    expect(mocks.mcpCallLogCreate).toHaveBeenCalledOnce();
    expect(mocks.mcpCallLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "list_semantic_models",
        isError: false,
        inputArgs: null,
      }),
    );
  });

  it("logs error and re-throws when handler throws", async () => {
    mocks.listSemanticModels.mockRejectedValue(new Error("disk read failed"));

    const handler = handlers.get("list_semantic_models")!;
    await expect(handler()).rejects.toThrow("disk read failed");

    expect(mocks.mcpCallLogCreate).toHaveBeenCalledOnce();
    expect(mocks.mcpCallLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "list_semantic_models",
        isError: true,
        errorMessage: "disk read failed",
      }),
    );
  });

  it("still returns tool result when writeCallLog fails", async () => {
    mocks.mcpCallLogCreate.mockRejectedValue(new Error("DB down"));

    const handler = handlers.get("list_semantic_models")!;
    const result = await handler();

    expect(result).toEqual({
      content: [{ type: "text", text: "# Models\n\n## demo" }],
    });
  });

  it("uses logResult instead of full result for query tools", async () => {
    const handler = handlers.get("execute_query")!;
    const result = await handler({
      modelName: "demo",
      sql: "SELECT 1",
      params: [],
      store: false,
    });

    expect(result).toEqual({
      content: [{ type: "text", text: expect.stringContaining('"rowCount":1') }],
    });

    expect(mocks.mcpCallLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "execute_query",
        outputContent: "1 rows, 1 columns",
        inputArgs: expect.objectContaining({ modelName: "demo", sql: "SELECT 1", rowCount: 1 }),
      }),
    );
  });

  it("logs summarised output for execute_stored_query", async () => {
    const handler = handlers.get("execute_stored_query")!;
    await handler({ storedQueryId: "sq_abc", params: undefined });

    expect(mocks.mcpCallLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "execute_stored_query",
        outputContent: "0 rows, 0 columns",
        inputArgs: expect.objectContaining({ storedQueryId: "sq_abc", rowCount: 0 }),
      }),
    );
  });

  it("logs error result for failed queries", async () => {
    mocks.executeScopedQuery.mockResolvedValue({
      text: "Permission denied",
      isError: true,
    });

    const handler = handlers.get("execute_query")!;
    const result = await handler({
      modelName: "demo",
      sql: "SELECT 1",
      params: [],
      store: false,
    });

    expect(result).toEqual({
      content: [{ type: "text", text: "Permission denied" }],
      isError: true,
    });

    expect(mocks.mcpCallLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        isError: true,
        errorMessage: "Permission denied",
      }),
    );
  });
});
