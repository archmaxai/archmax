import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getDuckdbConsoleSetup: vi.fn(),
  executeDuckdbConsoleQuery: vi.fn(),
  installDuckdbConsoleExtension: vi.fn(),
  connectDB: vi.fn(),
  projectFindById: vi.fn(),
}));

vi.mock("@archmax/core/infra/db", () => ({ connectDB: mocks.connectDB }));
vi.mock("@archmax/core/models/index", () => ({
  Project: { findById: mocks.projectFindById },
}));
vi.mock("@archmax/core/services/duckdb-console", () => ({
  getDuckdbConsoleSetup: mocks.getDuckdbConsoleSetup,
  executeDuckdbConsoleQuery: mocks.executeDuckdbConsoleQuery,
  installDuckdbConsoleExtension: mocks.installDuckdbConsoleExtension,
}));

import { createTestApp, jsonBody } from "../test-utils/api-client";
import duckdbConsoleRoute from "./duckdb-console";

const app = createTestApp("/api/projects/:projectId/duckdb-console", duckdbConsoleRoute);
const BASE = "/api/projects/proj1/duckdb-console";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.projectFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: "proj1" }) });
});

describe("GET /api/projects/:projectId/duckdb-console/setup", () => {
  it("returns setup payload", async () => {
    mocks.getDuckdbConsoleSetup.mockResolvedValue({
      preinstalledExtensions: [{ name: "postgres", installSql: "INSTALL postgres", loadSql: "LOAD postgres" }],
      connections: [],
      exampleQuery: "-- placeholder",
    });
    const res = await app.request(`${BASE}/setup`);
    expect(res.status).toBe(200);
    const body = await jsonBody<{ exampleQuery: string }>(res);
    expect(body.exampleQuery).toContain("placeholder");
  });

  it("returns 404 when project missing", async () => {
    mocks.projectFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await app.request(`${BASE}/setup`);
    expect(res.status).toBe(404);
  });
});

describe("POST /api/projects/:projectId/duckdb-console/query", () => {
  it("returns query results", async () => {
    mocks.executeDuckdbConsoleQuery.mockResolvedValue({
      columns: ["n"],
      rows: [{ n: 1 }],
      rowCount: 1,
      durationMs: 5,
    });
    const res = await app.request(`${BASE}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "SELECT 1 AS n" }),
    });
    expect(res.status).toBe(200);
    const body = await jsonBody<{ rows: Array<{ n: number }> }>(res);
    expect(body.rows[0].n).toBe(1);
  });

  it("returns 400 for disallowed SQL", async () => {
    mocks.executeDuckdbConsoleQuery.mockRejectedValue(
      new Error("Statement type INSERT is not allowed in the federation console"),
    );
    const res = await app.request(`${BASE}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "INSERT INTO t VALUES (1)" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/projects/:projectId/duckdb-console/extensions", () => {
  it("installs extension", async () => {
    mocks.installDuckdbConsoleExtension.mockResolvedValue({ extension: "spatial" });
    const res = await app.request(`${BASE}/extensions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "INSTALL spatial FROM community" }),
    });
    expect(res.status).toBe(200);
    const body = await jsonBody<{ ok: boolean; extension: string }>(res);
    expect(body).toEqual({ ok: true, extension: "spatial" });
  });

  it("returns 400 for non-extension SQL", async () => {
    mocks.installDuckdbConsoleExtension.mockRejectedValue(
      new Error("SQL must be INSTALL <extension> [FROM community] or LOAD <extension>"),
    );
    const res = await app.request(`${BASE}/extensions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql: "SELECT 1" }),
    });
    expect(res.status).toBe(400);
  });
});
