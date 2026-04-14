import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../infra/db", () => ({ connectDB: vi.fn() }));
vi.mock("../models/index", () => ({
  Connection: { find: vi.fn(() => ({ lean: vi.fn(() => []) })) },
}));

const mockHardenConnection = vi.fn();
const mockGetProjectInstance = vi.fn();
const mockCreateScopedViews = vi.fn();

vi.mock("./duckdb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./duckdb")>();
  return {
    ...actual,
    getProjectInstance: (...args: unknown[]) => mockGetProjectInstance(...args),
    createScopedViews: (...args: unknown[]) => mockCreateScopedViews(...args),
    getAttachedCatalogSlugs: vi.fn(() => []),
    hardenConnection: (...args: unknown[]) => mockHardenConnection(...args),
  };
});
vi.mock("./sql-validation", () => ({
  validateReadOnlySQL: vi.fn(() => null),
  validateScopedSQL: vi.fn(() => null),
}));

import {
  listSemanticModels,
  getSemanticModelOverview,
  getDatasetFields,
  executeScopedQuery,
  EXECUTE_QUERY_DESCRIPTION,
} from "./mcp-tools";
import type { SemanticModelFileService } from "./semantic-model-files";
import type { SemanticModel } from "./semantic-model-schema";

function createMockFileSvc(models: Array<{ name: string; description?: string; datasets: SemanticModel["datasets"]; metrics: SemanticModel["metrics"] }>) {
  return {
    list: vi.fn().mockResolvedValue(models),
    get: vi.fn().mockImplementation((_projectId: string, modelName: string) => {
      return Promise.resolve(models.find((m) => m.name === modelName) ?? null);
    }),
  } as unknown as SemanticModelFileService;
}

function makeField(name: string) {
  return {
    name,
    expression: { dialects: [{ dialect: "ANSI_SQL" as const, expression: name }] },
    description: "",
    custom_extensions: [],
  };
}

function makeDataset(name: string, fields: string[]) {
  return {
    name,
    source: `catalog.public.${name}`,
    primary_key: [] as string[],
    unique_keys: [] as string[][],
    description: "",
    fields: fields.map(makeField),
    custom_extensions: [],
  };
}

function makeModel(name: string, datasets: ReturnType<typeof makeDataset>[]): SemanticModel {
  return {
    name,
    description: "",
    datasets,
    relationships: [],
    metrics: [],
    custom_extensions: [],
  };
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
    expect(result.text).toContain("No semantic models found");
  });

  it("returns scope mismatch error when scopes don't match", async () => {
    const fileSvc = createMockFileSvc([
      { name: "ecommerce", datasets: [{}], metrics: [] },
    ]);
    const result = await listSemanticModels(fileSvc, "proj1", ["nonexistent"]);
    expect(result.isError).toBe(true);
    expect(result.text).toContain("nonexistent");
    expect(result.text).toContain("ecommerce");
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
    const result = await getDatasetFields(fileSvc, "proj1", ["allowed"], "forbidden", [{ name: "ds1" }], {});
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Access denied");
  });

  it("returns not found for missing model", async () => {
    const fileSvc = createMockFileSvc([]);
    const result = await getDatasetFields(fileSvc, "proj1", ["missing"], "missing", [{ name: "ds1" }], {});
    expect(result.isError).toBe(true);
    expect(result.text).toContain("not found");
  });

  it("returns error for missing dataset names in existing model", async () => {
    const fileSvc = createMockFileSvc([
      {
        name: "sales",
        datasets: [makeDataset("orders", ["id"])],
        metrics: [],
      },
    ]);
    const result = await getDatasetFields(fileSvc, "proj1", ["sales"], "sales", [{ name: "nonexistent" }], {});
    expect(result.isError).toBe(true);
    expect(result.text).toContain("nonexistent");
    expect(result.text).toContain("not found");
  });
});

