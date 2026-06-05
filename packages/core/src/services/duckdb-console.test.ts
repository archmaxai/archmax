import { describe, it, expect, vi } from "vitest";

vi.mock("../config/env", () => ({
  getEnv: vi.fn(() => ({ ENCRYPTION_KEY: "" })),
}));
import {
  validateConsoleQuerySql,
  parseExtensionSql,
  buildRedactedAttachSql,
  PREINSTALLED_EXTENSIONS,
} from "./duckdb-console";
import type { IConnectionDocument } from "../models/Connection";

describe("validateConsoleQuerySql", () => {
  it("allows SELECT", () => {
    expect(() => validateConsoleQuerySql("SELECT 1")).not.toThrow();
  });

  it("allows EXPLAIN ANALYZE", () => {
    expect(() => validateConsoleQuerySql("EXPLAIN ANALYZE SELECT 1")).not.toThrow();
  });

  it("rejects INSERT", () => {
    expect(() => validateConsoleQuerySql("INSERT INTO t VALUES (1)")).toThrow(/not allowed/);
  });

  it("rejects multi-statement batches", () => {
    expect(() => validateConsoleQuerySql("SELECT 1; SELECT 2")).toThrow(/single SQL/);
  });

  it("rejects empty SQL", () => {
    expect(() => validateConsoleQuerySql("   ")).toThrow(/empty/);
  });
});

describe("parseExtensionSql", () => {
  it("parses INSTALL FROM community", () => {
    expect(parseExtensionSql("INSTALL spatial FROM community")).toEqual({
      extension: "spatial",
      loadOnly: false,
      fromCommunity: true,
    });
  });

  it("parses LOAD", () => {
    expect(parseExtensionSql("LOAD spatial")).toEqual({
      extension: "spatial",
      loadOnly: true,
      fromCommunity: false,
    });
  });

  it("rejects invalid extension names", () => {
    expect(() => parseExtensionSql("INSTALL ../evil FROM community")).toThrow();
  });

  it("rejects SELECT", () => {
    expect(() => parseExtensionSql("SELECT 1")).toThrow();
  });
});

describe("buildRedactedAttachSql", () => {
  it("redacts postgres password in attach string", () => {
    const conn = {
      type: "postgres",
      slug: "shop",
      connectionConfig: {
        host: "localhost",
        port: 5432,
        database: "db",
        user: "u",
        password: "secret",
      },
    } as IConnectionDocument;
    const sql = buildRedactedAttachSql(conn);
    expect(sql).toContain("AS shop");
    expect(sql).not.toContain("secret");
    expect(sql).toContain("password=***");
  });

  it("lists preinstalled extensions with mssql community install", () => {
    const mssql = PREINSTALLED_EXTENSIONS.find((e) => e.name === "mssql");
    expect(mssql?.fromCommunity).toBe(true);
  });
});
