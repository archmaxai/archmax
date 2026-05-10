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

  it("rejects DuckDB metadata table forms (no parens) in MCP mode", async () => {
    // `SELECT * FROM duckdb_columns` (no parentheses) parses as a
    // BASE_TABLE with table_name="duckdb_columns" rather than a
    // TABLE_FUNCTION. The duckdb_* prefix rule on BASE_TABLE rejects
    // it before the schema/catalog gate even runs.
    const err = await validateSqlAst("SELECT * FROM duckdb_columns", MCP);
    expect(err).not.toBeNull();
    expect(err).toMatch(/duckdb_columns/);
  });

  it("rejects DuckDB metadata table forms (no parens) in agent mode too", async () => {
    // The duckdb_* prefix is platform-internal regardless of caller —
    // agent path must not use it for schema exploration either
    // (information_schema covers that need).
    const err = await validateSqlAst("SELECT * FROM duckdb_columns", AGENT);
    expect(err).not.toBeNull();
    expect(err).toMatch(/duckdb_columns/);
  });

  it("rejects quoted DuckDB metadata table forms in MCP mode", async () => {
    const err = await validateSqlAst('SELECT * FROM "duckdb_secrets"', MCP);
    expect(err).not.toBeNull();
    expect(err).toMatch(/duckdb_secrets/);
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

describe("validateSqlAst — view_query mode", () => {
  // The `view_query` validation mode gates persistent VIEW bodies that
  // an authoring agent writes into a dataset's COMMON extension. It
  // splits the difference between `agent` (too permissive — would let
  // a view body project from `information_schema`) and `mcp` (too
  // strict — would forbid the legitimate `catalog.schema.table` shape
  // a view body must use to reach an attached source).
  const VIEW_QUERY = { mode: "view_query" as const };

  it("accepts catalog.schema.table source references", async () => {
    expect(
      await validateSqlAst("SELECT id FROM Shopify.public.orders", VIEW_QUERY),
    ).toBeNull();
  });

  it("accepts schema-qualified references to attached catalogs", async () => {
    expect(
      await validateSqlAst("SELECT * FROM datev.public.accounts", VIEW_QUERY),
    ).toBeNull();
  });

  it.each([
    ["information_schema", "SELECT * FROM information_schema.tables"],
    ["pg_catalog", "SELECT * FROM pg_catalog.pg_class"],
    ["sqlite_master", "SELECT * FROM sqlite_master"],
    ["main schema", "SELECT * FROM main.foo"],
    ["temp schema", "SELECT * FROM temp.foo"],
    ["system schema", "SELECT * FROM system.foo"],
  ])("rejects system catalog/schema reference (%s)", async (_label, sql) => {
    const err = await validateSqlAst(sql, VIEW_QUERY);
    expect(err).not.toBeNull();
    expect(err).toMatch(/system catalog\/schema/i);
  });

  it("rejects information_schema hidden inside a CTE", async () => {
    const err = await validateSqlAst(
      "WITH bad AS (SELECT * FROM information_schema.tables) SELECT * FROM bad",
      VIEW_QUERY,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/information_schema/i);
  });

  it("rejects _scope_* cross-references between models", async () => {
    const err = await validateSqlAst(
      "SELECT * FROM _scope_other.orders",
      VIEW_QUERY,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/_scope_/);
  });

  it("rejects duckdb_* metadata references", async () => {
    const err = await validateSqlAst(
      "SELECT * FROM duckdb_secrets()",
      VIEW_QUERY,
    );
    expect(err).not.toBeNull();
  });

  it("rejects forbidden table functions", async () => {
    const err = await validateSqlAst(
      "SELECT * FROM read_parquet('/etc/passwd.parquet')",
      VIEW_QUERY,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/read_parquet/);
  });

  it("rejects forbidden scalar functions", async () => {
    const err = await validateSqlAst("SELECT pg_read_file('/etc/passwd')", VIEW_QUERY);
    expect(err).not.toBeNull();
    expect(err).toMatch(/pg_read_file/);
  });

  it("rejects non-SELECT statements", async () => {
    const err = await validateSqlAst("DROP TABLE orders", VIEW_QUERY);
    expect(err).not.toBeNull();
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

describe("validateSqlAst — regex-parity corpus (sole-validator coverage)", () => {
  // Every check the previous lexical pre-filter
  // (validateReadOnlySQL / validateScopedSQL) caught is asserted here
  // against the AST validator alone. If any of these stop firing,
  // dropping the regex layer regresses security.

  // ── First-keyword allowlist (non-SELECT/WITH/EXPLAIN/DESCRIBE) ──

  it.each([
    "INSERT INTO orders VALUES (1)",
    "UPDATE orders SET total = 0",
    "DELETE FROM orders",
    "DROP TABLE orders",
    "CREATE TABLE x (a INT)",
    "ALTER TABLE orders ADD COLUMN c INT",
    "TRUNCATE TABLE orders",
    "COPY orders TO '/tmp/x.csv'",
    "ATTACH 'foo.db' AS bar",
    "DETACH bar",
    "INSTALL postgres",
    "LOAD postgres",
    "PRAGMA table_info('orders')",
    "PRAGMA version",
    "SET memory_limit = '1GB'",
    "VACUUM",
    "CHECKPOINT",
  ])("rejects non-SELECT statement: %s", async (sql) => {
    const err = await validateSqlAst(sql, MCP);
    expect(err, `expected reject for: ${sql}`).not.toBeNull();
  });

  it("rejects SHOW TABLES (only DESCRIBE/SUMMARIZE allowed for SHOW_REF)", async () => {
    const err = await validateSqlAst("SHOW TABLES", MCP);
    expect(err).not.toBeNull();
  });

  it("rejects SHOW DATABASES", async () => {
    const err = await validateSqlAst("SHOW DATABASES", MCP);
    expect(err).not.toBeNull();
  });

  // ── EXPLAIN restrictions ──

  it("rejects EXPLAIN INSERT (peeled body fails json_serialize_sql)", async () => {
    const err = await validateSqlAst("EXPLAIN INSERT INTO t VALUES (1)", MCP);
    expect(err).not.toBeNull();
  });

  it("rejects EXPLAIN DROP TABLE", async () => {
    const err = await validateSqlAst("EXPLAIN DROP TABLE t", MCP);
    expect(err).not.toBeNull();
  });

  it("rejects EXPLAIN UPDATE", async () => {
    const err = await validateSqlAst("EXPLAIN UPDATE t SET x = 1", MCP);
    expect(err).not.toBeNull();
  });

  it("rejects EXPLAIN ANALYZE wrapping CREATE TABLE (DuckDB would execute it)", async () => {
    // EXPLAIN ANALYZE in DuckDB *executes* the wrapped statement, so
    // this is the high-stakes regression test: a CREATE TABLE that
    // smuggles past EXPLAIN ANALYZE detection would actually mutate.
    const err = await validateSqlAst(
      "EXPLAIN ANALYZE CREATE TABLE leak AS SELECT * FROM orders",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/EXPLAIN ANALYZE/);
  });

  // ── Multi-statement ──

  it("rejects SELECT 1; DROP TABLE t (multi-statement)", async () => {
    const err = await validateSqlAst("SELECT 1; DROP TABLE t", MCP);
    expect(err).not.toBeNull();
    expect(err).toMatch(/Multiple statements|parse/i);
  });

  it("rejects SELECT 1; INSERT INTO t VALUES (1)", async () => {
    const err = await validateSqlAst("SELECT 1; INSERT INTO t VALUES (1)", MCP);
    expect(err).not.toBeNull();
  });

  it("rejects SELECT 1; SELECT 2", async () => {
    const err = await validateSqlAst("SELECT 1; SELECT 2", MCP);
    expect(err).not.toBeNull();
    expect(err).toMatch(/Multiple statements/);
  });

  it("accepts trailing semicolon after a single statement", async () => {
    expect(await validateSqlAst("SELECT 1;", MCP)).toBeNull();
  });

  // ── Comment-prefixed evasion ──

  it("rejects DROP hidden behind a leading line comment", async () => {
    const err = await validateSqlAst("-- harmless\nDROP TABLE t", MCP);
    expect(err).not.toBeNull();
  });

  it("rejects DROP hidden behind a leading block comment", async () => {
    const err = await validateSqlAst("/* harmless */ DROP TABLE t", MCP);
    expect(err).not.toBeNull();
  });

  it("accepts leading line comment before a SELECT", async () => {
    expect(
      await validateSqlAst("-- this is a comment\nSELECT * FROM t", MCP),
    ).toBeNull();
  });

  it("accepts leading block comment before a SELECT", async () => {
    expect(
      await validateSqlAst("/* block comment */ SELECT * FROM t", MCP),
    ).toBeNull();
  });

  // ── System schemas / catalogs (MCP mode) ──

  it.each([
    ["bare information_schema", "SELECT * FROM information_schema.tables"],
    ["bare pg_catalog", "SELECT * FROM pg_catalog.pg_class"],
    ["bare sqlite_master", "SELECT * FROM sqlite_master"],
    ["main schema", "SELECT * FROM main.foo"],
    ["temp schema", "SELECT * FROM temp.foo"],
    ["system schema", "SELECT * FROM system.foo"],
  ])("rejects system schema: %s", async (_label, sql) => {
    const err = await validateSqlAst(sql, MCP);
    expect(err, `expected reject for: ${sql}`).not.toBeNull();
  });

  // ── Catalog slug references (MCP mode) ──

  it("rejects bare catalog reference matching a project slug", async () => {
    const err = await validateSqlAst(
      "SELECT * FROM shopify.public.orders",
      { mode: "mcp", catalogSlugs: ["shopify"] },
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/catalog/);
  });

  it("rejects case-folded catalog slug reference", async () => {
    const err = await validateSqlAst(
      "SELECT * FROM Shopify.public.orders",
      { mode: "mcp", catalogSlugs: ["shopify"] },
    );
    expect(err).not.toBeNull();
  });

  // ── External readers (table-function form) ──

  it.each([
    "SELECT * FROM read_csv('/etc/passwd')",
    "SELECT * FROM read_csv_auto('/etc/passwd')",
    "SELECT * FROM read_parquet('s3://bucket/x.parquet')",
    "SELECT * FROM read_json('/x.json')",
    "SELECT * FROM read_blob('/x.bin')",
  ])("rejects external file reader: %s", async (sql) => {
    const err = await validateSqlAst(sql, MCP);
    expect(err, `expected reject for: ${sql}`).not.toBeNull();
  });

  // ── DuckDB metadata (function and table forms) ──

  it.each([
    "SELECT * FROM duckdb_tables()",
    "SELECT * FROM duckdb_columns()",
    "SELECT * FROM duckdb_secrets()",
    "SELECT * FROM duckdb_settings()",
  ])("rejects duckdb_* function form: %s", async (sql) => {
    const err = await validateSqlAst(sql, MCP);
    expect(err, `expected reject for: ${sql}`).not.toBeNull();
  });

  it.each([
    "SELECT * FROM duckdb_columns",
    "SELECT * FROM duckdb_tables",
    "SELECT * FROM duckdb_secrets",
  ])("rejects duckdb_* bare-table form: %s", async (sql) => {
    const err = await validateSqlAst(sql, MCP);
    expect(err, `expected reject for: ${sql}`).not.toBeNull();
  });

  // ── _scope_* references ──

  it("rejects bare _scope_ reference", async () => {
    const err = await validateSqlAst(
      "SELECT * FROM _scope_ecommerce.orders",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/_scope_/);
  });

  it("rejects _scope_ reference in agent mode too", async () => {
    const err = await validateSqlAst(
      "SELECT * FROM _scope_ecommerce.orders",
      AGENT,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/_scope_/);
  });

  // ── Parser-evasion / quoting variants ──

  it("rejects U&-escaped information_schema reference", async () => {
    // "main" via 6-digit unicode escape — the regex couldn't decode
    // these; the parser canonicalises them to the bare ident.
    const err = await validateSqlAst(
      "SELECT * FROM U&\"\\006D\\0061\\0069\\006E\".foo",
      MCP,
    );
    expect(err).not.toBeNull();
  });

  // ── False-positive fixes (regex was wrong, AST correct) ──

  it("accepts string literals containing semicolons (no longer a false positive)", async () => {
    // Previously the regex /;\s*\S/ rejected `SELECT 'a;b' FROM t`.
    // The AST validator parses the literal correctly and accepts it.
    expect(await validateSqlAst("SELECT 'a;b' FROM t", MCP)).toBeNull();
  });

  it("accepts dollar-quoted strings containing semicolons", async () => {
    expect(
      await validateSqlAst("SELECT $tag$;DROP TABLE x;$tag$ FROM t", MCP),
    ).toBeNull();
  });

  // ── Empty / malformed input ──

  it("rejects empty string", async () => {
    const err = await validateSqlAst("", MCP);
    expect(err).not.toBeNull();
  });

  it("rejects whitespace-only input", async () => {
    const err = await validateSqlAst("   \n\t  ", MCP);
    expect(err).not.toBeNull();
  });

  it("rejects comment-only input", async () => {
    const err = await validateSqlAst("-- just a comment", MCP);
    expect(err).not.toBeNull();
  });

  it("rejects block-comment-only input", async () => {
    const err = await validateSqlAst("/* block */", MCP);
    expect(err).not.toBeNull();
  });
});

describe("validateSqlAst — deep-nesting evasion (walker is unbounded-depth)", () => {
  // The walker visits every AST node. These tests assert that
  // forbidden namespaces / functions cannot be hidden inside CTEs,
  // set operations, lateral joins, window/aggregate expressions,
  // ORDER BY / GROUP BY / HAVING, or DESCRIBE wrappers. If any of
  // these regress, an attacker could smuggle a forbidden table or
  // function past validation by burying it deep in the tree.

  // ── information_schema / system catalogs hidden in CTEs ──

  it("rejects information_schema hidden inside a CTE (MCP)", async () => {
    const err = await validateSqlAst(
      "WITH bad AS (SELECT * FROM information_schema.tables) SELECT * FROM bad",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/information_schema/i);
  });

  it("rejects pg_catalog hidden inside a recursive CTE (MCP)", async () => {
    const err = await validateSqlAst(
      "WITH RECURSIVE r AS (SELECT * FROM pg_catalog.pg_class UNION ALL SELECT * FROM r) SELECT * FROM r",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/pg_catalog/i);
  });

  it("rejects information_schema on the right side of UNION (MCP)", async () => {
    const err = await validateSqlAst(
      "SELECT * FROM orders UNION ALL SELECT * FROM information_schema.tables",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/information_schema/i);
  });

  it("rejects information_schema inside an EXISTS subquery (MCP)", async () => {
    const err = await validateSqlAst(
      "SELECT * FROM orders WHERE EXISTS (SELECT 1 FROM information_schema.tables)",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/information_schema/i);
  });

  it("rejects information_schema inside a LATERAL join (MCP)", async () => {
    const err = await validateSqlAst(
      "SELECT * FROM orders, LATERAL (SELECT * FROM information_schema.tables) t",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/information_schema/i);
  });

  // ── _scope_* cross-model leak hidden in nested queries ──

  it("rejects _scope_other inside a CTE (universal deny — both modes)", async () => {
    const sql =
      'WITH x AS (SELECT * FROM "_scope_other_model"."orders") SELECT * FROM x';
    expect(await validateSqlAst(sql, MCP)).toMatch(/_scope_/);
    expect(await validateSqlAst(sql, AGENT)).toMatch(/_scope_/);
  });

  it("rejects _scope_other inside a subquery in agent mode", async () => {
    const err = await validateSqlAst(
      'SELECT * FROM orders WHERE id IN (SELECT id FROM "_scope_other"."orders")',
      AGENT,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/_scope_/);
  });

  // ── duckdb_* metadata hidden in nested queries ──

  it("rejects duckdb_columns hidden inside a subquery (both modes)", async () => {
    const sql =
      "SELECT * FROM orders WHERE id IN (SELECT cardinality FROM duckdb_columns)";
    expect(await validateSqlAst(sql, MCP)).toMatch(/duckdb_columns/);
    expect(await validateSqlAst(sql, AGENT)).toMatch(/duckdb_columns/);
  });

  it("rejects duckdb_secrets hidden inside a CTE", async () => {
    const err = await validateSqlAst(
      "WITH s AS (SELECT * FROM duckdb_secrets) SELECT * FROM s",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/duckdb_secrets/);
  });

  // ── Forbidden scalar functions hidden in expression positions ──

  it("rejects pg_read_file in WHERE clause", async () => {
    const err = await validateSqlAst(
      "SELECT * FROM orders WHERE customer_id = pg_read_file('/etc/passwd')",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/pg_read_file/);
  });

  it("rejects pg_read_file inside an aggregate", async () => {
    const err = await validateSqlAst(
      "SELECT count(pg_read_file('/etc/passwd')) FROM orders",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/pg_read_file/);
  });

  it("rejects pg_read_file inside a window function argument", async () => {
    const err = await validateSqlAst(
      "SELECT first_value(pg_read_file('/etc/passwd')) OVER (PARTITION BY id) FROM orders",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/pg_read_file/);
  });

  it("rejects pg_read_file inside ORDER BY", async () => {
    const err = await validateSqlAst(
      "SELECT * FROM orders ORDER BY pg_read_file('/etc/passwd')",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/pg_read_file/);
  });

  it("rejects pg_read_file inside GROUP BY", async () => {
    const err = await validateSqlAst(
      "SELECT count(*) FROM orders GROUP BY pg_read_file('/etc/passwd')",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/pg_read_file/);
  });

  it("rejects pg_read_file inside HAVING", async () => {
    const err = await validateSqlAst(
      "SELECT customer_id FROM orders GROUP BY customer_id HAVING count(*) > pg_read_file('/etc/passwd')::INTEGER",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/pg_read_file/);
  });

  it("rejects pg_read_file inside a CASE expression", async () => {
    const err = await validateSqlAst(
      "SELECT CASE WHEN id > 0 THEN pg_read_file('/etc/passwd') ELSE 'safe' END FROM orders",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/pg_read_file/);
  });

  it("rejects nextval() inside a SELECT projection", async () => {
    const err = await validateSqlAst(
      "SELECT id, nextval('my_seq') FROM orders",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/nextval/);
  });

  // ── DESCRIBE wrapping a forbidden namespace ──

  it("rejects DESCRIBE wrapping a SELECT from information_schema (MCP)", async () => {
    const err = await validateSqlAst(
      "DESCRIBE SELECT * FROM information_schema.tables",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/information_schema/i);
  });

  it("rejects DESCRIBE wrapping a SELECT from duckdb_secrets (both modes)", async () => {
    const sql = "DESCRIBE SELECT * FROM duckdb_secrets";
    expect(await validateSqlAst(sql, MCP)).toMatch(/duckdb_secrets/);
    expect(await validateSqlAst(sql, AGENT)).toMatch(/duckdb_secrets/);
  });

  // ── EXPLAIN wrapping deeply nested forbidden references ──

  it("rejects EXPLAIN of a query containing information_schema in a CTE", async () => {
    const err = await validateSqlAst(
      "EXPLAIN WITH bad AS (SELECT * FROM information_schema.tables) SELECT * FROM bad",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/information_schema/i);
  });

  it("rejects EXPLAIN of a query containing pg_read_file inside an expression", async () => {
    const err = await validateSqlAst(
      "EXPLAIN SELECT pg_read_file('/etc/passwd') FROM orders",
      MCP,
    );
    expect(err).not.toBeNull();
    expect(err).toMatch(/pg_read_file/);
  });
});

describe("validateSqlAst — fail-closed default for unknown statement shapes", () => {
  // A future DuckDB release that introduces a new query-like AST node
  // (e.g. a hypothetical `MERGE_NODE`) must NOT silently flow through
  // the validator. The structural allowlist + `_NODE` suffix heuristic
  // ensures unknown query-shape nodes are rejected with a clear error.
  // We assert on real AST shapes the parser refuses today as a proxy
  // for the fail-closed default — `INSERT_NODE`, `UPDATE_NODE`,
  // `COPY_NODE`, etc. all hit the json_serialize_sql refusal first;
  // the structural allowlist is a second line of defense for any node
  // that DOES get serialised but isn't on our allowlist.

  it("only allows SELECT_NODE / SET_OPERATION_NODE / RECURSIVE_CTE_NODE at the top level", async () => {
    // INSERT/UPDATE/DELETE/COPY are caught by json_serialize_sql
    // refusing non-SELECT statements; this assertion documents the
    // top-level allowlist as the second line of defense.
    expect(await validateSqlAst("SELECT 1", MCP)).toBeNull();
    expect(await validateSqlAst("SELECT 1 UNION SELECT 2", MCP)).toBeNull();
    expect(
      await validateSqlAst(
        "WITH RECURSIVE r(n) AS (SELECT 1 UNION SELECT n+1 FROM r WHERE n<5) SELECT * FROM r",
        MCP,
      ),
    ).toBeNull();
  });
});
