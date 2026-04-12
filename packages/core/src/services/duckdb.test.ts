import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { DuckDBInstance } from "@duckdb/node-api";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import type { IConnectionConfig } from "../models/Connection";

vi.mock("../config/env", () => ({
  getEnv: vi.fn(() => ({ ENCRYPTION_KEY: "", projectsDir: "/tmp/test-projects" })),
}));

import { createScopedViews, hardenConnection, scopedViewName, scopeSchemaName, computeModelHash, invalidateScopedViews, buildAttachString, COMMUNITY_EXTENSIONS, csvTableName, buildReadCsvOptions, csvFilePath } from "./duckdb";
import type { IConnectionDocument } from "../models/Connection";
import type { SemanticModel } from "./semantic-model-schema";

function makeModel(name: string, datasets: SemanticModel["datasets"]): SemanticModel {
  return {
    name,
    description: "",
    datasets,
    relationships: [],
    metrics: [],
    custom_extensions: [],
  };
}

function makeDataset(
  name: string,
  source: string,
  fields: Array<{ name: string; expression?: string }>,
) {
  return {
    name,
    source,
    primary_key: [] as string[],
    unique_keys: [] as string[][],
    description: "",
    fields: fields.map((f) => ({
      name: f.name,
      expression: {
        dialects: [{ dialect: "ANSI_SQL" as const, expression: f.expression ?? f.name }],
      },
      description: "",
      custom_extensions: [],
    })),
    custom_extensions: [],
  };
}

describe("scopeSchemaName", () => {
  it("produces _scope_<modelName> format", () => {
    expect(scopeSchemaName("ecommerce")).toBe("_scope_ecommerce");
  });
});

describe("scopedViewName", () => {
  it('produces _scope_<modelName>."dataset" format', () => {
    expect(scopedViewName("ecommerce", "orders")).toBe('_scope_ecommerce."orders"');
  });

  it("handles dataset names with hyphens", () => {
    expect(scopedViewName("shop", "my-dataset")).toBe('_scope_shop."my-dataset"');
  });
});

