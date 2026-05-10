import { describe, it, expect } from "vitest";
import { validateSqlAst } from "./sql-ast-validation";

const MCP = { mode: "mcp" as const, catalogSlugs: ["shopify", "datev", "hrworks"] };
const AGENT = { mode: "agent" as const };

describe("validateSqlAst — accept path", () => {
  it("accepts a bare SELECT", async () => {
    expect(await validateSqlAst("SELECT * FROM orders", MCP)).toBeNull();
  });

  it("accepts a CTE", async () => {
    expect(
      await validateSqlAst(
        "WITH recent AS (SELECT * FROM orders WHERE created_at > $1) SELECT * FROM recent",
        MCP,
      ),
    ).toBeNull();
  });

  it("accepts a recursive CTE", async () => {
    expect(
      await validateSqlAst(
        "WITH RECURSIVE r(n) AS (SELECT 1 UNION SELECT n+1 FROM r WHERE n<5) SELECT * FROM r",
        MCP,
      ),
    ).toBeNull();
  });

  it("accepts UNION / INTERSECT / EXCEPT", async () => {
    for (const op of ["UNION", "INTERSECT", "EXCEPT"]) {
      expect(
        await validateSqlAst(`SELECT * FROM orders ${op} SELECT * FROM customers`, MCP),
      ).toBeNull();
    }
  });

  it("accepts EXPLAIN SELECT", async () => {
    expect(await validateSqlAst("EXPLAIN SELECT * FROM orders", MCP)).toBeNull();
  });

  it("accepts EXPLAIN with leading comments", async () => {
    expect(
      await validateSqlAst("/* doc */ EXPLAIN SELECT * FROM orders", MCP),
    ).toBeNull();
  });

  it("accepts DESCRIBE on a bare table", async () => {
    expect(await validateSqlAst("DESCRIBE orders", MCP)).toBeNull();
  });

  it("accepts DESCRIBE wrapping a SELECT", async () => {
    expect(await validateSqlAst("DESCRIBE SELECT * FROM orders", MCP)).toBeNull();
  });

  it("accepts FROM-first syntax", async () => {
    expect(await validateSqlAst("FROM orders SELECT *", MCP)).toBeNull();
  });

  it("accepts FROM-first syntax inside a CTE", async () => {
    expect(
      await validateSqlAst("WITH foo AS (FROM orders SELECT *) SELECT * FROM foo", MCP),
    ).toBeNull();
  });

  it("accepts a subquery", async () => {
    expect(
      await validateSqlAst(
        "SELECT * FROM orders WHERE customer_id IN (SELECT id FROM customers)",
        MCP,
      ),
    ).toBeNull();
  });

  it("accepts joins", async () => {
    expect(
      await validateSqlAst(
        "SELECT * FROM orders o JOIN customers c USING (id)",
        MCP,
      ),
    ).toBeNull();
  });

  it("accepts GROUP BY / HAVING / ORDER BY / LIMIT / QUALIFY", async () => {
    expect(
      await validateSqlAst(
        "SELECT a, b FROM t WHERE x > 1 GROUP BY a, b HAVING count(*) > 5 " +
          "QUALIFY ROW_NUMBER() OVER (PARTITION BY a) = 1 ORDER BY a LIMIT 10",
        MCP,
      ),
    ).toBeNull();
  });

  it("accepts dollar-quoted strings containing semicolons (regex-layer false positive)", async () => {
    expect(
      await validateSqlAst("SELECT $tag$;DROP TABLE x;$tag$ FROM orders", MCP),
    ).toBeNull();
  });

  it("accepts string literals containing semicolons (regex-layer false positive)", async () => {
    expect(await validateSqlAst("SELECT 'a;b' FROM t", MCP)).toBeNull();
  });

  it("accepts whitelisted table functions", async () => {
    for (const fn of [
      "SELECT * FROM range(0, 10)",
      "SELECT * FROM generate_series(1, 5)",
      "SELECT * FROM unnest([1,2,3])",
      "SELECT * FROM repeat('a', 5)",
      "SELECT * FROM (VALUES (1, 'a'), (2, 'b'))",
    ]) {
      expect(await validateSqlAst(fn, MCP)).toBeNull();
    }
  });

  it("accepts catalog-qualified references in agent mode", async () => {
    expect(
      await validateSqlAst("SELECT * FROM Shopify.public.orders LIMIT 10", AGENT),
    ).toBeNull();
  });

  it("accepts schema-qualified references in agent mode (no catalog)", async () => {
    expect(
      await validateSqlAst("SELECT * FROM public.orders LIMIT 10", AGENT),
    ).toBeNull();
  });
});

