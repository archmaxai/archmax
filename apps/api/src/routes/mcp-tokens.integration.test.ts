import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  findOne: vi.fn(),
  aggregate: vi.fn(),
}));

function mkChain(rows: unknown[]) {
  return {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(rows),
  };
}

vi.mock("mongoose", () => {
  class FakeObjectId {
    value: string;
    constructor(v: string) { this.value = v; }
    toString() { return this.value; }
  }
  return {
    default: { Types: { ObjectId: FakeObjectId } },
    Types: { ObjectId: FakeObjectId },
  };
});
vi.mock("@archmax/core/infra/db", () => ({ connectDB: vi.fn() }));
vi.mock("@archmax/core/config/env", () => ({
  getEnv: vi.fn(() => ({ projectsDir: "/tmp/test-projects" })),
}));
vi.mock("@archmax/core/models/index", () => ({
  McpToken: {
    find: mocks.find,
    findOne: mocks.findOne,
    create: vi.fn(),
  },
  McpCallLog: { aggregate: mocks.aggregate },
  Project: { findById: vi.fn() },
  generateMcpToken: vi.fn(() => ({ raw: "sml_test", hash: "hash" })),
}));
vi.mock("@archmax/core/services/semantic-model-files", () => ({
  SemanticModelFileService: class {
    async list() { return []; }
  },
}));

import { createTestApp, jsonBody } from "../test-utils/api-client";
import mcpTokensRoute from "./mcp-tokens";

const app = createTestApp("/api/projects/:projectId/mcp-tokens", mcpTokensRoute);
const PROJECT_ID = "507f1f77bcf86cd799439011";
const TOKEN_ID = "507f1f77bcf86cd799439012";
const BASE = `/api/projects/${PROJECT_ID}/mcp-tokens`;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /mcp-tokens — eventCount30d", () => {
  it("attaches event count from the last 30 days for each token", async () => {
    const tokens = [
      { _id: "tok-active", name: "Active", scopes: ["m1"], expiresAt: null, lastUsedAt: new Date(), createdAt: new Date() },
      { _id: "tok-dormant", name: "Dormant", scopes: ["m1"], expiresAt: null, lastUsedAt: null, createdAt: new Date() },
    ];
    mocks.find.mockReturnValue(mkChain(tokens));
    mocks.aggregate.mockResolvedValue([
      { _id: { toString: () => "tok-active" }, count: 7 },
    ]);

    const res = await app.request(BASE);
    expect(res.status).toBe(200);

    const body = await jsonBody<Array<{ _id: string; eventCount30d: number }>>(res);
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({ _id: "tok-active", eventCount30d: 7 });
    expect(body[1]).toMatchObject({ _id: "tok-dormant", eventCount30d: 0 });
  });

  it("queries with a 30-day-ago start date and matches non-null tokenId", async () => {
    mocks.find.mockReturnValue(mkChain([]));
    mocks.aggregate.mockResolvedValue([]);

    const res = await app.request(BASE);
    expect(res.status).toBe(200);

    const pipeline = mocks.aggregate.mock.calls[0]![0] as Array<Record<string, unknown>>;
    const match = pipeline[0]!.$match as Record<string, unknown>;
    expect(match).toMatchObject({
      tokenId: { $ne: null },
    });
    const created = match.createdAt as { $gte: Date };
    expect(created.$gte).toBeInstanceOf(Date);
    const ageMs = Date.now() - created.$gte.getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    expect(ageMs).toBeGreaterThanOrEqual(thirtyDaysMs - 5_000);
    expect(ageMs).toBeLessThanOrEqual(thirtyDaysMs + 5_000);
  });

  it("returns empty list when project has no tokens", async () => {
    mocks.find.mockReturnValue(mkChain([]));
    mocks.aggregate.mockResolvedValue([]);

    const res = await app.request(BASE);
    const body = await jsonBody<unknown[]>(res);
    expect(body).toEqual([]);
  });
});

describe("path param validation", () => {
  it("GET / rejects invalid projectId with 400", async () => {
    const res = await app.request("/api/projects/not-an-objectid/mcp-tokens");
    expect(res.status).toBe(400);
    const body = await jsonBody<{ error: string }>(res);
    expect(body.error).toContain("projectId");
    expect(mocks.find).not.toHaveBeenCalled();
  });

  it("DELETE /:tokenId rejects invalid projectId with 400", async () => {
    const res = await app.request(`/api/projects/bogus/mcp-tokens/${TOKEN_ID}`, { method: "DELETE" });
    expect(res.status).toBe(400);
    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  it("DELETE /:tokenId rejects invalid tokenId with 400", async () => {
    const res = await app.request(`${BASE}/not-an-id`, { method: "DELETE" });
    expect(res.status).toBe(400);
    const body = await jsonBody<{ error: string }>(res);
    expect(body.error).toContain("tokenId");
    expect(mocks.findOne).not.toHaveBeenCalled();
  });

  it("POST / rejects invalid projectId with 400 before validating body", async () => {
    const res = await app.request("/api/projects/bogus/mcp-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x", scopes: ["m1"] }),
    });
    expect(res.status).toBe(400);
  });
});
