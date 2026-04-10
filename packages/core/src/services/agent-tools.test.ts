import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./duckdb", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    hardenConnection: vi.fn(),
    getProjectInstance: vi.fn(),
  };
});

vi.mock("../infra/db", () => ({
  connectDB: vi.fn(),
}));

vi.mock("../models/index", () => ({
  Connection: { find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) },
  TestCase: {},
}));

import { makeExecuteQueryTool } from "./agent-tools";
import { hardenConnection, getProjectInstance } from "./duckdb";

describe("makeExecuteQueryTool", () => {
  const mockDisconnect = vi.fn();
  const mockDb = { prepare: vi.fn(), disconnectSync: mockDisconnect };
  const mockInstance = { connect: vi.fn().mockResolvedValue(mockDb) };

  beforeEach(() => {
    vi.clearAllMocks();
    (getProjectInstance as ReturnType<typeof vi.fn>).mockResolvedValue(mockInstance);
    (hardenConnection as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    mockDb.prepare.mockRejectedValue(new Error("test abort"));
  });

  it("calls hardenConnection before executing a query", async () => {
    const tool = makeExecuteQueryTool("proj-1");

    await tool.invoke({ sql: "SELECT 1", params: [] });

    expect(hardenConnection).toHaveBeenCalledTimes(1);
    expect(hardenConnection).toHaveBeenCalledWith(mockDb);

    const hardenOrder = (hardenConnection as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const prepareOrder = mockDb.prepare.mock.invocationCallOrder[0];
    expect(hardenOrder).toBeLessThan(prepareOrder);
  });
});