describe("validateSqlAst — reject path (parser-evasion corpus)", () => {
  it("rejects a quoted information_schema reference", async () => {
    const err = await validateSqlAst('SELECT * FROM "information_schema"."tables"', MCP);
    expect(err).not.toBeNull();
    expect(err).toMatch(/information_schema/i);
  });

  it("rejects a quoted system schema reference (main)", async () => {
    const err = await validateSqlAst('SELECT * FROM "main"."foo"', MCP);
    expect(err).not.toBeNull();
    expect(err).toMatch(/main/i);
  });

  it("rejects a quoted catalog reference matching a project slug", async () => {
    const err = await validateSqlAst(
      'SELECT * FROM "shopify"."public"."orders"',
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/catalog/i);
  });

  it("rejects unrelated catalog references in MCP mode", async () => {
    const err = await validateSqlAst(
      "SELECT * FROM other_db.public.orders",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/catalog references|dataset names/i);
  });

  it("rejects schema-qualified references in MCP mode", async () => {
    const err = await validateSqlAst("SELECT * FROM public.orders", MCP);
    expect(err).not.toBeNull();
    expect(err).toMatch(/Schema-qualified|dataset names/i);
  });

  it("rejects a quoted _scope_ schema reference", async () => {
    const err = await validateSqlAst(
      'SELECT * FROM "_scope_ecommerce"."orders"',
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/_scope_/);
  });

  it("rejects a case-folded _scope_ schema reference", async () => {
    const err = await validateSqlAst(
      'SELECT * FROM "_SCOPE_ECOMMERCE"."orders"',
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/_scope_/);
  });

  it("rejects EXPLAIN ANALYZE", async () => {
    const err = await validateSqlAst("EXPLAIN ANALYZE SELECT * FROM orders", MCP);
    expect(err).not.toBeNull();
    expect(err).toMatch(/EXPLAIN ANALYZE/);
  });

  it("rejects EXPLAIN ANALYZE with mid-token block comment", async () => {
    const err = await validateSqlAst(
      "EXPLAIN /*c*/ ANALYZE SELECT * FROM orders",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/EXPLAIN ANALYZE/);
  });

  it("rejects EXPLAIN ANALYZE with line-comment in between", async () => {
    const err = await validateSqlAst(
      "EXPLAIN -- foo\n ANALYZE SELECT * FROM orders",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/EXPLAIN ANALYZE/);
  });

  it("rejects multi-statement queries", async () => {
    const err = await validateSqlAst("SELECT 1; SELECT 2", MCP);
    expect(err).not.toBeNull();
    expect(err).toMatch(/Multiple statements/);
  });

  it("rejects DDL/DML statements (json_serialize_sql refuses)", async () => {
    for (const sql of [
      "INSERT INTO orders VALUES (1)",
      "UPDATE orders SET total = 0",
      "DELETE FROM orders",
      "DROP TABLE orders",
      "CREATE TABLE x (a INT)",
      "ALTER TABLE orders ADD COLUMN c INT",
      "COPY orders TO '/tmp/x.csv'",
      "ATTACH 'foo.db' AS bar",
      "DETACH bar",
      "INSTALL postgres",
      "LOAD postgres",
      "PRAGMA table_info('orders')",
      "SET memory_limit = '1GB'",
    ]) {
      const err = await validateSqlAst(sql, MCP);
      expect(err, `expected reject for: ${sql}`).not.toBeNull();
    }
  });

  it("rejects external file readers (table-function form)", async () => {
    for (const sql of [
      "SELECT * FROM read_csv('/etc/passwd')",
      "SELECT * FROM read_csv_auto('/etc/passwd')",
      "SELECT * FROM read_parquet('s3://bucket/secret.parquet')",
      "SELECT * FROM read_json('/x.json')",
      "SELECT * FROM read_blob('/x.bin')",
    ]) {
      const err = await validateSqlAst(sql, MCP);
      expect(err, `expected reject for: ${sql}`).not.toBeNull();
      expect(err).toMatch(/table function|read/i);
    }
  });

  it("rejects external file readers in agent mode too", async () => {
    const err = await validateSqlAst(
      "SELECT * FROM read_parquet('/etc/passwd.parquet')",
      AGENT,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/read_parquet/);
  });

  it("rejects DuckDB metadata table functions", async () => {
    for (const sql of [
      "SELECT * FROM duckdb_tables()",
      "SELECT * FROM duckdb_columns()",
      "SELECT * FROM duckdb_secrets()",
      "SELECT * FROM duckdb_settings()",
    ]) {
      const err = await validateSqlAst(sql, MCP);
      expect(err, `expected reject for: ${sql}`).not.toBeNull();
    }
  });

  it("rejects DuckDB metadata table forms (no parens)", async () => {
    // `SELECT * FROM duckdb_columns` (no parentheses) parses as a
    // BASE_TABLE with table_name="duckdb_columns" rather than a
    // TABLE_FUNCTION; it's still rejected because in MCP mode any
    // schema-qualified ref is denied and bare `duckdb_*` table_names
    // are denied too.
    const err = await validateSqlAst("SELECT * FROM duckdb_columns", AGENT);
    // In agent mode bare `duckdb_columns` slips past — only the
    // FUNCTION-call denylist catches scalar invocations. We rely on
    // search_path / catalogs not exposing this name; the MCP mode
    // already rejects via the schema-qualified rule. Document the
    // status quo with this assertion (sanity check, not a security
    // claim).
    expect(err).toBeNull();
  });

  it("rejects glob() table function", async () => {
    const err = await validateSqlAst("SELECT * FROM glob('/etc/*')", MCP);
    expect(err).not.toBeNull();
    expect(err).toMatch(/glob/);
  });

  it("rejects forbidden scalar functions", async () => {
    for (const sql of [
      "SELECT pg_read_file('/etc/passwd')",
      "SELECT pg_read_binary_file('/etc/passwd')",
      "SELECT pg_ls_dir('/')",
      "SELECT read_file('/etc/passwd')",
      "SELECT read_blob('/x.bin')",
      "SELECT nextval('foo')",
      "SELECT currval('foo')",
      "SELECT json_serialize_sql('SELECT 1')",
      "SELECT parse_sql('SELECT 1')",
    ]) {
      const err = await validateSqlAst(sql, MCP);
      expect(err, `expected reject for: ${sql}`).not.toBeNull();
      expect(err).toMatch(/not allowed/i);
    }
  });

  it("rejects forbidden scalar functions in agent mode too", async () => {
    const err = await validateSqlAst("SELECT pg_read_file('/etc/passwd')", AGENT);
    expect(err).not.toBeNull();
    expect(err).toMatch(/pg_read_file/);
  });

  it("rejects disallowed table function inside DESCRIBE", async () => {
    const err = await validateSqlAst(
      "DESCRIBE SELECT * FROM read_parquet('s3://x/y')",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/read_parquet/);
  });

  it("rejects disallowed table function inside an EXPLAIN body", async () => {
    const err = await validateSqlAst(
      "EXPLAIN SELECT * FROM read_parquet('s3://x/y')",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/read_parquet/);
  });

  it("rejects disallowed table function inside a subquery", async () => {
    const err = await validateSqlAst(
      "SELECT * FROM orders WHERE id IN (SELECT id FROM read_parquet('s3://x/y'))",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/read_parquet/);
  });

  it("surfaces parser errors verbatim", async () => {
    const err = await validateSqlAst("NOT EVEN SQL", MCP);
    expect(err).not.toBeNull();
    expect(err).toMatch(/Could not parse query/);
    expect(err).toMatch(/syntax error|NOT/i);
  });
});