describe("createScopedViews", () => {
  let instance: DuckDBInstance;
  const projectId = "test-project";

  beforeEach(async () => {
    invalidateScopedViews(projectId);
    instance = await DuckDBInstance.create();
    const db = await instance.connect();
    try {
      await db.run("CREATE TABLE test_source (id INTEGER, name VARCHAR, amount DECIMAL(10,2))");
      await db.run("INSERT INTO test_source VALUES (1, 'Alice', 99.99), (2, 'Bob', 50.00)");
    } finally {
      db.disconnectSync();
    }
  });

  it("creates VIEWs in per-model schema", async () => {
    const model = makeModel("shop", [
      makeDataset("orders", "test_source", [
        { name: "id" },
        { name: "name" },
      ]),
    ]);

    await createScopedViews(instance, projectId, model);

    const db = await instance.connect();
    try {
      const result = await db.run('SELECT * FROM _scope_shop."orders"');
      const columns = result.columnNames();
      const rows: unknown[][] = [];
      for await (const chunk of result) {
        rows.push(...chunk.getRows());
      }

      expect(columns).toEqual(["id", "name"]);
      expect(rows).toHaveLength(2);
    } finally {
      db.disconnectSync();
    }
  });

  it("excludes amount column not in model fields", async () => {
    const model = makeModel("shop", [
      makeDataset("orders", "test_source", [{ name: "id" }]),
    ]);

    await createScopedViews(instance, projectId, model);

    const db = await instance.connect();
    try {
      const result = await db.run('SELECT * FROM _scope_shop."orders"');
      const columns = result.columnNames();
      expect(columns).toEqual(["id"]);
      expect(columns).not.toContain("amount");
      expect(columns).not.toContain("name");
    } finally {
      db.disconnectSync();
    }
  });

  it("handles computed expressions", async () => {
    const model = makeModel("shop", [
      makeDataset("orders", "test_source", [
        { name: "order_id", expression: "id" },
        { name: "total", expression: "amount * 1.1" },
      ]),
    ]);

    await createScopedViews(instance, projectId, model);

    const db = await instance.connect();
    try {
      const result = await db.run('SELECT order_id, total FROM _scope_shop."orders" ORDER BY order_id');
      const columns = result.columnNames();
      expect(columns).toEqual(["order_id", "total"]);

      const rows: unknown[][] = [];
      for await (const chunk of result) {
        rows.push(...chunk.getRows());
      }
      expect(rows[0][0]).toBe(1);
    } finally {
      db.disconnectSync();
    }
  });

  it("skips datasets with zero fields", async () => {
    const model = makeModel("shop", [
      makeDataset("empty", "test_source", []),
      makeDataset("orders", "test_source", [{ name: "id" }]),
    ]);

    await createScopedViews(instance, projectId, model);

    const db = await instance.connect();
    try {
      const result = await db.run('SELECT * FROM _scope_shop."orders"');
      expect(result.columnNames()).toEqual(["id"]);

      await expect(db.run('SELECT * FROM _scope_shop."empty"')).rejects.toThrow();
    } finally {
      db.disconnectSync();
    }
  });

  it("isolates models in separate schemas", async () => {
    const modelA = makeModel("model_a", [
      makeDataset("ds", "test_source", [{ name: "id" }]),
    ]);
    const modelB = makeModel("model_b", [
      makeDataset("ds", "test_source", [{ name: "name" }]),
    ]);

    await createScopedViews(instance, projectId, modelA);
    await createScopedViews(instance, projectId, modelB);

    const db = await instance.connect();
    try {
      const resultA = await db.run('SELECT * FROM _scope_model_a."ds"');
      expect(resultA.columnNames()).toEqual(["id"]);

      const resultB = await db.run('SELECT * FROM _scope_model_b."ds"');
      expect(resultB.columnNames()).toEqual(["name"]);
    } finally {
      db.disconnectSync();
    }
  });

  it("skips view recreation when model hash unchanged", async () => {
    const model = makeModel("shop", [
      makeDataset("orders", "test_source", [{ name: "id" }]),
    ]);

    await createScopedViews(instance, projectId, model);
    await createScopedViews(instance, projectId, model);

    const db = await instance.connect();
    try {
      const result = await db.run('SELECT * FROM _scope_shop."orders"');
      expect(result.columnNames()).toEqual(["id"]);
    } finally {
      db.disconnectSync();
    }
  });

  it("skips invalid field expressions and keeps valid ones", async () => {
    const model = makeModel("shop", [
      makeDataset("orders", "test_source", [
        { name: "id" },
        { name: "bad_field", expression: "json_extract_string(elem, '$.foo')" },
        { name: "name" },
      ]),
    ]);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await createScopedViews(instance, projectId, model);
    warnSpy.mockRestore();

    const db = await instance.connect();
    try {
      const result = await db.run('SELECT * FROM _scope_shop."orders"');
      const columns = result.columnNames();
      expect(columns).toEqual(["id", "name"]);
      expect(columns).not.toContain("bad_field");
    } finally {
      db.disconnectSync();
    }
  });

  it("logs a warning for skipped field expressions", async () => {
    const model = makeModel("shop", [
      makeDataset("orders", "test_source", [
        { name: "id" },
        { name: "broken", expression: "nonexistent_column + 1" },
      ]),
    ]);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await createScopedViews(instance, projectId, model);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("Skipped 1 invalid field expression");
    expect(warnSpy.mock.calls[0][0]).toContain("orders.broken");
    warnSpy.mockRestore();
  });

  it("recreates views after cache invalidation", async () => {
    const model = makeModel("shop", [
      makeDataset("orders", "test_source", [{ name: "id" }]),
    ]);

    await createScopedViews(instance, projectId, model);
    invalidateScopedViews(projectId, "shop");

    const modelV2 = makeModel("shop", [
      makeDataset("orders", "test_source", [{ name: "id" }, { name: "name" }]),
    ]);
    await createScopedViews(instance, projectId, modelV2);

    const db = await instance.connect();
    try {
      const result = await db.run('SELECT * FROM _scope_shop."orders"');
      expect(result.columnNames()).toEqual(["id", "name"]);
    } finally {
      db.disconnectSync();
    }
  });
});

