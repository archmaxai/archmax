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

  it("allows SHOW queries", () => {
    expect(validateReadOnlySQL("SHOW TABLES")).toBeNull();
  });

  it("allows PRAGMA queries", () => {
    expect(validateReadOnlySQL("PRAGMA table_info('t')")).toBeNull();
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
});

describe("validateScopedSQL", () => {
  const catalogs = ["shopify", "datev", "hrworks"];
  const model = "ecommerce";

  it("allows _scope_<model> references", () => {
    expect(
      validateScopedSQL('SELECT * FROM _scope_ecommerce."orders" LIMIT 10', catalogs, model),
    ).toBeNull();
  });

  it("allows joined _scope_<model> references", () => {
    expect(
      validateScopedSQL(
        'SELECT o.id, c.email FROM _scope_ecommerce."orders" o JOIN _scope_ecommerce."customers" c ON o.customer_id = c.id',
        catalogs,
        model,
      ),
    ).toBeNull();
  });

  it("allows CTE with _scope_<model> references", () => {
    expect(
      validateScopedSQL(
        'WITH recent AS (SELECT * FROM _scope_ecommerce."orders" WHERE created_at > $1) SELECT * FROM recent',
        catalogs,
        model,
      ),
    ).toBeNull();
  });

  it("rejects raw catalog reference (exact match)", () => {
    const result = validateScopedSQL("SELECT * FROM shopify.public.orders", catalogs, model);
    expect(result).toContain('"shopify"');
    expect(result).toContain("_scope_ecommerce");
  });

  it("rejects raw catalog reference (case-insensitive)", () => {
    const result = validateScopedSQL("SELECT * FROM Shopify.public.orders", catalogs, model);
    expect(result).not.toBeNull();
  });

  it("rejects any raw catalog name", () => {
    expect(validateScopedSQL("SELECT * FROM datev.dbo.accounts", catalogs, model)).not.toBeNull();
    expect(validateScopedSQL("SELECT * FROM hrworks.hr.employees", catalogs, model)).not.toBeNull();
  });

  it("rejects information_schema access", () => {
    const result = validateScopedSQL(
      "SELECT * FROM information_schema.tables",
      catalogs,
      model,
    );
    expect(result).toContain("information_schema");
  });

  it("rejects write queries even with valid scoped tables", () => {
    const result = validateScopedSQL(
      'INSERT INTO _scope_ecommerce."orders" VALUES (1)',
      catalogs,
      model,
    );
    expect(result).not.toBeNull();
  });

  it("rejects multi-statement with scoped tables", () => {
    const result = validateScopedSQL(
      'SELECT 1; DROP TABLE _scope_ecommerce."orders"',
      catalogs,
      model,
    );
    expect(result).not.toBeNull();
  });

  it("allows queries when catalog list is empty", () => {
    expect(
      validateScopedSQL('SELECT * FROM _scope_ecommerce."orders"', [], model),
    ).toBeNull();
  });

  it("handles catalog names with special regex characters", () => {
    expect(
      validateScopedSQL("SELECT * FROM my.db.table", ["my.db"], model),
    ).not.toBeNull();
  });

  it("does not false-positive on catalog name in string literal", () => {
    const result = validateScopedSQL(
      "SELECT * FROM _scope_ecommerce.\"orders\" WHERE note = 'from shopify.store'",
      catalogs,
      model,
    );
    expect(result).not.toBeNull();
  });

  it("allows subqueries with _scope_<model> tables", () => {
    expect(
      validateScopedSQL(
        'SELECT * FROM _scope_ecommerce."orders" WHERE customer_id IN (SELECT id FROM _scope_ecommerce."customers")',
        catalogs,
        model,
      ),
    ).toBeNull();
  });

  it("rejects cross-model scope reference", () => {
    const result = validateScopedSQL(
      'SELECT * FROM _scope_analytics."revenue"',
      catalogs,
      model,
    );
    expect(result).toContain("Cross-model scope access");
    expect(result).toContain("_scope_ecommerce");
  });

  it("rejects cross-model scope in JOIN", () => {
    const result = validateScopedSQL(
      'SELECT * FROM _scope_ecommerce."orders" o JOIN _scope_analytics."revenue" r ON o.id = r.order_id',
      catalogs,
      model,
    );
    expect(result).not.toBeNull();
  });

  it("allows own model scope but rejects other model scope", () => {
    expect(
      validateScopedSQL('SELECT * FROM _scope_ecommerce."orders"', catalogs, model),
    ).toBeNull();
    expect(
      validateScopedSQL('SELECT * FROM _scope_other."orders"', catalogs, model),
    ).not.toBeNull();
  });
});
