import { describe, it, expect } from "vitest";
import { validateReadOnlySQL } from "@archmax/core/services/agent";

describe("validateReadOnlySQL", () => {
  describe("allowed queries", () => {
    it("allows simple SELECT", () => {
      expect(validateReadOnlySQL("SELECT * FROM users")).toBeNull();
    });

    it("allows SELECT with leading whitespace", () => {
      expect(validateReadOnlySQL("  SELECT 1")).toBeNull();
    });

    it("allows WITH (CTE) queries", () => {
      expect(validateReadOnlySQL("WITH cte AS (SELECT 1) SELECT * FROM cte")).toBeNull();
    });

    it("allows EXPLAIN", () => {
      expect(validateReadOnlySQL("EXPLAIN SELECT * FROM users")).toBeNull();
    });

    it("allows DESCRIBE", () => {
      expect(validateReadOnlySQL("DESCRIBE users")).toBeNull();
    });

    it("allows SHOW", () => {
      expect(validateReadOnlySQL("SHOW TABLES")).toBeNull();
    });

    it("allows PRAGMA", () => {
      expect(validateReadOnlySQL("PRAGMA version")).toBeNull();
    });

    it("is case insensitive", () => {
      expect(validateReadOnlySQL("select * from t")).toBeNull();
      expect(validateReadOnlySQL("Select * FROM t")).toBeNull();
    });

    it("allows SELECT with trailing semicolon", () => {
      expect(validateReadOnlySQL("SELECT 1;")).toBeNull();
    });
  });

  describe("blocked queries", () => {
    it("blocks INSERT", () => {
      expect(validateReadOnlySQL("INSERT INTO users VALUES (1)")).not.toBeNull();
    });

    it("blocks UPDATE", () => {
      expect(validateReadOnlySQL("UPDATE users SET name = 'x'")).not.toBeNull();
    });

    it("blocks DELETE", () => {
      expect(validateReadOnlySQL("DELETE FROM users")).not.toBeNull();
    });

    it("blocks DROP", () => {
      expect(validateReadOnlySQL("DROP TABLE users")).not.toBeNull();
    });

    it("blocks CREATE", () => {
      expect(validateReadOnlySQL("CREATE TABLE t (id int)")).not.toBeNull();
    });

    it("blocks ALTER", () => {
      expect(validateReadOnlySQL("ALTER TABLE users ADD col int")).not.toBeNull();
    });

    it("blocks TRUNCATE", () => {
      expect(validateReadOnlySQL("TRUNCATE TABLE users")).not.toBeNull();
    });

    it("blocks COPY", () => {
      expect(validateReadOnlySQL("COPY users TO '/tmp/out.csv'")).not.toBeNull();
    });

    it("blocks ATTACH", () => {
      expect(validateReadOnlySQL("ATTACH '/tmp/other.db' AS other")).not.toBeNull();
    });
  });

  describe("multi-statement prevention", () => {
    it("blocks SELECT followed by DROP", () => {
      expect(validateReadOnlySQL("SELECT 1; DROP TABLE users")).not.toBeNull();
    });

    it("blocks SELECT followed by INSERT", () => {
      expect(validateReadOnlySQL("SELECT 1; INSERT INTO t VALUES (1)")).not.toBeNull();
    });

    it("blocks multiple SELECTs (still multi-statement)", () => {
      expect(validateReadOnlySQL("SELECT 1; SELECT 2")).not.toBeNull();
    });

    it("allows semicolons inside string literals (edge case)", () => {
      // This is a known limitation — the regex doesn't parse SQL strings.
      // A semicolon inside a string literal followed by text will be falsely blocked.
      // This is an acceptable trade-off for security.
      const result = validateReadOnlySQL("SELECT 'a;b' FROM t");
      expect(result).not.toBeNull(); // false positive, but safe
    });
  });
});