describe("computeModelHash", () => {
  it("returns same hash for identical models", () => {
    const model = makeModel("shop", [
      makeDataset("orders", "test_source", [{ name: "id" }]),
    ]);
    expect(computeModelHash(model)).toBe(computeModelHash(model));
  });

  it("returns different hash when fields change", () => {
    const a = makeModel("shop", [
      makeDataset("orders", "test_source", [{ name: "id" }]),
    ]);
    const b = makeModel("shop", [
      makeDataset("orders", "test_source", [{ name: "id" }, { name: "name" }]),
    ]);
    expect(computeModelHash(a)).not.toBe(computeModelHash(b));
  });
});

function fakeConn(overrides: Partial<IConnectionDocument> & { type: string; connectionConfig: Record<string, unknown> }): IConnectionDocument {
  return {
    _id: "000000000000000000000000",
    slug: "test_conn",
    ...overrides,
  } as unknown as IConnectionDocument;
}

describe("COMMUNITY_EXTENSIONS", () => {
  it("includes mssql", () => {
    expect(COMMUNITY_EXTENSIONS.has("mssql")).toBe(true);
  });

  it("does not include postgres or mysql", () => {
    expect(COMMUNITY_EXTENSIONS.has("postgres")).toBe(false);
    expect(COMMUNITY_EXTENSIONS.has("mysql")).toBe(false);
  });
});

describe("buildAttachString — mssql", () => {
  it("produces ADO.NET format with default encrypt=yes", () => {
    const conn = fakeConn({
      type: "mssql",
      connectionConfig: { host: "db.example.com", port: 1433, database: "mydb", user: "sa", password: "s3cret" },
    });
    expect(buildAttachString(conn)).toBe(
      "Server=db.example.com,1433;Database=mydb;User Id=sa;Password=s3cret;Encrypt=yes",
    );
  });

  it("respects encrypt=false", () => {
    const conn = fakeConn({
      type: "mssql",
      connectionConfig: { host: "localhost", database: "testdb", user: "sa", password: "pw", encrypt: false },
    });
    expect(buildAttachString(conn)).toContain("Encrypt=no");
  });

  it("respects explicit encrypt=true", () => {
    const conn = fakeConn({
      type: "mssql",
      connectionConfig: { host: "localhost", database: "testdb", user: "sa", password: "pw", encrypt: true },
    });
    expect(buildAttachString(conn)).toContain("Encrypt=yes");
  });

  it("defaults port to 1433", () => {
    const conn = fakeConn({
      type: "mssql",
      connectionConfig: { host: "h", database: "d", user: "u", password: "p" },
    });
    expect(buildAttachString(conn)).toContain("Server=h,1433");
  });

  it("uses custom port when provided", () => {
    const conn = fakeConn({
      type: "mssql",
      connectionConfig: { host: "h", port: 2433, database: "d", user: "u", password: "p" },
    });
    expect(buildAttachString(conn)).toContain("Server=h,2433");
  });

  it("passes through URI when set", () => {
    const conn = fakeConn({
      type: "mssql",
      connectionConfig: { uri: "Server=custom;Database=x" },
    });
    expect(buildAttachString(conn)).toBe("Server=custom;Database=x");
  });
});

describe("buildAttachString — postgres", () => {
  it("produces key=value format", () => {
    const conn = fakeConn({
      type: "postgres",
      connectionConfig: { host: "pg.local", port: 5432, database: "app", user: "admin", password: "pw" },
    });
    expect(buildAttachString(conn)).toBe("host=pg.local port=5432 dbname=app user=admin password=pw");
  });
});

