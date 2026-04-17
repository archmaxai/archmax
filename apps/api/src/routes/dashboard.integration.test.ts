import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  connectionCount: vi.fn(),
  mcpTokenCount: vi.fn(),
  improvementCount: vi.fn(),
  mcpCallLogCount: vi.fn(),
  mcpCallLogAggregate: vi.fn(),
  svcList: vi.fn(),
}));

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
  Connection: { countDocuments: mocks.connectionCount },
  McpToken: { countDocuments: mocks.mcpTokenCount },
  Improvement: { countDocuments: mocks.improvementCount },
  McpCallLog: {
    countDocuments: mocks.mcpCallLogCount,
    aggregate: mocks.mcpCallLogAggregate,
  },
}));
vi.mock("@archmax/core/services/semantic-model-files", () => ({
  SemanticModelFileService: class {
    list = mocks.svcList;
  },
}));

import { createTestApp, jsonBody } from "../test-utils/api-client";
import dashboardRoute from "./dashboard";

const app = createTestApp("/api/projects/:projectId/dashboard-stats", dashboardRoute);
const BASE = "/api/projects/proj1/dashboard-stats";

function setupEmptyMocks() {
  mocks.connectionCount.mockResolvedValue(0);
  mocks.mcpTokenCount.mockResolvedValue(0);
  mocks.improvementCount.mockResolvedValue(0);
  mocks.mcpCallLogCount.mockResolvedValue(0);
  mocks.mcpCallLogAggregate.mockResolvedValue([]);
  mocks.svcList.mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /dashboard-stats", () => {
  it("returns aggregate stats for a populated project", async () => {
    mocks.connectionCount.mockResolvedValue(3);
    mocks.mcpTokenCount.mockResolvedValue(2);
    mocks.improvementCount.mockResolvedValue(1);
    mocks.mcpCallLogCount
      .mockResolvedValueOnce(50)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(42);
    mocks.mcpCallLogAggregate.mockResolvedValue([
      { _id: "2026-04-16", calls: 20, errors: 1 },
      { _id: "2026-04-17", calls: 30, errors: 2 },
    ]);
    mocks.svcList.mockResolvedValue([
      { name: "m1", datasets: [{ name: "d1" }, { name: "d2" }], relationships: [], metrics: [] },
      { name: "m2", datasets: [{ name: "d3" }], relationships: [], metrics: [] },
    ]);

    const res = await app.request(BASE, { method: "GET" });
    expect(res.status).toBe(200);

    const body = await jsonBody<any>(res);
    expect(body.connections).toEqual({ total: 3, totalQueries: 42 });
    expect(body.semanticModels).toEqual({ total: 2, openImprovements: 1, totalDatasets: 3 });
    expect(body.mcpAccess.tokens).toBe(2);
    expect(body.mcpAccess.totalCalls).toBe(50);
    expect(body.mcpAccess.errorCalls).toBe(3);
    expect(body.mcpAccess.callsByDay).toBeInstanceOf(Array);
    expect(body.mcpAccess.callsByDay.length).toBeGreaterThanOrEqual(7);
    expect(body.mcpAccess.callsByDay[0]).toHaveProperty("date");
    expect(body.mcpAccess.callsByDay[0]).toHaveProperty("calls");
    expect(body.mcpAccess.callsByDay[0]).toHaveProperty("errors");
  });

  it("returns all zeros for an empty project", async () => {
    setupEmptyMocks();

    const res = await app.request(BASE, { method: "GET" });
    expect(res.status).toBe(200);

    const body = await jsonBody<any>(res);
    expect(body.connections).toEqual({ total: 0, totalQueries: 0 });
    expect(body.semanticModels).toEqual({ total: 0, openImprovements: 0, totalDatasets: 0 });
    expect(body.mcpAccess.tokens).toBe(0);
    expect(body.mcpAccess.totalCalls).toBe(0);
    expect(body.mcpAccess.errorCalls).toBe(0);
    expect(body.mcpAccess.callsByDay.length).toBeGreaterThanOrEqual(7);
    expect(body.mcpAccess.callsByDay.every((d: any) => d.calls === 0 && d.errors === 0)).toBe(true);
  });

  it("passes the correct filter for pending improvements", async () => {
    setupEmptyMocks();

    await app.request(BASE, { method: "GET" });

    expect(mocks.improvementCount).toHaveBeenCalledWith({
      project: "proj1",
      status: "pending",
    });
  });

  it("uses custom days param for MCP log window", async () => {
    setupEmptyMocks();

    await app.request(`${BASE}?days=1`, { method: "GET" });

    const callArgs = mocks.mcpCallLogCount.mock.calls[0][0];
    const since = callArgs.createdAt.$gte as Date;
    const hoursAgo = (Date.now() - since.getTime()) / (1000 * 60 * 60);
    expect(hoursAgo).toBeGreaterThan(23);
    expect(hoursAgo).toBeLessThan(25);
  });

  it("clamps days to 1–90 range", async () => {
    setupEmptyMocks();

    await app.request(`${BASE}?days=200`, { method: "GET" });

    const callArgs = mocks.mcpCallLogCount.mock.calls[0][0];
    const since = callArgs.createdAt.$gte as Date;
    const daysAgo = (Date.now() - since.getTime()) / (1000 * 60 * 60 * 24);
    expect(daysAgo).toBeGreaterThan(89);
    expect(daysAgo).toBeLessThan(91);
  });

  it("fills in zero-days in callsByDay", async () => {
    setupEmptyMocks();
    const today = new Date().toISOString().slice(0, 10);
    mocks.mcpCallLogAggregate.mockResolvedValue([
      { _id: today, calls: 5, errors: 1 },
    ]);

    const res = await app.request(BASE, { method: "GET" });
    const body = await jsonBody<any>(res);

    const todayEntry = body.mcpAccess.callsByDay.find((d: any) => d.date === today);
    expect(todayEntry).toEqual({ date: today, calls: 5, errors: 1 });

    const otherDays = body.mcpAccess.callsByDay.filter((d: any) => d.date !== today);
    expect(otherDays.every((d: any) => d.calls === 0 && d.errors === 0)).toBe(true);
  });
});
