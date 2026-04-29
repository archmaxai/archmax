import { describe, it, expect } from "vitest";
import { validateReadOnlySQL, validateScopedSQL } from "./sql-validation";

describe("validateReadOnlySQL", () => {
  it("allows SELECT queries", () => {
    expect(validateReadOnlySQL("SELECT * FROM t")).toBeNull();
  });

  it("allows WITH (CTE) queries", () => {
    expect(validateReadOnlySQL("WITH cte AS (SELECT 1) SELECT * FROM cte")).toBeNull();
  });

  it("allows EXPLAIN queries", () => {
    expect(validateReadOnlySQL("EXPLAIN SELECT * FROM t")).toBeNull();
  });

  it("allows DESCRIBE queries", () => {
    expect(validateReadOnlySQL("DESCRIBE t")).toBeNull();
  });

  it("rejects SHOW queries", () => {
    expect(validateReadOnlySQL("SHOW TABLES")).not.toBeNull();
  });

  it("rejects PRAGMA queries", () => {
    expect(validateReadOnlySQL("PRAGMA table_info('t')")).not.toBeNull();
  });

  it("rejects EXPLAIN ANALYZE (which executes the wrapped statement)", () => {
    const r = validateReadOnlySQL("EXPLAIN ANALYZE SELECT * FROM t");
    expect(r).toMatch(/EXPLAIN ANALYZE/i);
  });

  it("rejects EXPLAIN ANALYZE wrapping a write", () => {
    expect(
      validateReadOnlySQL("EXPLAIN ANALYZE CREATE TABLE leak AS SELECT * FROM orders"),
    ).not.toBeNull();
  });

  it("rejects EXPLAIN wrapping non-read statements", () => {
    expect(validateReadOnlySQL("EXPLAIN INSERT INTO t VALUES (1)")).not.toBeNull();
    expect(validateReadOnlySQL("EXPLAIN DROP TABLE t")).not.toBeNull();
    expect(validateReadOnlySQL("EXPLAIN UPDATE t SET x = 1")).not.toBeNull();
  });

  it("allows EXPLAIN wrapping SELECT", () => {
    expect(validateReadOnlySQL("EXPLAIN SELECT * FROM t")).toBeNull();
  });

  it("allows EXPLAIN wrapping WITH (CTE)", () => {
    expect(
      validateReadOnlySQL("EXPLAIN WITH cte AS (SELECT 1) SELECT * FROM cte"),
    ).toBeNull();
  });

  it("rejects INSERT", () => {
    expect(validateReadOnlySQL("INSERT INTO t VALUES (1)")).not.toBeNull();
  });

  it("rejects UPDATE", () => {
    expect(validateReadOnlySQL("UPDATE t SET x = 1")).not.toBeNull();
  });

  it("rejects DELETE", () => {
    expect(validateReadOnlySQL("DELETE FROM t")).not.toBeNull();
  });

  it("rejects CREATE", () => {
    expect(validateReadOnlySQL("CREATE TABLE t (x INT)")).not.toBeNull();
  });

  it("rejects DROP", () => {
    expect(validateReadOnlySQL("DROP TABLE t")).not.toBeNull();
  });

  it("rejects ALTER", () => {
    expect(validateReadOnlySQL("ALTER TABLE t ADD COLUMN y INT")).not.toBeNull();
  });

  it("rejects multi-statement queries", () => {
    expect(validateReadOnlySQL("SELECT 1; DROP TABLE t")).not.toBeNull();
  });

  it("allows trailing semicolon with whitespace only", () => {
    expect(validateReadOnlySQL("SELECT 1;  ")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(validateReadOnlySQL("select * from t")).toBeNull();
  });

  it("allows leading whitespace", () => {
    expect(validateReadOnlySQL("  SELECT 1")).toBeNull();
  });

  it("allows single-line comment before SELECT", () => {
    expect(
      validateReadOnlySQL("-- this is a comment\nSELECT * FROM t"),
    ).toBeNull();
  });

  it("allows multiple single-line comments before SELECT", () => {
    expect(
      validateReadOnlySQL(
        "-- comment 1\n-- comment 2\nSELECT * FROM t",
      ),
    ).toBeNull();
  });

  it("allows block comment before SELECT", () => {
    expect(
      validateReadOnlySQL("/* block comment */ SELECT * FROM t"),
    ).toBeNull();
  });

  it("allows multi-line block comment before SELECT", () => {
    expect(
      validateReadOnlySQL("/* line1\n   line2 */\nSELECT * FROM t"),
    ).toBeNull();
  });

  it("rejects write query hidden behind a comment", () => {
    expect(
      validateReadOnlySQL("-- harmless\nDROP TABLE t"),
    ).not.toBeNull();
  });
});

describe("validateScopedSQL", () => {
  const catalogs = ["shopify", "datev", "hrworks"];

  it("allows bare dataset name references", () => {
    expect(
      validateScopedSQL("SELECT * FROM orders LIMIT 10", catalogs),
    ).toBeNull();
  });

  it("allows joined bare dataset references", () => {
    expect(
      validateScopedSQL(
        "SELECT o.id, c.email FROM orders o JOIN customers c ON o.customer_id = c.id",
        catalogs,
      ),
    ).toBeNull();
  });

  it("allows CTE with bare dataset references", () => {
    expect(
      validateScopedSQL(
        "WITH recent AS (SELECT * FROM orders WHERE created_at > $1) SELECT * FROM recent",
        catalogs,
      ),
    ).toBeNull();
  });

  it("rejects raw catalog reference (exact match)", () => {
    const result = validateScopedSQL("SELECT * FROM shopify.public.orders", catalogs);
    expect(result).toContain('"shopify"');
    expect(result).toContain("dataset names directly");
  });

  it("rejects raw catalog reference (case-insensitive)", () => {
    const result = validateScopedSQL("SELECT * FROM Shopify.public.orders", catalogs);
    expect(result).not.toBeNull();
  });

  it("rejects any raw catalog name", () => {
    expect(validateScopedSQL("SELECT * FROM datev.dbo.accounts", catalogs)).not.toBeNull();
    expect(validateScopedSQL("SELECT * FROM hrworks.hr.employees", catalogs)).not.toBeNull();
  });

  it("rejects information_schema access", () => {
    const result = validateScopedSQL(
      "SELECT * FROM information_schema.tables",
      catalogs,
    );
    expect(result).toContain("information_schema");
  });

  it("rejects DuckDB metadata table functions", () => {
    expect(validateScopedSQL("SELECT * FROM duckdb_tables()", catalogs)).toMatch(
      /duckdb/i,
    );
    expect(
      validateScopedSQL("SELECT * FROM duckdb_columns()", catalogs),
    ).not.toBeNull();
    expect(
      validateScopedSQL("SELECT * FROM duckdb_secrets()", catalogs),
    ).not.toBeNull();
    expect(
      validateScopedSQL("SELECT * FROM duckdb_settings()", catalogs),
    ).not.toBeNull();
  });

  it("rejects pg_catalog and sqlite_master", () => {
    expect(
      validateScopedSQL("SELECT * FROM pg_catalog.pg_class", catalogs),
    ).not.toBeNull();
    expect(
      validateScopedSQL("SELECT * FROM sqlite_master", catalogs),
    ).not.toBeNull();
  });

  it("rejects main./temp./system. schema references", () => {
    expect(validateScopedSQL("SELECT * FROM main.foo", catalogs)).not.toBeNull();
    expect(validateScopedSQL("SELECT * FROM temp.foo", catalogs)).not.toBeNull();
    expect(validateScopedSQL("SELECT * FROM system.foo", catalogs)).not.toBeNull();
  });

  it("rejects external file readers (read_*)", () => {
    expect(
      validateScopedSQL("SELECT * FROM read_csv('/etc/passwd')", catalogs),
    ).not.toBeNull();
    expect(
      validateScopedSQL("SELECT * FROM read_parquet('s3://bucket/x')", catalogs),
    ).not.toBeNull();
    expect(
      validateScopedSQL("SELECT * FROM read_json('/x.json')", catalogs),
    ).not.toBeNull();
    expect(
      validateScopedSQL("SELECT * FROM read_blob('/x.bin')", catalogs),
    ).not.toBeNull();
  });

  it("does not block legitimate identifiers that contain forbidden substrings", () => {
    // "main" / "duckdb" appearing inside compound identifiers must not be
    // confused with system schemas / metadata functions.
    expect(
      validateScopedSQL("SELECT order_main.id FROM order_main", catalogs),
    ).toBeNull();
    expect(
      validateScopedSQL("SELECT duckdb_user.name FROM duckdb_user", catalogs),
    ).toBeNull();
  });

  it("rejects _scope_ prefix usage", () => {
    const result = validateScopedSQL(
      'SELECT * FROM _scope_ecommerce."orders"',
      catalogs,
    );
    expect(result).toContain("_scope_");
    expect(result).toContain("dataset names directly");
  });

  it("rejects cross-model _scope_ prefix", () => {
    const result = validateScopedSQL(
      'SELECT * FROM _scope_analytics."revenue"',
      catalogs,
    );
    expect(result).not.toBeNull();
  });

  it("rejects write queries", () => {
    const result = validateScopedSQL(
      "INSERT INTO orders VALUES (1)",
      catalogs,
    );
    expect(result).not.toBeNull();
  });

  it("rejects multi-statement queries", () => {
    const result = validateScopedSQL(
      "SELECT 1; DROP TABLE orders",
      catalogs,
    );
    expect(result).not.toBeNull();
  });

  it("allows queries when catalog list is empty", () => {
    expect(
      validateScopedSQL("SELECT * FROM orders", []),
    ).toBeNull();
  });

  it("handles catalog names with special regex characters", () => {
    expect(
      validateScopedSQL("SELECT * FROM my.db.table", ["my.db"]),
    ).not.toBeNull();
  });

  it("allows subqueries with bare dataset names", () => {
    expect(
      validateScopedSQL(
        "SELECT * FROM orders WHERE customer_id IN (SELECT id FROM customers)",
        catalogs,
      ),
    ).toBeNull();
  });
});
