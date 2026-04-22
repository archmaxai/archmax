import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DuckDBInstance } from "@duckdb/node-api";

vi.mock("../config/env", () => ({
  getEnv: vi.fn(() => ({ ENCRYPTION_KEY: "" })),
}));

import { createScopedViews, hardenConnection, scopedViewName, scopeSchemaName, computeModelHash, invalidateScopedViews, buildAttachString, buildColumnSelect, COMMUNITY_EXTENSIONS, getQueryTimeoutMs, withQueryTimeout, withProjectQuerySlot, getProjectInstance, disposeProjectInstance } from "./duckdb";
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

  it("aliases renamed fields so they are queryable by logical name", async () => {
    const db = await instance.connect();
    try {
      await db.run("CREATE TABLE staff (personnelnumber VARCHAR, personid VARCHAR, firstname VARCHAR)");
      await db.run("INSERT INTO staff VALUES ('E001', 'P100', 'Alice')");
    } finally {
      db.disconnectSync();
    }

    const model = makeModel("hr", [
      makeDataset("stammdaten", "staff", [
        { name: "personnelnumber" },
        { name: "person_id", expression: "personid" },
        { name: "first_name", expression: "firstname" },
      ]),
    ]);

    await createScopedViews(instance, projectId, model);

    const conn = await instance.connect();
    try {
      const result = await conn.run('SELECT person_id, first_name FROM _scope_hr."stammdaten"');
      const columns = result.columnNames();
      expect(columns).toEqual(["person_id", "first_name"]);

      const rows: unknown[][] = [];
      for await (const chunk of result) {
        rows.push(...chunk.getRows());
      }
      expect(rows[0][0]).toBe("P100");
      expect(rows[0][1]).toBe("Alice");
    } finally {
      conn.disconnectSync();
    }
  });

  it("exposes aliased fields via search_path", async () => {
    const db = await instance.connect();
    try {
      await db.run("CREATE TABLE staff2 (personid VARCHAR, name VARCHAR)");
      await db.run("INSERT INTO staff2 VALUES ('P1', 'Bob')");
    } finally {
      db.disconnectSync();
    }

    const model = makeModel("mymodel", [
      makeDataset("employees", "staff2", [
        { name: "person_id", expression: "personid" },
        { name: "employee_name", expression: "name" },
      ]),
    ]);

    await createScopedViews(instance, projectId, model);

    const conn = await instance.connect();
    try {
      await conn.run("SET search_path = '_scope_mymodel'");
      const result = await conn.run('SELECT person_id, employee_name FROM "employees"');
      const columns = result.columnNames();
      expect(columns).toEqual(["person_id", "employee_name"]);

      const rows: unknown[][] = [];
      for await (const chunk of result) {
        rows.push(...chunk.getRows());
      }
      expect(rows[0][0]).toBe("P1");
      expect(rows[0][1]).toBe("Bob");
    } finally {
      conn.disconnectSync();
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

describe("buildColumnSelect", () => {
  it("quotes passthrough columns", () => {
    expect(buildColumnSelect("id", "id")).toBe('"id"');
  });

  it("quotes simple identifier expressions with alias", () => {
    expect(buildColumnSelect("personid", "person_id")).toBe('"personid" AS "person_id"');
  });

  it("leaves computed expressions unquoted", () => {
    expect(buildColumnSelect("amount * 1.1", "total")).toBe('amount * 1.1 AS "total"');
  });

  it("leaves expressions with function calls unquoted", () => {
    expect(buildColumnSelect("UPPER(name)", "upper_name")).toBe('UPPER(name) AS "upper_name"');
  });

  it("leaves concatenation expressions unquoted", () => {
    expect(buildColumnSelect("a || ' ' || b", "full_name")).toBe('a || \' \' || b AS "full_name"');
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

  it("returns different hash when expression differs from name", () => {
    const a = makeModel("shop", [
      makeDataset("orders", "test_source", [{ name: "person_id" }]),
    ]);
    const b = makeModel("shop", [
      makeDataset("orders", "test_source", [{ name: "person_id", expression: "personid" }]),
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
