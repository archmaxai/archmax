import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestCase, createTestRun, createTestCaseResult } from "@archmax/core/test-utils/factories";

const mocks = vi.hoisted(() => ({
  testRunFind: vi.fn(),
  testRunFindOne: vi.fn(),
  testRunCreate: vi.fn(),
  testRunUpdateOne: vi.fn(),
  testRunCountDocuments: vi.fn(),
  testCaseFind: vi.fn(),
  isRedisConfigured: vi.fn(),
  enqueueTestRunJob: vi.fn(),
  processTestCase: vi.fn(),
}));

vi.mock("@archmax/core/infra/db", () => ({ connectDB: vi.fn() }));
vi.mock("@archmax/core/infra/redis", () => ({
  isRedisConfigured: mocks.isRedisConfigured,
}));
vi.mock("@archmax/core/queue/producer", () => ({
  enqueueTestRunJob: mocks.enqueueTestRunJob,
}));
vi.mock("@archmax/core/services/test-runner", () => ({
  processTestCase: mocks.processTestCase,
}));
vi.mock("@archmax/core/models/index", () => ({
  TestRun: {
    find: mocks.testRunFind,
    findOne: mocks.testRunFindOne,
    create: mocks.testRunCreate,
    updateOne: mocks.testRunUpdateOne,
    countDocuments: mocks.testRunCountDocuments,
  },
  TestCase: {
    find: mocks.testCaseFind,
  },
  TestAgent: {},
}));

import { createTestApp, jsonBody } from "../test-utils/api-client";
import testRunsRoute from "./test-runs";

const app = createTestApp("/api/projects/:projectId/test-runs", testRunsRoute);
const BASE = "/api/projects/proj123/test-runs";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isRedisConfigured.mockReturnValue(false);
  mocks.processTestCase.mockResolvedValue(undefined);
});

describe("GET /test-runs", () => {
  it("returns paginated summary with pass/fail/error counts", async () => {
    const run = createTestRun({
      _id: "run-1",
      testAgent: { _id: "a1", name: "Agent" },
      status: "completed",
      cases: [
        createTestCaseResult({ status: "passed" }),
        createTestCaseResult({ status: "failed" }),
        createTestCaseResult({ status: "error" }),
      ],
      createdAt: new Date().toISOString(),
    });

    const lean = vi.fn().mockResolvedValue([run]);
    const limit = vi.fn().mockReturnValue({ lean });
    const skip = vi.fn().mockReturnValue({ limit });
    const populate = vi.fn().mockReturnValue({ skip });
    const sort = vi.fn().mockReturnValue({ populate });
    mocks.testRunFind.mockReturnValue({ sort });
    mocks.testRunCountDocuments.mockResolvedValue(1);

    const res = await app.request(BASE, { method: "GET" });
    expect(res.status).toBe(200);

    const body = await jsonBody<any>(res);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].caseCount).toBe(3);
    expect(body.items[0].passed).toBe(1);
    expect(body.items[0].failed).toBe(1);
    expect(body.items[0].errors).toBe(1);
    expect(body.total).toBe(1);
  });
});

describe("GET /test-runs/:runId", () => {
  it("returns full run with cases", async () => {
    const run = createTestRun({ _id: "run-1", status: "completed" });
    const lean = vi.fn().mockResolvedValue(run);
    const populate = vi.fn().mockReturnValue({ lean });
    mocks.testRunFindOne.mockReturnValue({ populate });

    const res = await app.request(`${BASE}/run-1`, { method: "GET" });
    expect(res.status).toBe(200);

    const body = await jsonBody<any>(res);
    expect(body._id).toBe("run-1");
  });

  it("returns 404 for non-existent run", async () => {
    const lean = vi.fn().mockResolvedValue(null);
    const populate = vi.fn().mockReturnValue({ lean });
    mocks.testRunFindOne.mockReturnValue({ populate });

    const res = await app.request(`${BASE}/missing`, { method: "GET" });
    expect(res.status).toBe(404);

    const body = await jsonBody<any>(res);
    expect(body.error).toContain("not found");
  });
});

describe("POST /test-runs", () => {
  it("creates a run and returns 201", async () => {
    const cases = [
      createTestCase({ _id: "tc-1", testAgent: "agent-1", project: "proj123" }),
    ];
    mocks.testCaseFind.mockReturnValue({ lean: vi.fn().mockResolvedValue(cases) });

    const run = { _id: "run-new", status: "pending" };
    mocks.testRunCreate.mockResolvedValue(run);
    mocks.testRunUpdateOne.mockResolvedValue({});

    const res = await app.request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testCaseIds: ["tc-1"] }),
    });
    expect(res.status).toBe(201);

    const body = await jsonBody<any>(res);
    expect(body._id).toBe("run-new");
    expect(body.status).toBe("running");
  });

  it("returns 400 when no valid test cases found", async () => {
    mocks.testCaseFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });

    const res = await app.request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testCaseIds: ["nonexistent"] }),
    });
    expect(res.status).toBe(400);

    const body = await jsonBody<any>(res);
    expect(body.error).toContain("No valid test cases");
  });

  it("returns 400 when a test case has no agent assigned", async () => {
    const cases = [
      createTestCase({ _id: "tc-1", testAgent: null, title: "Orphan Case" }),
    ];
    mocks.testCaseFind.mockReturnValue({ lean: vi.fn().mockResolvedValue(cases) });

    const res = await app.request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testCaseIds: ["tc-1"] }),
    });
    expect(res.status).toBe(400);

    const body = await jsonBody<any>(res);
    expect(body.error).toContain("has no agent assigned");
  });

  it("rejects empty testCaseIds array (400)", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testCaseIds: [] }),
    });
    expect(res.status).toBe(400);
  });

  it("enqueues jobs when Redis is configured", async () => {
    mocks.isRedisConfigured.mockReturnValue(true);
    const cases = [
      createTestCase({ _id: "tc-1", testAgent: "agent-1", project: "proj123" }),
    ];
    mocks.testCaseFind.mockReturnValue({ lean: vi.fn().mockResolvedValue(cases) });
    mocks.testRunCreate.mockResolvedValue({ _id: "run-q", status: "pending" });
    mocks.testRunUpdateOne.mockResolvedValue({});
    mocks.enqueueTestRunJob.mockResolvedValue(undefined);

    const res = await app.request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ testCaseIds: ["tc-1"] }),
    });
    expect(res.status).toBe(201);
    expect(mocks.enqueueTestRunJob).toHaveBeenCalledTimes(1);
    expect(mocks.processTestCase).not.toHaveBeenCalled();
  });
});

describe("DELETE /test-runs/:runId", () => {
  it("deletes an existing run", async () => {
    const deleteOne = vi.fn().mockResolvedValue(undefined);
    mocks.testRunFindOne.mockResolvedValue({ deleteOne });

    const res = await app.request(`${BASE}/run-1`, { method: "DELETE" });
    expect(res.status).toBe(200);

    const body = await jsonBody<any>(res);
    expect(body.ok).toBe(true);
    expect(deleteOne).toHaveBeenCalled();
  });

  it("returns 404 for non-existent run", async () => {
    mocks.testRunFindOne.mockResolvedValue(null);

    const res = await app.request(`${BASE}/missing`, { method: "DELETE" });
    expect(res.status).toBe(404);

    const body = await jsonBody<any>(res);
    expect(body.error).toContain("not found");
  });
});
