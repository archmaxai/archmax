import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestCase, createTestAgent } from "@archmax/core/test-utils/factories";

const mocks = vi.hoisted(() => ({
  testCaseFind: vi.fn(),
  testCaseFindOne: vi.fn(),
  testCaseCreate: vi.fn(),
  testCaseFindOneAndUpdate: vi.fn(),
  testCaseCountDocuments: vi.fn(),
  testAgentFindOne: vi.fn(),
}));

vi.mock("@archmax/core/infra/db", () => ({ connectDB: vi.fn() }));
vi.mock("@archmax/core/models/index", () => ({
  TestCase: {
    find: mocks.testCaseFind,
    findOne: mocks.testCaseFindOne,
    create: mocks.testCaseCreate,
    findOneAndUpdate: mocks.testCaseFindOneAndUpdate,
    countDocuments: mocks.testCaseCountDocuments,
  },
  TestAgent: {
    findOne: mocks.testAgentFindOne,
  },
}));

import { createTestApp, jsonBody } from "../test-utils/api-client";
import testCasesRoute from "./test-cases";

const app = createTestApp("/api/projects/:projectId/test-cases", testCasesRoute);
const BASE = "/api/projects/proj123/test-cases";

function mockFindChain(items: unknown[]) {
  const lean = vi.fn().mockResolvedValue(items);
  const limit = vi.fn().mockReturnValue({ lean });
  const skip = vi.fn().mockReturnValue({ limit });
  const sort = vi.fn().mockReturnValue({ skip });
  const populate = vi.fn().mockReturnValue({ sort });
  mocks.testCaseFind.mockReturnValue({ populate });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /test-cases", () => {
  it("returns paginated list with correct total", async () => {
    const items = [createTestCase({ title: "Case 1" }), createTestCase({ title: "Case 2" })];
    mockFindChain(items);
    mocks.testCaseCountDocuments.mockResolvedValue(2);

    const res = await app.request(BASE, { method: "GET" });
    expect(res.status).toBe(200);

    const body = await jsonBody<any>(res);
    expect(body.items).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.page).toBe(1);
    expect(body.limit).toBe(25);
  });

  it("passes tag filter as $in query", async () => {
    mockFindChain([]);
    mocks.testCaseCountDocuments.mockResolvedValue(0);

    await app.request(`${BASE}?tags=unit,integration`, { method: "GET" });

    const filterArg = mocks.testCaseFind.mock.calls[0][0];
    expect(filterArg.tags).toEqual({ $in: ["unit", "integration"] });
  });

  it("passes semanticModel filter", async () => {
    mockFindChain([]);
    mocks.testCaseCountDocuments.mockResolvedValue(0);

    await app.request(`${BASE}?semanticModel=ecommerce`, { method: "GET" });

    const filterArg = mocks.testCaseFind.mock.calls[0][0];
    expect(filterArg.semanticModel).toBe("ecommerce");
  });
});

describe("POST /test-cases", () => {
  const validBody = {
    title: "Revenue Check",
    semanticModel: "ecommerce",
    inputMessage: "What is the total revenue?",
    expectedFacts: ["Revenue is 1.65 MEUR"],
  };

  it("creates test case with valid body and returns 201", async () => {
    const created = createTestCase({ ...validBody, project: "proj123" });
    mocks.testCaseCreate.mockResolvedValue({ toObject: () => created });

    const res = await app.request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(201);

    const body = await jsonBody<any>(res);
    expect(body.title).toBe("Revenue Check");
    expect(body.semanticModel).toBe("ecommerce");
  });

  it("validates test agent exists when testAgentId is provided", async () => {
    mocks.testAgentFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });

    const res = await app.request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, testAgentId: "nonexistent" }),
    });
    expect(res.status).toBe(404);

    const body = await jsonBody<any>(res);
    expect(body.error).toContain("not found");
  });

  it("creates test case with valid testAgentId", async () => {
    const agent = createTestAgent({ _id: "agent-1", project: "proj123" });
    mocks.testAgentFindOne.mockReturnValue({ lean: vi.fn().mockResolvedValue(agent) });
    const created = createTestCase({ ...validBody, testAgent: "agent-1", project: "proj123" });
    mocks.testCaseCreate.mockResolvedValue({ toObject: () => created });

    const res = await app.request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, testAgentId: "agent-1" }),
    });
    expect(res.status).toBe(201);
  });

  it("rejects body with empty expectedFacts (400)", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody, expectedFacts: [] }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects body missing required fields (400)", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Only title" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /test-cases/:caseId", () => {
  it("soft-deletes an existing test case", async () => {
    const softDelete = vi.fn().mockResolvedValue(undefined);
    mocks.testCaseFindOne.mockResolvedValue({ softDelete });

    const res = await app.request(`${BASE}/case-1`, { method: "DELETE" });
    expect(res.status).toBe(200);

    const body = await jsonBody<any>(res);
    expect(body.ok).toBe(true);
    expect(softDelete).toHaveBeenCalled();
  });

  it("returns 404 for non-existent test case", async () => {
    mocks.testCaseFindOne.mockResolvedValue(null);

    const res = await app.request(`${BASE}/missing`, { method: "DELETE" });
    expect(res.status).toBe(404);

    const body = await jsonBody<any>(res);
    expect(body.error).toContain("not found");
  });
});
