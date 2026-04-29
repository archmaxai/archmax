import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  countDocuments: vi.fn(),
  distinct: vi.fn(),
}));

function mkChain(rows: unknown[]) {
  return {
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(rows),
  };
}

vi.mock("@archmax/core/infra/db", () => ({ connectDB: vi.fn() }));
vi.mock("@archmax/core/models/index", () => ({
  McpCallLog: {
    find: mocks.find,
    countDocuments: mocks.countDocuments,
    distinct: mocks.distinct,
  },
}));

import { createTestApp, jsonBody } from "../test-utils/api-client";
import mcpLogsRoute from "./mcp-logs";

const app = createTestApp("/api/projects/:projectId/mcp-logs", mcpLogsRoute);
const PROJECT_ID = "507f1f77bcf86cd799439011";
const TOKEN_ID = "507f1f77bcf86cd799439012";
const BASE = `/api/projects/${PROJECT_ID}/mcp-logs`;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /mcp-logs", () => {
  it("returns paginated logs with default page/limit", async () => {
    const rows = [{ _id: "l1", toolName: "execute_query" }];
    mocks.find.mockReturnValue(mkChain(rows));
    mocks.countDocuments.mockResolvedValue(1);

    const res = await app.request(BASE);
    expect(res.status).toBe(200);
    const body = await jsonBody<{ data: unknown[]; total: number; page: number; limit: number }>(res);
    expect(body.total).toBe(1);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(50);
    expect(body.data).toEqual(rows);

    expect(mocks.find).toHaveBeenCalledWith({ project: PROJECT_ID });
  });

  it("forwards filter query params to the Mongo filter", async () => {
    mocks.find.mockReturnValue(mkChain([]));
    mocks.countDocuments.mockResolvedValue(0);

    const res = await app.request(
      `${BASE}?toolName=execute_query&tokenId=${TOKEN_ID}&errorOnly=true&from=2026-04-01T00:00:00.000Z&to=2026-04-07T23:59:59.999Z`,
    );
    expect(res.status).toBe(200);

    const filter = mocks.find.mock.calls[0]![0] as Record<string, unknown>;
    expect(filter).toMatchObject({
      project: PROJECT_ID,
      toolName: "execute_query",
      tokenId: TOKEN_ID,
      isError: true,
    });
    const dateFilter = filter.createdAt as { $gte: Date; $lte: Date };
    expect(dateFilter.$gte).toBeInstanceOf(Date);
    expect(dateFilter.$lte).toBeInstanceOf(Date);
  });

  it("clamps limit to max 200 by rejecting larger values", async () => {
    const res = await app.request(`${BASE}?limit=999`);
    expect(res.status).toBe(400);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it("rejects non-numeric page", async () => {
    const res = await app.request(`${BASE}?page=abc`);
    expect(res.status).toBe(400);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it("rejects malformed date strings", async () => {
    const res = await app.request(`${BASE}?from=not-a-date`);
    expect(res.status).toBe(400);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it("rejects malformed tokenId", async () => {
    const res = await app.request(`${BASE}?tokenId=not-an-objectid`);
    expect(res.status).toBe(400);
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it("rejects malformed projectId in path", async () => {
    const res = await app.request("/api/projects/not-an-objectid/mcp-logs");
    expect(res.status).toBe(400);
    const body = await jsonBody<{ error: string }>(res);
    expect(body.error).toContain("projectId");
    expect(mocks.find).not.toHaveBeenCalled();
  });
});

describe("GET /mcp-logs/tools", () => {
  it("returns distinct sorted tool names", async () => {
    mocks.distinct.mockResolvedValue(["get_semantic_model", "execute_query", "execute_query"]);

    const res = await app.request(`${BASE}/tools`);
    expect(res.status).toBe(200);
    const body = await jsonBody<string[]>(res);
    expect(body).toEqual(["execute_query", "execute_query", "get_semantic_model"]);
    expect(mocks.distinct).toHaveBeenCalledWith("toolName", {
      project: PROJECT_ID,
      toolName: { $ne: null },
    });
  });

  it("filters out null/empty values", async () => {
    mocks.distinct.mockResolvedValue([null, "", "execute_query", "list_semantic_models"]);

    const res = await app.request(`${BASE}/tools`);
    const body = await jsonBody<string[]>(res);
    expect(body).toEqual(["execute_query", "list_semantic_models"]);
  });

  it("returns empty array for project with no logs", async () => {
    mocks.distinct.mockResolvedValue([]);
    const res = await app.request(`${BASE}/tools`);
    expect(res.status).toBe(200);
    const body = await jsonBody<string[]>(res);
    expect(body).toEqual([]);
  });

  it("rejects malformed projectId in path", async () => {
    const res = await app.request("/api/projects/bogus/mcp-logs/tools");
    expect(res.status).toBe(400);
    expect(mocks.distinct).not.toHaveBeenCalled();
  });
});
