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
  isTransientDuckdbError,
  isFatalInstanceError,
  retryOnTransientDuckdbError,
  withRecoverableProjectInstance,
  withProjectMaterialiseLock,
  stripScopedSchemaQualifier,
  redactConnectionSecrets,
  duckdbFilePath,
  deleteProjectDuckdbFile,
  inferDefaultViewQuery,
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

describe("inferDefaultViewQuery", () => {
  // The helper that synthesises a "mirror" view body for datasets that
  // didn't author a `view_query`. Column-quoting rules mirror the
  // migration script's `buildLegacyViewQuery` so behaviour is the same
  // as a one-shot backfill would produce.

  function ds(opts: {
    source?: string;
    fields?: Array<{ name: string; expression?: string }>;
  }) {
    return {
      name: "x",
      source: opts.source ?? "shop.public.orders",
      primary_key: [] as string[],
      unique_keys: [] as string[][],
      description: "",
      fields: (opts.fields ?? []).map((f) => ({
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

  it("returns null when fields are missing", () => {
    expect(inferDefaultViewQuery(ds({ fields: [] }))).toBeNull();
  });

  it("returns null when source is missing or blank", () => {
    expect(inferDefaultViewQuery(ds({ source: "", fields: [{ name: "id" }] }))).toBeNull();
    expect(inferDefaultViewQuery(ds({ source: "   ", fields: [{ name: "id" }] }))).toBeNull();
  });

  it("emits a SELECT with one quoted column per field, projecting from the source", () => {
    const body = inferDefaultViewQuery(
      ds({ source: "shop.public.orders", fields: [{ name: "id" }, { name: "total_amount" }] }),
    );
    expect(body).toBe(`SELECT\n  "id",\n  "total_amount"\nFROM shop.public.orders`);
  });

  it("aliases when the field expression is a different simple identifier", () => {
    const body = inferDefaultViewQuery(
      ds({
        source: "shop.public.orders",
        fields: [{ name: "person_id", expression: "personid" }],
      }),
    );
    expect(body).toContain('"personid" AS "person_id"');
  });

  it("preserves a non-identifier expression verbatim with AS aliasing", () => {
    const body = inferDefaultViewQuery(
      ds({
        source: "shop.public.people",
        fields: [{ name: "full_name", expression: "first_name || ' ' || last_name" }],
      }),
    );
    expect(body).toContain(`first_name || ' ' || last_name AS "full_name"`);
  });

  it("doubles embedded double-quotes in a field name so it cannot break out of the projection", () => {
    // `fieldSchema` only requires `name: z.string().min(1)`, so a
    // pathological authored field name like `a", bar AS "baz` could
    // turn the inferred body into a structurally-valid SELECT that
    // projects an extra column the dataset never declared. The
    // standard SQL escape — doubling `"` to `""` inside a quoted
    // identifier — neutralises that.
    const body = inferDefaultViewQuery(
      ds({ source: "shop.public.orders", fields: [{ name: `a", bar AS "baz` }] }),
    );
    expect(body).toContain(`"a"", bar AS ""baz"`);
    // The original break-out string must NOT survive verbatim into the
    // emitted SQL — if it did, the validator would see two columns.
    expect(body).not.toContain(`"a", bar AS "baz"`);
  });

  it("doubles embedded double-quotes when aliasing a different simple-identifier expression", () => {
    const body = inferDefaultViewQuery(
      ds({
        source: "shop.public.orders",
        fields: [{ name: `weird"name`, expression: "personid" }],
      }),
    );
    expect(body).toContain(`"personid" AS "weird""name"`);
  });
});

describe("scopedViewName", () => {
  it('produces _scope_<modelName>."dataset" format', () => {
    expect(scopedViewName("ecommerce", "orders")).toBe('_scope_ecommerce."orders"');
  });

  it("handles dataset names with hyphens", () => {
    expect(scopedViewName("shop", "my-dataset")).toBe('_scope_shop."my-dataset"');
  });

  it("doubles embedded double-quotes so a dataset name cannot break out of the identifier", () => {
    // Standard SQL escape: a `"` inside a `"..."`-quoted identifier is
    // doubled to `""`. Without this, an authored dataset name like
    // `weird"; DROP SCHEMA _scope_x CASCADE; --` would break out of
    // the wrapper `CREATE OR REPLACE VIEW ...` despite the SQL body
    // validator clearing the view_query body itself.
    expect(scopedViewName("shop", `weird"name`)).toBe(`_scope_shop."weird""name"`);
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

  it("infers a default mirror view when view_query is missing but source + fields are populated", async () => {
    const model = makeModel("shop", [
      makeDataset("orders", "test_source", [{ name: "id" }, { name: "name" }]),
      makeDataset("with_query", "test_source", [{ name: "id" }], "SELECT id FROM test_source"),
    ]);

    const result = await materialiseModelViews(instance, projectId, model);
    // Both datasets are materialised — `orders` via inference, `with_query`
    // via its authored body. `inferred` is the strict subset that used the
    // platform-synthesised default.
    expect(new Set(result.materialised)).toEqual(new Set(["orders", "with_query"]));
    expect(result.inferred).toEqual(["orders"]);
    expect(result.missingViewQuery).toEqual([]);
    expect(result.failed).toEqual([]);

    const db = await instance.connect();
    try {
      const queryResult = await db.run('SELECT * FROM _scope_shop."orders" ORDER BY id');
      const rows: unknown[][] = [];
      for await (const chunk of queryResult) rows.push(...chunk.getRows());
      // The inferred view projects every declared field straight from the
      // source — so we expect both seeded rows and exactly the columns
      // declared on the dataset, in declared order.
      expect(rows).toHaveLength(2);
      expect(queryResult.columnNames()).toEqual(["id", "name"]);
    } finally {
      db.disconnectSync();
    }
  });

  it("authored view_query wins over inference when both are possible", async () => {
    // Dataset has fields/source (so inference WOULD work) AND an authored
    // view_query that filters rows. The authored body must take precedence;
    // inferred[] must NOT include this dataset.
    const model = makeModel("shop", [
      makeDataset(
        "filtered",
        "test_source",
        [{ name: "id" }, { name: "name" }],
        "SELECT id, name FROM test_source WHERE id = 1",
      ),
    ]);

    const result = await materialiseModelViews(instance, projectId, model);
    expect(result.materialised).toEqual(["filtered"]);
    expect(result.inferred).toEqual([]);

    const db = await instance.connect();
    try {
      const queryResult = await db.run('SELECT * FROM _scope_shop."filtered"');
      const rows: unknown[][] = [];
      for await (const chunk of queryResult) rows.push(...chunk.getRows());
      expect(rows).toHaveLength(1);
    } finally {
      db.disconnectSync();
    }
  });

  it("returns missingViewQuery only when the dataset has neither view_query nor enough info to infer", async () => {
    // No `fields` array → cannot infer a mirror view (we refuse to
    // synthesise a degenerate `SELECT *` because that would expose
    // physical columns the agent never declared).
    const model = makeModel("shop", [
      makeDataset("no_fields_no_query", "test_source", []),
      makeDataset("with_query", "test_source", [{ name: "id" }], "SELECT id FROM test_source"),
    ]);

    const result = await materialiseModelViews(instance, projectId, model);
    expect(result.missingViewQuery).toEqual(["no_fields_no_query"]);
    expect(result.materialised).toEqual(["with_query"]);
    expect(result.inferred).toEqual([]);

    const db = await instance.connect();
    try {
      await expect(db.run('SELECT * FROM _scope_shop."no_fields_no_query"')).rejects.toThrow();
    } finally {
      db.disconnectSync();
    }
  });

  it("inferred view bodies pass through the same SQL validator as authored bodies", async () => {
    // A dataset whose `source` is a forbidden `_scope_*` schema would
    // produce an inferred body of the form `... FROM _scope_X.t`. The
    // agent-mode AST validator denies the universal `_scope_*` prefix,
    // so the inferred body MUST be rejected — never created blindly.
    const model = makeModel("shop", [
      makeDataset("leaky", "_scope_other.t", [{ name: "id" }]),
    ]);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await materialiseModelViews(instance, projectId, model);
    warnSpy.mockRestore();

    expect(result.materialised).toEqual([]);
    expect(result.inferred).toEqual([]);
    expect(result.failed.map((f) => f.dataset)).toEqual(["leaky"]);
    expect(result.failed[0].error).toMatch(/_scope_/);
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

  it("fails closed when model.name is not a valid SQL identifier", async () => {
    // `_scope_<modelName>` is interpolated UNQUOTED into CREATE SCHEMA
    // and `SET search_path = '...'`, so a model name with a quote, dot,
    // or semicolon could break out of the wrapper DDL. The schema-level
    // YAML validation only requires `name: z.string().min(1)`, which is
    // too permissive — gate it again at materialisation time.
    const model = makeModel("evil; DROP SCHEMA _scope_other CASCADE; --", [
      makeDataset("orders", "test_source", [{ name: "id" }], "SELECT id FROM test_source"),
    ]);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await materialiseModelViews(instance, projectId, model);
    warnSpy.mockRestore();

    expect(result.materialised).toEqual([]);
    expect(result.failed.map((f) => f.dataset)).toEqual(["orders"]);
    expect(result.failed[0].error).toMatch(/valid SQL identifier/);
  });

  it("rejects a dataset name containing a control character", async () => {
    const model = makeModel("shop", [
      makeDataset("orders\u0000evil", "test_source", [{ name: "id" }], "SELECT id FROM test_source"),
    ]);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await materialiseModelViews(instance, projectId, model);
    warnSpy.mockRestore();

    expect(result.materialised).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error).toMatch(/control character/);
  });

  it("rejects a field name containing a control character", async () => {
    // `quoteIdentifier` neutralises embedded `"` but a NUL or newline
    // in a field name would still let the inferred-mirror projection
    // span multiple SQL lines, so the materialiser refuses to embed
    // such a name. Without this gate, a field name like
    // `id\nUNION ALL SELECT * FROM secret_table` could survive AST
    // validation as a structurally valid two-statement(-ish) body.
    const model = makeModel("shop", [
      makeDataset("orders", "test_source", [{ name: "id\nUNION ALL SELECT 1" }]),
    ]);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await materialiseModelViews(instance, projectId, model);
    warnSpy.mockRestore();

    expect(result.materialised).toEqual([]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error).toMatch(/control character/);
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

describe("isTransientDuckdbError", () => {
  it("classifies cold-connection / upstream faults as transient", () => {
    for (const msg of [
      "Failed to connect to Postgres database",
      "Connection Error: connection refused",
      "IO Error: connection reset by peer",
      "could not connect to server: Connection refused",
      "server closed the connection unexpectedly",
      "terminating connection due to administrator command",
      "Connection timed out",
      "FATAL: sorry, too many clients already",
      // Concurrency abort: succeeds on re-run once the competing txn commits.
      `TransactionContext Error: Catalog write-write conflict on alter with "Schema\0_scope_hr\0View\0_scope_hr\0leave_accounts"`,
    ]) {
      expect(isTransientDuckdbError(msg)).toBe(true);
    }
  });

  it("matches contextualised network / EOF faults but not bare identifier substrings", () => {
    expect(isTransientDuckdbError("Network is unreachable")).toBe(true);
    expect(isTransientDuckdbError("network error while reading from server")).toBe(true);
    expect(isTransientDuckdbError("unexpected EOF on client connection")).toBe(true);

    // Permanent binder/catalog errors that merely *contain* "network" or
    // "eof" inside an identifier must not be misclassified as transient.
    expect(
      isTransientDuckdbError(`Binder Error: Referenced column "network_bytes" not found`),
    ).toBe(false);
    expect(isTransientDuckdbError(`Binder Error: Referenced column "eof" not found`)).toBe(false);
  });

  it("does NOT classify permanent authoring errors or the query-timeout sentinel as transient", () => {
    for (const msg of [
      "Query timed out after 30s",
      `Binder Error: Referenced column "missing" not found`,
      `Catalog Error: Table with name "orders" does not exist`,
      "Parser Error: syntax error at or near SELECT",
    ]) {
      expect(isTransientDuckdbError(msg)).toBe(false);
    }
  });
});

describe("retryOnTransientDuckdbError", () => {
  it("retries a transient failure and succeeds", async () => {
    let calls = 0;
    const res = await retryOnTransientDuckdbError(
      async () => {
        calls++;
        if (calls < 2) throw new Error("Connection Error: connection reset by peer");
      },
      { baseDelayMs: 0 },
    );
    expect(res).toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it("does NOT retry a permanent (binder) error and fails fast", async () => {
    let calls = 0;
    const res = await retryOnTransientDuckdbError(
      async () => {
        calls++;
        throw new Error(`Binder Error: Referenced column "missing" not found`);
      },
      { baseDelayMs: 0 },
    );
    expect(res.ok).toBe(false);
    expect(calls).toBe(1);
    if (!res.ok) expect(res.error).toMatch(/Binder Error/);
  });

  it("gives up after maxAttempts on a persistent transient fault", async () => {
    let calls = 0;
    const res = await retryOnTransientDuckdbError(
      async () => {
        calls++;
        throw new Error("Failed to connect to Postgres database");
      },
      { maxAttempts: 3, baseDelayMs: 0 },
    );
    expect(res.ok).toBe(false);
    expect(calls).toBe(3);
  });

  it("stops retrying once the wall-clock deadline has passed", async () => {
    let calls = 0;
    const res = await retryOnTransientDuckdbError(
      async () => {
        calls++;
        // Burn past the deadline during the first attempt so the second
        // attempt is never started.
        await new Promise((r) => setTimeout(r, 20));
        throw new Error("Connection Error: connection reset by peer");
      },
      { maxAttempts: 5, baseDelayMs: 0, deadlineMs: Date.now() + 10 },
    );
    expect(res.ok).toBe(false);
    expect(calls).toBe(1);
  });
});

describe("withProjectMaterialiseLock", () => {
  it("serialises concurrent operations for the same project (no overlap)", async () => {
    let active = 0;
    let maxActive = 0;
    const order: number[] = [];

    const make = (id: number) => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      order.push(id);
      active--;
      return id;
    };

    const results = await Promise.all([
      withProjectMaterialiseLock("proj-a", make(1)),
      withProjectMaterialiseLock("proj-a", make(2)),
      withProjectMaterialiseLock("proj-a", make(3)),
    ]);

    // Never more than one running at a time, and FIFO order preserved.
    expect(maxActive).toBe(1);
    expect(order).toEqual([1, 2, 3]);
    expect(results).toEqual([1, 2, 3]);
  });

  it("runs different projects concurrently", async () => {
    let active = 0;
    let maxActive = 0;

    const make = () => async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
    };

    await Promise.all([
      withProjectMaterialiseLock("proj-x", make()),
      withProjectMaterialiseLock("proj-y", make()),
    ]);

    expect(maxActive).toBe(2);
  });

  it("does not let a rejected operation wedge the queue", async () => {
    const failing = withProjectMaterialiseLock("proj-fail", async () => {
      throw new Error("boom");
    });
    await expect(failing).rejects.toThrow("boom");

    // A subsequent op on the same project still runs.
    const after = await withProjectMaterialiseLock("proj-fail", async () => "ok");
    expect(after).toBe("ok");
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

describe("redactConnectionSecrets", () => {
  it("redacts a postgres/mysql key=value password (space-delimited)", () => {
    const out = redactConnectionSecrets(
      'IO Error: failed to attach "host=pg.local port=5432 dbname=app user=admin password=s3cret"',
    );
    expect(out).not.toContain("s3cret");
    expect(out).toContain("password=***");
    // Surrounding, non-secret context is preserved so the error stays useful.
    expect(out).toContain("host=pg.local");
    expect(out).toContain("user=admin");
  });

  it("redacts an MSSQL Password=...; field (semicolon-delimited)", () => {
    const out = redactConnectionSecrets(
      "Server=db,1433;Database=mydb;User Id=sa;Password=p@ss;Encrypt=yes failed",
    );
    expect(out).not.toContain("p@ss");
    expect(out).toContain("Password=***");
    // The value stops at the `;` — later fields survive intact.
    expect(out).toContain("Encrypt=yes");
  });

  it("redacts the password in a connection URI while keeping the user and host", () => {
    const out = redactConnectionSecrets(
      "could not connect to postgresql://admin:topsecret@db.example.com:5432/app",
    );
    expect(out).not.toContain("topsecret");
    expect(out).toContain("postgresql://admin:***@db.example.com");
  });

  it("redacts an iceberg bearer TOKEN '...'", () => {
    const out = redactConnectionSecrets(
      "Failed: CREATE TEMPORARY SECRET cat_secret (TYPE iceberg, TOKEN 'abc123.def') at line 1",
    );
    expect(out).not.toContain("abc123.def");
    expect(out).toContain("TOKEN '***'");
  });

  it("leaves a secret-free message untouched", () => {
    const msg = `Catalog Error: Table with name "orders" does not exist`;
    expect(redactConnectionSecrets(msg)).toBe(msg);
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

describe("in-memory project instance", () => {
  it("does NOT create a duckdb.db file on disk", async () => {
    const fs = await import("node:fs/promises");
    const projectId = "in-memory-test-no-file";
    await getProjectInstance(projectId, []);
    // The instance is in-memory and per-process, so no persistent file is
    // ever written — this is what keeps the api and worker processes from
    // deadlocking on DuckDB's whole-file lock.
    await expect(fs.stat(duckdbFilePath(projectId))).rejects.toMatchObject({ code: "ENOENT" });
    await disposeProjectInstance(projectId);
  });

  it("rebuilds a clean, empty instance after dispose (no cross-dispose persistence)", async () => {
    const projectId = "in-memory-test-clean-slate";
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

    // The next instance is a brand-new in-memory database: the table and the
    // scoped VIEW from the disposed instance are gone (callers rematerialise
    // views on demand before querying).
    const reopened = await getProjectInstance(projectId, []);
    expect(reopened).not.toBe(instance);
    const db = await reopened.connect();
    try {
      await expect(db.run('SELECT * FROM _scope_persist."orders"')).rejects.toThrow();
    } finally {
      db.disconnectSync();
    }
    await disposeProjectInstance(projectId);
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

describe("isFatalInstanceError", () => {
  it("classifies an invalidated-instance fault as fatal via the invalidation/restart phrase", () => {
    for (const msg of [
      // The exact shape DuckDB raises when a federated scanner's upstream
      // connection pool dies — the invalidation + restart phrases ride along
      // with the pool phrase here.
      `FATAL Error: Failed: database has been invalidated because of a previous fatal error. The database must be restarted prior to being used again.\nOriginal error: "PooledConnection::GetConnection - no connection available"`,
      "database has been invalidated because of a previous fatal error",
      "The database must be restarted prior to being used again.",
    ]) {
      expect(isFatalInstanceError(msg)).toBe(true);
    }
  });

  it("does NOT classify a bare pool phrase as fatal (avoids project-wide dispose on non-fatal faults)", () => {
    // `PooledConnection::GetConnection` / `no connection available` also show
    // up in ordinary, recoverable upstream/query errors. On their own they
    // must NOT force a dispose + full re-ATTACH of the whole project instance.
    for (const msg of [
      "PooledConnection::GetConnection - no connection available",
      "no connection available",
    ]) {
      expect(isFatalInstanceError(msg)).toBe(false);
    }
  });

  it("does NOT classify per-query / transient faults or permanent authoring errors as fatal", () => {
    for (const msg of [
      "Connection Error: connection refused",
      "Failed to connect to Postgres database",
      "Query timed out after 30s",
      `Binder Error: Referenced column "missing" not found`,
      `Catalog Error: Table with name "orders" does not exist`,
    ]) {
      expect(isFatalInstanceError(msg)).toBe(false);
    }
  });
});

describe("withRecoverableProjectInstance", () => {
  const FATAL =
    'FATAL Error: database has been invalidated. Original error: "PooledConnection::GetConnection - no connection available"';

  it("returns the op result without rebuilding when the first attempt succeeds", async () => {
    const projectId = "recover-test-ok";
    const first = await getProjectInstance(projectId, []);
    let calls = 0;
    const seen: unknown[] = [];

    const result = await withRecoverableProjectInstance(projectId, [], undefined, async (instance) => {
      calls++;
      seen.push(instance);
      return "ok";
    });

    expect(result).toBe("ok");
    expect(calls).toBe(1);
    // No rebuild: the cached instance is reused, never disposed.
    expect(seen[0]).toBe(first);
    await disposeProjectInstance(projectId);
  });

  it("disposes the poisoned instance and retries once with a fresh one on a fatal error", async () => {
    const projectId = "recover-test-heal";
    const poisoned = await getProjectInstance(projectId, []);
    const closeSpy = vi.spyOn(poisoned, "closeSync");
    const seen: unknown[] = [];

    try {
      const result = await withRecoverableProjectInstance(projectId, [], undefined, async (instance) => {
        seen.push(instance);
        if (seen.length === 1) throw new Error(FATAL);
        return "healed";
      });

      expect(result).toBe("healed");
      expect(seen).toHaveLength(2);
      // First attempt got the poisoned instance; the rebuild handed the op a
      // brand-new instance reference.
      expect(seen[0]).toBe(poisoned);
      expect(seen[1]).not.toBe(poisoned);
      expect(closeSpy).toHaveBeenCalledTimes(1);
    } finally {
      closeSpy.mockRestore();
      await disposeProjectInstance(projectId);
    }
  });

  it("on a fatal error closes the poisoned instance, not a concurrently-installed healthy one", async () => {
    // While our op holds a ref on the poisoned instance, the cache can be
    // evicted and a fresh healthy instance installed under the same projectId
    // (concurrent dispose + rebuild / extension reload). The heal must tear
    // down the *specific* instance the op ran against — disposing by id alone
    // would wrongly close the healthy replacement.
    const projectId = "recover-test-wrong-instance";
    const poisoned = await getProjectInstance(projectId, []);
    const poisonedClose = vi.spyOn(poisoned, "closeSync");
    const seen: unknown[] = [];
    let healthy: unknown;
    let healthyClose: ReturnType<typeof vi.spyOn> | undefined;

    try {
      const result = await withRecoverableProjectInstance(
        projectId,
        [],
        undefined,
        async (instance) => {
          seen.push(instance);
          if (seen.length === 1) {
            // Simulate a concurrent eviction + rebuild: the cache no longer
            // points at `poisoned` (it is closePending behind our ref) and now
            // holds a brand-new healthy instance.
            await disposeProjectInstance(projectId);
            healthy = await getProjectInstance(projectId, []);
            healthyClose = vi.spyOn(healthy as DuckDBInstance, "closeSync");
            throw new Error(FATAL);
          }
          return "healed";
        },
      );

      expect(result).toBe("healed");
      // First op ran against the poisoned instance, the retry against the
      // healthy replacement (never a third, freshly-built one).
      expect(seen[0]).toBe(poisoned);
      expect(seen[1]).toBe(healthy);
      // The poisoned instance is closed; the healthy replacement is untouched.
      expect(poisonedClose).toHaveBeenCalledTimes(1);
      expect(healthyClose!).not.toHaveBeenCalled();
    } finally {
      poisonedClose.mockRestore();
      healthyClose?.mockRestore();
      await disposeProjectInstance(projectId);
    }
  });

  it("re-throws a non-fatal error immediately without rebuilding", async () => {
    const projectId = "recover-test-nonfatal";
    await getProjectInstance(projectId, []);
    let calls = 0;

    await expect(
      withRecoverableProjectInstance(projectId, [], undefined, async () => {
        calls++;
        throw new Error("Connection Error: connection refused");
      }),
    ).rejects.toThrow(/connection refused/);
    expect(calls).toBe(1);
    await disposeProjectInstance(projectId);
  });

  it("gives up after a single rebuild when the fatal error persists", async () => {
    const projectId = "recover-test-persistent";
    await getProjectInstance(projectId, []);
    let calls = 0;

    await expect(
      withRecoverableProjectInstance(projectId, [], undefined, async () => {
        calls++;
        throw new Error(FATAL);
      }),
    ).rejects.toThrow(/invalidated/);
    // One original attempt + one post-rebuild attempt, then propagate.
    expect(calls).toBe(2);
    await disposeProjectInstance(projectId);
  });

  it("defers closeSync while an op holds the instance, then closes once it releases", async () => {
    // A concurrent self-heal (or operator-triggered dispose) must NOT
    // closeSync() the native instance out from under an in-flight query.
    const projectId = "recover-test-refcount";
    const instance = await getProjectInstance(projectId, []);
    const closeSpy = vi.spyOn(instance, "closeSync");

    let releaseOp!: () => void;
    const opGate = new Promise<void>((r) => { releaseOp = r; });
    let opStarted!: () => void;
    const started = new Promise<void>((r) => { opStarted = r; });

    const running = withRecoverableProjectInstance(projectId, [], undefined, async () => {
      opStarted();
      await opGate;
      return "done";
    });

    // Wait until the op is actually running (and thus holds a ref).
    await started;

    // Dispose mid-flight: it should evict the cache entry but defer the close.
    await disposeProjectInstance(projectId);
    expect(closeSpy).not.toHaveBeenCalled();
    // A fresh getProjectInstance already hands out a brand-new instance.
    const rebuilt = await getProjectInstance(projectId, []);
    expect(rebuilt).not.toBe(instance);

    // Let the in-flight op finish — the deferred close now fires exactly once.
    releaseOp();
    await expect(running).resolves.toBe("done");
    expect(closeSpy).toHaveBeenCalledTimes(1);

    closeSpy.mockRestore();
    await disposeProjectInstance(projectId);
  });
});
