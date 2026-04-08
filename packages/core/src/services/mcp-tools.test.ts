import { describe, it, expect, vi } from "vitest";

vi.mock("../infra/db", () => ({ connectDB: vi.fn() }));
vi.mock("../models/index", () => ({
  Connection: { find: vi.fn(() => ({ lean: vi.fn(() => []) })) },
}));
vi.mock("./duckdb", () => ({
  getProjectInstance: vi.fn(),
  createScopedViews: vi.fn(),
  getAttachedCatalogSlugs: vi.fn(() => []),
  hardenConnection: vi.fn(),
}));
vi.mock("./sql-validation", () => ({
  validateReadOnlySQL: vi.fn(() => null),
  validateScopedSQL: vi.fn(() => null),
}));

import {
  listSemanticModels,
  getSemanticModelOverview,
  getDatasetFields,
} from "./mcp-tools";
import type { SemanticModelFileService } from "./semantic-model-files";

function createMockFileSvc(models: Array<{ name: string; description?: string; datasets: any[]; metrics: any[] }>) {
  return {
    list: vi.fn().mockResolvedValue(models),
    get: vi.fn().mockImplementation((_projectId: string, modelName: string) => {
      return Promise.resolve(models.find((m) => m.name === modelName) ?? null);
    }),
  } as unknown as SemanticModelFileService;
}

describe("listSemanticModels", () => {
  it("returns filtered models matching scopes", async () => {
    const fileSvc = createMockFileSvc([
      { name: "ecommerce", description: "Online store data", datasets: [{}, {}], metrics: [{}] },
      { name: "hr", description: "HR data", datasets: [{}], metrics: [] },
      { name: "finance", datasets: [{}], metrics: [{}] },
    ]);

    const result = await listSemanticModels(fileSvc, "proj1", ["ecommerce", "finance"]);

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("ecommerce");
    expect(result.text).toContain("finance");
    expect(result.text).not.toContain("## hr");
  });

  it("returns empty message when no models exist", async () => {
    const fileSvc = createMockFileSvc([]);
    const result = await listSemanticModels(fileSvc, "proj1", ["anything"]);
    expect(result.text).toContain("No published semantic models found");
  });

  it("returns header with no models when scopes don't match", async () => {
    const fileSvc = createMockFileSvc([
      { name: "ecommerce", datasets: [{}], metrics: [] },
    ]);
    const result = await listSemanticModels(fileSvc, "proj1", ["nonexistent"]);
    expect(result.text).toContain("# Semantic Models");
    expect(result.text).not.toContain("ecommerce");
  });

  it("includes description when present", async () => {
    const fileSvc = createMockFileSvc([
      { name: "ecommerce", description: "All the shopping data", datasets: [], metrics: [] },
    ]);
    const result = await listSemanticModels(fileSvc, "proj1", ["ecommerce"]);
    expect(result.text).toContain("All the shopping data");
  });

  it("shows dataset and metric counts", async () => {
    const fileSvc = createMockFileSvc([
      { name: "sales", datasets: [{}, {}, {}], metrics: [{}, {}] },
    ]);
    const result = await listSemanticModels(fileSvc, "proj1", ["sales"]);
    expect(result.text).toContain("**Datasets:** 3");
    expect(result.text).toContain("**Metrics:** 2");
  });
});

describe("getSemanticModelOverview", () => {
  it("returns access denied for out-of-scope model", async () => {
    const fileSvc = createMockFileSvc([]);
    const result = await getSemanticModelOverview(fileSvc, "proj1", ["allowed"], "forbidden", {});
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Access denied");
  });

  it("returns not found for missing model", async () => {
    const fileSvc = createMockFileSvc([]);
    const result = await getSemanticModelOverview(fileSvc, "proj1", ["missing"], "missing", {});
    expect(result.isError).toBe(true);
    expect(result.text).toContain("not found");
  });
});

describe("getDatasetFields", () => {
  it("returns access denied for out-of-scope model", async () => {
    const fileSvc = createMockFileSvc([]);
    const result = await getDatasetFields(fileSvc, "proj1", ["allowed"], "forbidden", ["ds1"], {});
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Access denied");
  });

  it("returns not found for missing model", async () => {
    const fileSvc = createMockFileSvc([]);
    const result = await getDatasetFields(fileSvc, "proj1", ["missing"], "missing", ["ds1"], {});
    expect(result.isError).toBe(true);
    expect(result.text).toContain("not found");
  });

  it("returns error for missing dataset names in existing model", async () => {
    const fileSvc = createMockFileSvc([
      { name: "sales", datasets: [{ name: "orders", fields: [] }], metrics: [] },
    ]);
    const result = await getDatasetFields(fileSvc, "proj1", ["sales"], "sales", ["nonexistent"], {});
    expect(result.isError).toBe(true);
    expect(result.text).toContain("nonexistent");
    expect(result.text).toContain("not found");
  });
});