describe("hardenConnection", () => {
  it("disables external access", async () => {
    const instance = await DuckDBInstance.create();
    const db = await instance.connect();
    await hardenConnection(db);

    try {
      await expect(
        db.run("SELECT * FROM read_csv('/tmp/nonexistent.csv')"),
      ).rejects.toThrow(/disabled/i);
    } finally {
      db.disconnectSync();
    }
  });

  it("sets search_path when provided", async () => {
    const instance = await DuckDBInstance.create();
    const setup = await instance.connect();
    try {
      await setup.run("CREATE SCHEMA _scope_test");
      await setup.run("CREATE TABLE raw_data (id INTEGER)");
      await setup.run("INSERT INTO raw_data VALUES (1)");
      await setup.run('CREATE VIEW _scope_test."orders" AS SELECT id FROM raw_data');
    } finally {
      setup.disconnectSync();
    }

    const db = await instance.connect();
    await hardenConnection(db, "_scope_test");

    try {
      const result = await db.run('SELECT * FROM "orders"');
      const rows: unknown[][] = [];
      for await (const chunk of result) {
        rows.push(...chunk.getRows());
      }
      expect(rows).toHaveLength(1);
    } finally {
      db.disconnectSync();
    }
  });

  it("allows different search_paths on successive connections", async () => {
    const instance = await DuckDBInstance.create();
    const setup = await instance.connect();
    try {
      await setup.run("CREATE SCHEMA _scope_a");
      await setup.run("CREATE SCHEMA _scope_b");
      await setup.run("CREATE TABLE src (val VARCHAR)");
      await setup.run("INSERT INTO src VALUES ('from_a'), ('from_b')");
      await setup.run('CREATE VIEW _scope_a."items" AS SELECT val FROM src WHERE val = \'from_a\'');
      await setup.run('CREATE VIEW _scope_b."items" AS SELECT val FROM src WHERE val = \'from_b\'');
    } finally {
      setup.disconnectSync();
    }

    const dbA = await instance.connect();
    await hardenConnection(dbA, "_scope_a");
    try {
      const result = await dbA.run('SELECT * FROM "items"');
      const rows: unknown[][] = [];
      for await (const chunk of result) { rows.push(...chunk.getRows()); }
      expect(rows[0][0]).toBe("from_a");
    } finally {
      dbA.disconnectSync();
    }

    const dbB = await instance.connect();
    await hardenConnection(dbB, "_scope_b");
    try {
      const result = await dbB.run('SELECT * FROM "items"');
      const rows: unknown[][] = [];
      for await (const chunk of result) { rows.push(...chunk.getRows()); }
      expect(rows[0][0]).toBe("from_b");
    } finally {
      dbB.disconnectSync();
    }
  });
});

// ── CSV helpers ──────────────────────────────────────────────────────

describe("csvTableName", () => {
  it("strips extension and lowercases", () => {
    expect(csvTableName("Sales_Data.csv")).toBe("sales_data");
  });

  it("replaces spaces and special chars with underscores", () => {
    expect(csvTableName("My Report (2024).csv")).toBe("my_report_2024");
  });

  it("prepends underscore for leading digit", () => {
    expect(csvTableName("2024-revenue.csv")).toBe("_2024_revenue");
  });

  it("handles dotless filename", () => {
    expect(csvTableName("data")).toBe("data");
  });

  it("handles multiple dots by stripping only final extension", () => {
    expect(csvTableName("my.data.file.csv")).toBe("my_data_file");
  });

  it("handles empty stem", () => {
    expect(csvTableName(".csv")).toBe("_");
  });
});

describe("buildReadCsvOptions", () => {
  it("returns empty string for no options", () => {
    expect(buildReadCsvOptions({} as IConnectionConfig)).toBe("");
  });

  it("builds delimiter option", () => {
    expect(buildReadCsvOptions({ delimiter: ";" } as IConnectionConfig)).toBe(", delim = ';'");
  });

  it("builds multiple options", () => {
    const result = buildReadCsvOptions({ delimiter: "|", header: true, skip: 2 } as IConnectionConfig);
    expect(result).toContain("delim = '|'");
    expect(result).toContain("header = true");
    expect(result).toContain("skip = 2");
  });

  it("includes quote and escape", () => {
    const result = buildReadCsvOptions({ quote: "'", escape: "\\" } as IConnectionConfig);
    expect(result).toContain("quote = '''");
    expect(result).toContain("escape = '\\'");
  });
});