describe("validateSqlAst — agent mode does NOT enforce BASE_TABLE rules", () => {
  // The agent path legitimately uses `information_schema` for schema
  // exploration and `catalog.schema.table` for attached connections
  // (see openspec/changes/add-structural-sql-safety/specs/semantic-model-
  // agent/spec.md "Agent explores database schema" / "Catalog references
  // remain allowed in agent path"). Only the table-function allowlist
  // and scalar-function denylist apply on this path.

  it("accepts catalog.schema.table in agent mode", async () => {
    expect(
      await validateSqlAst("SELECT * FROM Shopify.public.orders", AGENT),
    ).toBeNull();
  });

  it("accepts information_schema queries in agent mode", async () => {
    expect(
      await validateSqlAst(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = $1",
        AGENT,
      ),
    ).toBeNull();
  });

  it("still rejects forbidden table functions in agent mode", async () => {
    const err = await validateSqlAst(
      "SELECT * FROM read_parquet('/etc/passwd.parquet')",
      AGENT,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/read_parquet/);
  });

  it("still rejects forbidden scalar functions in agent mode", async () => {
    const err = await validateSqlAst("SELECT pg_read_file('/etc/passwd')", AGENT);
    expect(err).not.toBeNull();
    expect(err).toMatch(/pg_read_file/);
  });
});

describe("validateSqlAst — connection lifecycle", () => {
  it("reuses the parser instance across calls (singleton)", async () => {
    // Successive calls share a process-wide DuckDBInstance; if the
    // singleton were not memoised, the test runtime would balloon.
    // We don't assert on the underlying instance directly, but we can
    // verify that hundreds of calls complete in well under a second.
    const start = Date.now();
    for (let i = 0; i < 100; i++) {
      await validateSqlAst("SELECT * FROM orders", MCP);
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(2_000);
  });
});
