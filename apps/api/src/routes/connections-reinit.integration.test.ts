import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  projectFindById: vi.fn(),
  connectionFind: vi.fn(),
  disposeProjectInstance: vi.fn(),
  deleteProjectDuckdbFile: vi.fn(),
  getProjectInstance: vi.fn(),
  testSingleConnection: vi.fn(),
  withQueryTimeout: vi.fn(async (_db: unknown, op: () => Promise<unknown>) => op()),
}));

vi.mock("@archmax/core/infra/db", () => ({ connectDB: mocks.connectDB }));
vi.mock("@archmax/core/config/env", () => ({
  getEnv: vi.fn(() => ({ ENCRYPTION_KEY: "" })),
}));
vi.mock("@archmax/core/models/index", () => ({
  Connection: {
    find: mocks.connectionFind,
  },
  Project: {
    findById: mocks.projectFindById,
  },
  CONNECTION_TYPES: ["postgres", "mysql", "mssql", "sqlite", "duckdb", "iceberg"],
  SLUG_PATTERN: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
  slugifyConnectionName: (s: string) => s.toLowerCase(),
}));
vi.mock("@archmax/core/services/duckdb", () => ({
  disposeProjectInstance: mocks.disposeProjectInstance,
  deleteProjectDuckdbFile: mocks.deleteProjectDuckdbFile,
  getProjectInstance: mocks.getProjectInstance,
  testSingleConnection: mocks.testSingleConnection,
  withQueryTimeout: mocks.withQueryTimeout,
  safeDisconnect: vi.fn((db: { disconnectSync?: () => void }) => db.disconnectSync?.()),
}));

import { createTestApp, jsonBody } from "../test-utils/api-client";
import connectionsRoute from "./connections";

const app = createTestApp("/api/projects/:projectId/connections", connectionsRoute);
const BASE = "/api/projects/proj1/connections/reinit";

function mockInstanceReturningRows(rowCounts: number[]) {
  const chunks = rowCounts.map((n) => ({ rowCount: n }));
  const result = {
    async *[Symbol.asyncIterator]() { yield* chunks; },
  };
  const db = {
    run: vi.fn(async () => result),
    disconnectSync: vi.fn(),
  };
  const instance = { connect: vi.fn(async () => db) };
  mocks.getProjectInstance.mockResolvedValue(instance);
  return { db, instance };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withQueryTimeout.mockImplementation(async (_db: unknown, op: () => Promise<unknown>) => op());
  mocks.connectionFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
});

describe("POST /api/projects/:projectId/connections/reinit", () => {
  it("returns 404 when the project does not exist", async () => {
    mocks.projectFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue(null) });
    const res = await app.request(BASE, { method: "POST" });
    expect(res.status).toBe(404);
    expect(mocks.disposeProjectInstance).not.toHaveBeenCalled();
  });

  it("disposes the cached instance, re-attaches connections, and returns the table count", async () => {
    mocks.projectFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: "proj1" }) });
    mocks.connectionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: "c1", slug: "pg" }]),
    });
    const { db } = mockInstanceReturningRows([8, 4]);

    const res = await app.request(BASE, { method: "POST" });
    expect(res.status).toBe(200);

    const body = await jsonBody<{ ok: true; tableCount: number }>(res);
    expect(body.ok).toBe(true);
    expect(body.tableCount).toBe(12);
    expect(mocks.disposeProjectInstance).toHaveBeenCalledWith("proj1");
    expect(mocks.getProjectInstance).toHaveBeenCalledWith(
      "proj1",
      [{ _id: "c1", slug: "pg" }],
      { readOnly: true },
    );
    expect(db.run).toHaveBeenCalledWith("SHOW ALL TABLES");
    expect(db.disconnectSync).toHaveBeenCalledTimes(1);
  });

  it("returns 400 with the error message when re-attach fails", async () => {
    mocks.projectFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: "proj1" }) });
    mocks.connectionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([{ _id: "c1", slug: "pg" }]),
    });
    mocks.getProjectInstance.mockRejectedValue(new Error("host unreachable"));

    const res = await app.request(BASE, { method: "POST" });
    expect(res.status).toBe(400);

    const body = await jsonBody<{ ok: false; error: string }>(res);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("host unreachable");
  });

  it("returns 400 when the schema probe fails", async () => {
    mocks.projectFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: "proj1" }) });
    mocks.connectionFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([]),
    });
    const failingDb = {
      run: vi.fn().mockRejectedValue(new Error("probe failed")),
      disconnectSync: vi.fn(),
    };
    mocks.getProjectInstance.mockResolvedValue({ connect: vi.fn(async () => failingDb) });

    const res = await app.request(BASE, { method: "POST" });
    expect(res.status).toBe(400);
    const body = await jsonBody<{ ok: false; error: string }>(res);
    expect(body.ok).toBe(false);
    expect(body.error).toBe("probe failed");
    expect(failingDb.disconnectSync).toHaveBeenCalledTimes(1);
  });

  it("returns zero tables for a project with no active connections", async () => {
    mocks.projectFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: "proj1" }) });
    mocks.connectionFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    mockInstanceReturningRows([]);

    const res = await app.request(BASE, { method: "POST" });
    expect(res.status).toBe(200);
    const body = await jsonBody<{ ok: true; tableCount: number }>(res);
    expect(body.ok).toBe(true);
    expect(body.tableCount).toBe(0);
  });

  it("deletes the duckdb file when reset=true", async () => {
    mocks.projectFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: "proj1" }) });
    mocks.connectionFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    mockInstanceReturningRows([]);

    const res = await app.request(`${BASE}?reset=true`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(mocks.deleteProjectDuckdbFile).toHaveBeenCalledWith("proj1");
  });

  it("does not delete the duckdb file when reset is omitted or false", async () => {
    mocks.projectFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: "proj1" }) });
    mocks.connectionFind.mockReturnValue({ lean: vi.fn().mockResolvedValue([]) });
    mockInstanceReturningRows([]);

    const noFlag = await app.request(BASE, { method: "POST" });
    expect(noFlag.status).toBe(200);
    expect(mocks.deleteProjectDuckdbFile).not.toHaveBeenCalled();

    const explicitFalse = await app.request(`${BASE}?reset=false`, { method: "POST" });
    expect(explicitFalse.status).toBe(200);
    expect(mocks.deleteProjectDuckdbFile).not.toHaveBeenCalled();
  });

  it("rejects non-boolean reset values via zValidator before deleting anything", async () => {
    // The route's `reset` flag triggers a destructive `deleteProjectDuckdbFile`
    // call. Reading it straight off `c.req.query()` (without Zod parsing)
    // would let `reset=evil` and similar inputs flow through unchecked.
    // We pin behaviour: anything other than `true`/`false`/omitted must
    // produce a 400 and MUST NOT call `deleteProjectDuckdbFile`.
    mocks.projectFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: "proj1" }) });

    for (const bad of ["evil", "1", "yes", "TRUE"]) {
      const res = await app.request(`${BASE}?reset=${bad}`, { method: "POST" });
      expect(res.status).toBe(400);
    }
    expect(mocks.deleteProjectDuckdbFile).not.toHaveBeenCalled();
  });
});