describe("csvFilePath", () => {
  it("resolves simple filename", () => {
    const path = csvFilePath("proj1", "data.csv");
    expect(path).toBe(join("/tmp/test-projects", "proj1", "uploads", "data.csv"));
  });

  it("rejects path traversal with ..", () => {
    expect(() => csvFilePath("proj1", "../../../etc/passwd")).toThrow("path separators");
  });

  it("rejects forward slash", () => {
    expect(() => csvFilePath("proj1", "sub/file.csv")).toThrow("path separators");
  });

  it("rejects backslash", () => {
    expect(() => csvFilePath("proj1", "sub\\file.csv")).toThrow("path separators");
  });
});

describe("CSV DuckDB attach", () => {
  const CSV_DIR = join("/tmp/test-projects", "csv-test-proj", "uploads");
  const CSV_CONTENT = `id,name,amount\n1,Alice,99.99\n2,Bob,50.00\n3,Charlie,75.50\n`;

  beforeEach(async () => {
    await mkdir(CSV_DIR, { recursive: true });
    await writeFile(join(CSV_DIR, "sales.csv"), CSV_CONTENT);
  });

  afterEach(async () => {
    await rm(join("/tmp/test-projects", "csv-test-proj"), { recursive: true, force: true });
  });

  it("materializes CSV into a DuckDB catalog and allows querying", async () => {
    const instance = await DuckDBInstance.create();
    const db = await instance.connect();
    try {
      const filePath = join(CSV_DIR, "sales.csv").replace(/'/g, "''");
      await db.run("ATTACH ':memory:' AS test_csv");
      await db.run(`CREATE TABLE test_csv."sales" AS SELECT * FROM read_csv('${filePath}')`);

      const result = await db.run('SELECT COUNT(*) AS cnt FROM test_csv."sales"');
      const rows: unknown[][] = [];
      for await (const chunk of result) { rows.push(...chunk.getRows()); }
      expect(Number(rows[0][0])).toBe(3);
    } finally {
      db.disconnectSync();
    }
  });

  it("CSV catalog appears in SHOW DATABASES", async () => {
    const instance = await DuckDBInstance.create();
    const db = await instance.connect();
    try {
      const filePath = join(CSV_DIR, "sales.csv").replace(/'/g, "''");
      await db.run("ATTACH ':memory:' AS test_csv");
      await db.run(`CREATE TABLE test_csv."sales" AS SELECT * FROM read_csv('${filePath}')`);

      const result = await db.run("SHOW DATABASES");
      const rows: unknown[][] = [];
      for await (const chunk of result) { rows.push(...chunk.getRows()); }
      const dbNames = rows.map((r) => r[0]);
      expect(dbNames).toContain("test_csv");
    } finally {
      db.disconnectSync();
    }
  });

  it("CSV data survives after enable_external_access = false", async () => {
    const instance = await DuckDBInstance.create();
    const setup = await instance.connect();
    try {
      const filePath = join(CSV_DIR, "sales.csv").replace(/'/g, "''");
      await setup.run("ATTACH ':memory:' AS test_csv");
      await setup.run(`CREATE TABLE test_csv."sales" AS SELECT * FROM read_csv('${filePath}')`);
    } finally {
      setup.disconnectSync();
    }

    const db = await instance.connect();
    await hardenConnection(db);
    try {
      const result = await db.run('SELECT name FROM test_csv."sales" ORDER BY id');
      const rows: unknown[][] = [];
      for await (const chunk of result) { rows.push(...chunk.getRows()); }
      expect(rows.map((r) => r[0])).toEqual(["Alice", "Bob", "Charlie"]);
    } finally {
      db.disconnectSync();
    }
  });
});
