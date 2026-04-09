import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTestAgent } from "@archmax/core/test-utils/factories";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  findOne: vi.fn(),
  create: vi.fn(),
  findOneAndUpdate: vi.fn(),
}));

vi.mock("@archmax/core/infra/db", () => ({ connectDB: vi.fn() }));
vi.mock("@archmax/core/config/env", () => ({
  getEnv: vi.fn(() => ({ ENCRYPTION_KEY: "test-key-32-chars-long-xxxxxxxx" })),
}));
vi.mock("@archmax/core/infra/crypto", () => ({
  encrypt: vi.fn((val: string) => `enc_${val}`),
  decrypt: vi.fn((val: string) => val.replace("enc_", "")),
}));
vi.mock("@archmax/core/models/index", () => ({
  TestAgent: {
    find: mocks.find,
    findOne: mocks.findOne,
    create: mocks.create,
    findOneAndUpdate: mocks.findOneAndUpdate,
  },
}));

import { createTestApp, jsonBody } from "../test-utils/api-client";
import testAgentsRoute from "./test-agents";

const app = createTestApp("/api/projects/:projectId/test-agents", testAgentsRoute);
const BASE = "/api/projects/proj123/test-agents";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /test-agents", () => {
  it("returns list of agents with API keys stripped", async () => {
    const agents = [
      createTestAgent({ name: "Agent A", encryptedApiKey: "enc_sk-a" }),
      createTestAgent({ name: "Agent B", encryptedApiKey: "enc_sk-b" }),
    ];
    mocks.find.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(agents) }) });

    const res = await app.request(BASE, { method: "GET" });
    expect(res.status).toBe(200);

    const body = await jsonBody<any[]>(res);
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe("Agent A");
    expect(body[0].apiKeySet).toBe(true);
    expect(body[0].apiKeyMasked).toBe("sk-...****");
    expect(body[0]).not.toHaveProperty("encryptedApiKey");
  });

  it("returns empty array when no agents exist", async () => {
    mocks.find.mockReturnValue({ sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) });

    const res = await app.request(BASE, { method: "GET" });
    expect(res.status).toBe(200);

    const body = await jsonBody<any[]>(res);
    expect(body).toEqual([]);
  });
});

describe("POST /test-agents", () => {
  it("creates agent and returns stripped response with 201", async () => {
    const input = {
      name: "New Agent",
      semanticModels: ["ecommerce"],
      systemPrompt: "You are a tester",
      llmBaseUrl: "https://api.openai.com/v1",
      apiKey: "sk-live-123",
      llmModel: "gpt-4o",
    };

    const created = createTestAgent({
      name: input.name,
      semanticModels: input.semanticModels,
      systemPrompt: input.systemPrompt,
      llmBaseUrl: input.llmBaseUrl,
      llmModel: input.llmModel,
      encryptedApiKey: "enc_sk-live-123",
      project: "proj123",
    });
    mocks.create.mockResolvedValue({ toObject: () => created });

    const res = await app.request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    expect(res.status).toBe(201);

    const body = await jsonBody<any>(res);
    expect(body.name).toBe("New Agent");
    expect(body.apiKeySet).toBe(true);
    expect(body).not.toHaveProperty("encryptedApiKey");
    expect(body).not.toHaveProperty("apiKey");
  });

  it("rejects invalid body with 400", async () => {
    const res = await app.request(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /test-agents/:agentId", () => {
  it("soft-deletes an existing agent", async () => {
    const softDelete = vi.fn().mockResolvedValue(undefined);
    mocks.findOne.mockResolvedValue({ softDelete });

    const res = await app.request(`${BASE}/agent-1`, { method: "DELETE" });
    expect(res.status).toBe(200);

    const body = await jsonBody<any>(res);
    expect(body.ok).toBe(true);
    expect(softDelete).toHaveBeenCalled();
  });

  it("returns 404 for non-existent agent", async () => {
    mocks.findOne.mockResolvedValue(null);

    const res = await app.request(`${BASE}/missing`, { method: "DELETE" });
    expect(res.status).toBe(404);

    const body = await jsonBody<any>(res);
    expect(body.error).toContain("not found");
  });
});