describe("EXECUTE_QUERY_DESCRIPTION", () => {
  it("does not contain _scope_ references", () => {
    expect(EXECUTE_QUERY_DESCRIPTION).not.toContain("_scope_");
  });

  it("instructs agents to use dataset names directly", () => {
    expect(EXECUTE_QUERY_DESCRIPTION).toContain("dataset names directly");
  });

  it("mentions DuckDB as the SQL engine", () => {
    expect(EXECUTE_QUERY_DESCRIPTION).toContain("DuckDB");
  });

  it("warns against PostgreSQL functions", () => {
    expect(EXECUTE_QUERY_DESCRIPTION).toContain("json_array_elements");
    expect(EXECUTE_QUERY_DESCRIPTION).toContain("PostgreSQL-only");
  });
});

describe("executeScopedQuery", () => {
  beforeEach(() => {
    mockHardenConnection.mockReset();
    mockGetProjectInstance.mockReset();
    mockCreateScopedViews.mockReset();
  });

  it("returns access denied for out-of-scope model", async () => {
    const fileSvc = createMockFileSvc([]);
    const result = await executeScopedQuery(fileSvc, "proj1", ["allowed"], "forbidden", "SELECT 1");
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Access denied");
  });

  it("returns not found for missing model", async () => {
    const fileSvc = createMockFileSvc([]);
    const result = await executeScopedQuery(fileSvc, "proj1", ["missing"], "missing", "SELECT 1");
    expect(result.isError).toBe(true);
    expect(result.text).toContain("not found");
  });

  it("passes scopeSchemaName to hardenConnection", async () => {
    const model = makeModel("ecommerce", [makeDataset("orders", ["id", "total"])]);
    const fileSvc = createMockFileSvc([{ ...model, metrics: [] }]);

    const mockDb = {
      prepare: vi.fn().mockResolvedValue({
        bindVarchar: vi.fn(),
        run: vi.fn().mockResolvedValue({
          columnNames: () => ["id", "total"],
          [Symbol.asyncIterator]: () => ({ next: () => Promise.resolve({ done: true, value: undefined }) }),
        }),
      }),
      disconnectSync: vi.fn(),
    };
    mockGetProjectInstance.mockResolvedValue({ connect: () => Promise.resolve(mockDb) });

    await executeScopedQuery(fileSvc, "proj1", ["ecommerce"], "ecommerce", "SELECT * FROM orders");

    expect(mockHardenConnection).toHaveBeenCalledWith(mockDb, "_scope_ecommerce", { allowExternalAccess: false });
  });

  it("returns binder error with bare dataset name hints", async () => {
    const model = makeModel("shop", [
      makeDataset("orders", ["order_id", "total"]),
      makeDataset("customers", ["id", "email"]),
    ]);
    const fileSvc = createMockFileSvc([{ ...model, metrics: [] }]);

    const mockDb = {
      prepare: vi.fn().mockRejectedValue(
        new Error('Binder Error: Referenced column "nonexistent" not found in FROM clause!'),
      ),
      disconnectSync: vi.fn(),
    };
    mockGetProjectInstance.mockResolvedValue({ connect: () => Promise.resolve(mockDb) });

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await executeScopedQuery(fileSvc, "proj1", ["shop"], "shop", "SELECT nonexistent FROM orders");
    errSpy.mockRestore();

    expect(result.isError).toBe(true);
    expect(result.text).toContain("Binder Error");
    expect(result.text).toContain("HINT");
    expect(result.text).toContain("orders: order_id, total");
    expect(result.text).toContain("customers: id, email");
    expect(result.text).not.toContain("_scope_");
  });

  it("returns table-not-found error with bare dataset name hints", async () => {
    const model = makeModel("shop", [makeDataset("orders", ["id"])]);
    const fileSvc = createMockFileSvc([{ ...model, metrics: [] }]);

    const mockDb = {
      prepare: vi.fn().mockRejectedValue(
        new Error("Binder Error: Table with name wrong_table does not exist"),
      ),
      disconnectSync: vi.fn(),
    };
    mockGetProjectInstance.mockResolvedValue({ connect: () => Promise.resolve(mockDb) });

    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await executeScopedQuery(fileSvc, "proj1", ["shop"], "shop", "SELECT * FROM wrong_table");
    errSpy.mockRestore();

    expect(result.isError).toBe(true);
    expect(result.text).toContain("HINT");
    expect(result.text).toContain("orders: id");
  });
});
