import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";

const TMP_PROJECTS_DIR = mkdtempSync(join(tmpdir(), "archmax-duckdb-test-"));

vi.mock("../config/env", () => ({
  getEnv: vi.fn(() => ({ ENCRYPTION_KEY: "", projectsDir: TMP_PROJECTS_DIR })),
}));

import {
  hardenConnection,
  scopedViewName,
  scopeSchemaName,
  buildAttachString,
  COMMUNITY_EXTENSIONS,
  getQueryTimeoutMs,
  withQueryTimeout,
  withProjectQuerySlot,
  getProjectInstance,
  disposeProjectInstance,
  materialiseModelViews,
  stripScopedSchemaQualifier,
  duckdbFilePath,
  deleteProjectDuckdbFile,
} from "./duckdb";
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
  viewQuery?: string,
) {
  const custom_extensions = viewQuery
    ? [{ vendor_name: "COMMON", data: JSON.stringify({ view_query: viewQuery }) }]
    : [];
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
    custom_extensions,
    viewQuery: viewQuery ?? null,
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

describe("materialiseModelViews", () => {
  let instance: DuckDBInstance;
  const projectId = "test-project";

  beforeEach(async () => {
    instance = await DuckDBInstance.create();
    const db = await instance.connect();
    try {
      await db.run("CREATE TABLE test_source (id INTEGER, name VARCHAR, amount DECIMAL(10,2))");
      await db.run("INSERT INTO test_source VALUES (1, 'Alice', 99.99), (2, 'Bob', 50.00)");
    } finally {
      db.disconnectSync();
    }
  });

  it("issues CREATE OR REPLACE VIEW for every dataset with view_query", async () => {
    const model = makeModel("shop", [
      makeDataset("orders", "test_source", [{ name: "id" }, { name: "name" }], "SELECT id, name FROM test_source"),
    ]);

    const result = await materialiseModelViews(instance, projectId, model);
    expect(result.materialised).toEqual(["orders"]);
    expect(result.missingViewQuery).toEqual([]);
    expect(result.failed).toEqual([]);

    const db = await instance.connect();
    try {
      const queryResult = await db.run('SELECT * FROM _scope_shop."orders"');
      const rows: unknown[][] = [];
      for await (const chunk of queryResult) rows.push(...chunk.getRows());
      expect(rows).toHaveLength(2);
    } finally {
      db.disconnectSync();
    }
  });

  it("supports view_query bodies that filter or compute columns beyond the source mirror", async () => {
    const model = makeModel("shop", [
      makeDataset(
        "high_value_orders",
        "test_source",
        [{ name: "id" }, { name: "total" }],
        "SELECT id, amount * 1.1 AS total FROM test_source WHERE amount >= 75",
      ),
    ]);

    await materialiseModelViews(instance, projectId, model);
    const db = await instance.connect();
    try {
      const queryResult = await db.run('SELECT * FROM _scope_shop."high_value_orders" ORDER BY id');
      const rows: unknown[][] = [];
      for await (const chunk of queryResult) rows.push(...chunk.getRows());
      expect(rows).toHaveLength(1);
      expect(rows[0][0]).toBe(1);
    } finally {
      db.disconnectSync();
    }
  });

  it("returns missingViewQuery for datasets without a view_query and skips them", async () => {
    const model = makeModel("shop", [
      makeDataset("orders", "test_source", [{ name: "id" }]),
      makeDataset("with_query", "test_source", [{ name: "id" }], "SELECT id FROM test_source"),
    ]);

    const result = await materialiseModelViews(instance, projectId, model);
    expect(result.missingViewQuery).toEqual(["orders"]);
    expect(result.materialised).toEqual(["with_query"]);

    const db = await instance.connect();
    try {
      await expect(db.run('SELECT * FROM _scope_shop."orders"')).rejects.toThrow();
    } finally {
      db.disconnectSync();
    }
  });

  it("rejects forbidden view_query bodies via the validator and warns", async () => {
    const model = makeModel("shop", [
      makeDataset("ok", "test_source", [{ name: "id" }], "SELECT id FROM test_source"),
      makeDataset("bad", "test_source", [{ name: "id" }], "DROP TABLE test_source"),
    ]);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await materialiseModelViews(instance, projectId, model);
    warnSpy.mockRestore();

    expect(result.materialised).toEqual(["ok"]);
    expect(result.failed.map((f) => f.dataset)).toEqual(["bad"]);
  });

  it("warns and skips a dataset whose view_query fails at CREATE OR REPLACE time but materialises the rest", async () => {
    const model = makeModel("shop", [
      makeDataset("ok", "test_source", [{ name: "id" }], "SELECT id FROM test_source"),
      makeDataset("broken", "test_source", [{ name: "id" }], "SELECT nonexistent_column FROM test_source"),
    ]);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await materialiseModelViews(instance, projectId, model);
    warnSpy.mockRestore();

    expect(result.materialised).toEqual(["ok"]);
    expect(result.failed.map((f) => f.dataset)).toEqual(["broken"]);
  });

  it("isolates models in separate schemas with the same dataset name", async () => {
    const modelA = makeModel("model_a", [
      makeDataset("ds", "test_source", [{ name: "id" }], "SELECT id FROM test_source"),
    ]);
    const modelB = makeModel("model_b", [
      makeDataset("ds", "test_source", [{ name: "name" }], "SELECT name FROM test_source"),
    ]);

    await materialiseModelViews(instance, projectId, modelA);
    await materialiseModelViews(instance, projectId, modelB);

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

  it("re-issues CREATE OR REPLACE on every call with no in-memory cache", async () => {
    const v1 = makeModel("shop", [
      makeDataset("orders", "test_source", [{ name: "id" }], "SELECT id FROM test_source"),
    ]);
    const v2 = makeModel("shop", [
      makeDataset("orders", "test_source", [{ name: "id" }, { name: "name" }], "SELECT id, name FROM test_source"),
    ]);

    await materialiseModelViews(instance, projectId, v1);
    await materialiseModelViews(instance, projectId, v2);

    const db = await instance.connect();
    try {
      const result = await db.run('SELECT * FROM _scope_shop."orders"');
      expect(result.columnNames()).toEqual(["id", "name"]);
    } finally {
      db.disconnectSync();
    }
  });
});

describe("stripScopedSchemaQualifier", () => {
  it("removes unquoted _scope_<modelName>. qualifiers", () => {
    const msg = `Catalog Error: Table with name "orders" does not exist! Did you mean "_scope_ecommerce.orders"?`;
    expect(stripScopedSchemaQualifier(msg, "ecommerce")).not.toContain("_scope_");
    expect(stripScopedSchemaQualifier(msg, "ecommerce")).toContain('"orders"');
  });

  it("removes quoted _scope_<modelName>. qualifiers", () => {
    const msg = `Catalog Error: Table with name "_scope_ecommerce"."orders" does not exist!`;
    expect(stripScopedSchemaQualifier(msg, "ecommerce")).not.toContain("_scope_");
  });

  it("does not modify other models' scope references", () => {
    const msg = "Some error mentioning _scope_finance.tables";
    expect(stripScopedSchemaQualifier(msg, "ecommerce")).toContain("_scope_finance");
  });

  it("is a no-op when no qualifier is present", () => {
    expect(stripScopedSchemaQualifier("plain error", "x")).toBe("plain error");
  });
});

describe("duckdbFilePath", () => {
  it("rejects unsafe project ids", () => {
    expect(() => duckdbFilePath("../etc")).toThrow(/Invalid projectId/);
    expect(() => duckdbFilePath("")).toThrow(/Invalid projectId/);
    expect(() => duckdbFilePath("a/b")).toThrow(/Invalid projectId/);
  });

  it("returns the duckdb.db path under the configured projectsDir", () => {
    const path = duckdbFilePath("proj1");
    expect(path.endsWith("/proj1/duckdb.db")).toBe(true);
  });
});

describe("deleteProjectDuckdbFile", () => {
  it("does not throw when the file does not exist", async () => {
    await expect(deleteProjectDuckdbFile("nonexistent-project")).resolves.toBeUndefined();
  });
});

describe("file-backed project instance", () => {
  it("creates the duckdb.db file on disk", async () => {
    const fs = await import("node:fs/promises");
    const projectId = "file-backed-test-create";
    await getProjectInstance(projectId, []);
    const path = duckdbFilePath(projectId);
    const stat = await fs.stat(path);
    expect(stat.isFile()).toBe(true);
    await disposeProjectInstance(projectId);
    await deleteProjectDuckdbFile(projectId);
  });

  it("releases the file lock on dispose so a fresh instance can re-open the same file", async () => {
    const projectId = "file-backed-test-lock";
    await getProjectInstance(projectId, []);
    await disposeProjectInstance(projectId);
    const fresh = await DuckDBInstance.create(duckdbFilePath(projectId));
    fresh.closeSync();
    await deleteProjectDuckdbFile(projectId);
  });

  it("persists materialised views across re-opens of the same duckdb.db file", async () => {
    const projectId = "file-backed-test-persist";
    const instance = await getProjectInstance(projectId, []);
    const setup = await instance.connect();
    try {
      await setup.run("CREATE TABLE raw (id INTEGER)");
      await setup.run("INSERT INTO raw VALUES (1), (2)");
    } finally {
      setup.disconnectSync();
    }
    const model = makeModel("persist", [
      makeDataset("orders", "raw", [{ name: "id" }], "SELECT id FROM raw"),
    ]);
    const result = await materialiseModelViews(instance, projectId, model);
    expect(result.materialised).toEqual(["orders"]);

    await disposeProjectInstance(projectId);
    const reopened = await getProjectInstance(projectId, []);
    const db = await reopened.connect();
    try {
      const out = await db.run('SELECT * FROM _scope_persist."orders"');
      const rows: unknown[][] = [];
      for await (const chunk of out) rows.push(...chunk.getRows());
      expect(rows).toHaveLength(2);
    } finally {
      db.disconnectSync();
    }
    await disposeProjectInstance(projectId);
    await deleteProjectDuckdbFile(projectId);
  });

  it("deleteProjectDuckdbFile removes the file (clean slate)", async () => {
    const fs = await import("node:fs/promises");
    const projectId = "file-backed-test-delete";
    await getProjectInstance(projectId, []);
    await disposeProjectInstance(projectId);
    const path = duckdbFilePath(projectId);
    await deleteProjectDuckdbFile(projectId);
    await expect(fs.stat(path)).rejects.toMatchObject({ code: "ENOENT" });
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

describe("getQueryTimeoutMs", () => {
  const origEnv = process.env.QUERY_TIMEOUT_MS;
  afterEach(() => {
    if (origEnv === undefined) delete process.env.QUERY_TIMEOUT_MS;
    else process.env.QUERY_TIMEOUT_MS = origEnv;
  });

  it("returns default 30_000 when env is unset", () => {
    delete process.env.QUERY_TIMEOUT_MS;
    expect(getQueryTimeoutMs()).toBe(30_000);
  });

  it("parses numeric env value", () => {
    process.env.QUERY_TIMEOUT_MS = "5000";
    expect(getQueryTimeoutMs()).toBe(5000);
  });

  it("falls back to default for non-positive values", () => {
    process.env.QUERY_TIMEOUT_MS = "0";
    expect(getQueryTimeoutMs()).toBe(30_000);
    process.env.QUERY_TIMEOUT_MS = "-1";
    expect(getQueryTimeoutMs()).toBe(30_000);
  });

  it("falls back to default for non-numeric strings", () => {
    process.env.QUERY_TIMEOUT_MS = "not_a_number";
    expect(getQueryTimeoutMs()).toBe(30_000);
  });
});

describe("withQueryTimeout", () => {
  it("returns the result when the operation completes in time", async () => {
    const instance = await DuckDBInstance.create();
    const db = await instance.connect();
    try {
      const result = await withQueryTimeout(db, () => db.run("SELECT 42 AS val"), 5_000);
      expect(result.columnNames()).toEqual(["val"]);
    } finally {
      db.disconnectSync();
    }
  });

  it("rejects with timeout error when operation exceeds deadline", async () => {
    const instance = await DuckDBInstance.create();
    const db = await instance.connect();
    try {
      await expect(
        withQueryTimeout(db, () => new Promise(() => {}), 50),
      ).rejects.toThrow(/timed out after 0\.05s/i);
    } finally {
      db.disconnectSync();
    }
  });

  it("calls interrupt() on the connection when timeout fires", async () => {
    const instance = await DuckDBInstance.create();
    const db = await instance.connect();
    const interruptSpy = vi.spyOn(db, "interrupt");
    try {
      await withQueryTimeout(db, () => new Promise(() => {}), 50).catch(() => {});
      expect(interruptSpy).toHaveBeenCalledTimes(1);
    } finally {
      interruptSpy.mockRestore();
      db.disconnectSync();
    }
  });

  it("clears the timer when operation succeeds before deadline", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const instance = await DuckDBInstance.create();
    const db = await instance.connect();
    try {
      await withQueryTimeout(db, () => db.run("SELECT 1"), 5_000);
      expect(clearSpy).toHaveBeenCalled();
    } finally {
      clearSpy.mockRestore();
      db.disconnectSync();
    }
  });

  it("clears the timer when operation rejects before deadline", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    const instance = await DuckDBInstance.create();
    const db = await instance.connect();
    try {
      await expect(
        withQueryTimeout(db, () => Promise.reject(new Error("query error")), 5_000),
      ).rejects.toThrow("query error");
      expect(clearSpy).toHaveBeenCalled();
    } finally {
      clearSpy.mockRestore();
      db.disconnectSync();
    }
  });

  it("uses custom timeout duration", async () => {
    const instance = await DuckDBInstance.create();
    const db = await instance.connect();
    try {
      await expect(
        withQueryTimeout(db, () => new Promise(() => {}), 25),
      ).rejects.toThrow(/timed out after 0\.025s/);
    } finally {
      db.disconnectSync();
    }
  });
});

describe("withProjectQuerySlot", () => {
  it("runs the operation and returns its result", async () => {
    const result = await withProjectQuerySlot("slot-test-basic", async () => "ok");
    expect(result).toBe("ok");
  });

  it("propagates errors from the operation", async () => {
    await expect(
      withProjectQuerySlot("slot-test-error", async () => { throw new Error("boom"); }),
    ).rejects.toThrow("boom");
  });

  it("releases the slot after success so subsequent calls work", async () => {
    const pid = "slot-test-release";
    for (let i = 0; i < 15; i++) {
      await withProjectQuerySlot(pid, async () => i);
    }
  });

  it("releases the slot after failure so subsequent calls work", async () => {
    const pid = "slot-test-release-err";
    await withProjectQuerySlot(pid, async () => "ok");
    await expect(
      withProjectQuerySlot(pid, async () => { throw new Error("fail"); }),
    ).rejects.toThrow("fail");
    const result = await withProjectQuerySlot(pid, async () => "recovered");
    expect(result).toBe("recovered");
  });

  it("limits concurrency to the configured maximum", async () => {
    const pid = "slot-test-concurrency";
    let concurrent = 0;
    let maxConcurrent = 0;

    const delay = () => new Promise<void>((r) => setTimeout(r, 50));

    const tasks = Array.from({ length: 15 }, () =>
      withProjectQuerySlot(pid, async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await delay();
        concurrent--;
      }),
    );

    await Promise.all(tasks);
    expect(maxConcurrent).toBe(10);
    expect(concurrent).toBe(0);
  });

  it("rejects with a clear message when queue wait exceeds timeout", async () => {
    const pid = "slot-test-queue-timeout";
    const origEnv = process.env.QUERY_TIMEOUT_MS;
    process.env.QUERY_TIMEOUT_MS = "100";

    const blockers: Array<() => void> = [];
    const blockingTasks = Array.from({ length: 10 }, () =>
      withProjectQuerySlot(pid, () => new Promise<void>((r) => blockers.push(r))),
    );

    await vi.waitFor(() => expect(blockers.length).toBe(10), { timeout: 1000 });

    await expect(
      withProjectQuerySlot(pid, async () => "should not run"),
    ).rejects.toThrow(/queries already running/);

    blockers.forEach((r) => r());
    await Promise.all(blockingTasks);

    if (origEnv === undefined) delete process.env.QUERY_TIMEOUT_MS;
    else process.env.QUERY_TIMEOUT_MS = origEnv;
  });

  it("uses independent semaphores per project", async () => {
    let concurrentA = 0;
    let concurrentB = 0;
    const resolversA: Array<() => void> = [];
    const resolversB: Array<() => void> = [];

    const tasksA = Array.from({ length: 10 }, () =>
      withProjectQuerySlot("slot-iso-a", async () => {
        concurrentA++;
        await new Promise<void>((r) => resolversA.push(r));
        concurrentA--;
      }),
    );
    const tasksB = Array.from({ length: 10 }, () =>
      withProjectQuerySlot("slot-iso-b", async () => {
        concurrentB++;
        await new Promise<void>((r) => resolversB.push(r));
        concurrentB--;
      }),
    );

    await vi.waitFor(() => {
      expect(resolversA.length).toBe(10);
      expect(resolversB.length).toBe(10);
    }, { timeout: 1000 });

    expect(concurrentA).toBe(10);
    expect(concurrentB).toBe(10);

    resolversA.forEach((r) => r());
    resolversB.forEach((r) => r());
    await Promise.all([...tasksA, ...tasksB]);
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

describe("disposeProjectInstance", () => {
  it("returns a fresh instance on the next getProjectInstance call", async () => {
    const projectId = "dispose-test-project";
    const first = await getProjectInstance(projectId, []);
    await disposeProjectInstance(projectId);
    const second = await getProjectInstance(projectId, []);
    expect(second).not.toBe(first);
    await disposeProjectInstance(projectId);
  });

  it("is a no-op when no instance is cached", async () => {
    await expect(disposeProjectInstance("dispose-test-missing")).resolves.toBeUndefined();
  });

  it("closes the underlying DuckDB instance", async () => {
    const projectId = "dispose-test-close";
    const instance = await getProjectInstance(projectId, []);
    const closeSpy = vi.spyOn(instance, "closeSync");
    try {
      await disposeProjectInstance(projectId);
      expect(closeSpy).toHaveBeenCalledTimes(1);
    } finally {
      closeSpy.mockRestore();
    }
  });
});
