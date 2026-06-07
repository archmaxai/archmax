import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  updateModelExtensions: vi.fn(),
  updateDatasetMetadata: vi.fn(),
  exists: vi.fn(),
}));

vi.mock("@archmax/core/config/env", () => ({
  getEnv: vi.fn(() => ({ ARCHMAX_DATA_DIR: "/tmp/test-data", projectsDir: "/tmp/test-data/projects" })),
}));

vi.mock("@archmax/core/services/semantic-model-files", () => ({
  SemanticModelFileService: class {
    updateModelExtensions = mocks.updateModelExtensions;
    updateDatasetMetadata = mocks.updateDatasetMetadata;
    exists = mocks.exists;
  },
}));

import { createTestApp, jsonBody } from "../test-utils/api-client";
import semanticModelsRoute from "./semantic-models";

const app = createTestApp("/api/projects/:projectId/semantic-models", semanticModelsRoute);
const BASE = "/api/projects/proj1/semantic-models";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /semantic-models/:name/extensions", () => {
  it("updates model extensions and returns ok", async () => {
    mocks.updateModelExtensions.mockResolvedValue(true);

    const extensions = [
      { vendor_name: "COMMON", data: '{"dataset_groups":[{"id":"g1","name":"Sales","datasets":["orders"]}]}' },
    ];

    const res = await app.request(`${BASE}/my-model/extensions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ custom_extensions: extensions }),
    });

    expect(res.status).toBe(200);
    const body = await jsonBody<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
    expect(mocks.updateModelExtensions).toHaveBeenCalledWith("proj1", "my-model", extensions);
  });

  it("returns 404 when model does not exist", async () => {
    mocks.updateModelExtensions.mockResolvedValue(false);

    const res = await app.request(`${BASE}/nonexistent/extensions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ custom_extensions: [] }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid payload", async () => {
    const res = await app.request(`${BASE}/my-model/extensions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ custom_extensions: [{ bad: "data" }] }),
    });

    expect(res.status).not.toBe(200);
  });
});

describe("PATCH /semantic-models/:name/datasets/:datasetName", () => {
  it("updates dataset metadata and returns ok", async () => {
    mocks.updateDatasetMetadata.mockResolvedValue(true);

    const payload = {
      description: "Order line items",
      ai_context: { instructions: "Use for revenue analysis" },
      fields: [{ name: "total_price", description: "Line total in USD" }],
    };

    const res = await app.request(`${BASE}/my-model/datasets/orders`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const body = await jsonBody<{ ok: boolean }>(res);
    expect(body.ok).toBe(true);
    expect(mocks.updateDatasetMetadata).toHaveBeenCalledWith("proj1", "my-model", "orders", payload);
  });

  it("returns 404 when the dataset does not exist", async () => {
    mocks.updateDatasetMetadata.mockResolvedValue(false);

    const res = await app.request(`${BASE}/my-model/datasets/missing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "x" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns 400 when the service rejects an unknown field", async () => {
    mocks.updateDatasetMetadata.mockRejectedValue(new Error('Unknown field "ghost" in dataset "orders"'));

    const res = await app.request(`${BASE}/my-model/datasets/orders`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: [{ name: "ghost", description: "x" }] }),
    });

    expect(res.status).toBe(400);
    const body = await jsonBody<{ error: string }>(res);
    expect(body.error).toMatch(/Unknown field/);
  });

  it("returns 400 for an invalid field entry payload", async () => {
    const res = await app.request(`${BASE}/my-model/datasets/orders`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: [{ description: "missing name" }] }),
    });

    expect(res.status).not.toBe(200);
    expect(mocks.updateDatasetMetadata).not.toHaveBeenCalled();
  });
});
