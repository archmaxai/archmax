import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  connectDB: vi.fn(),
  customFirebirdEnabled: vi.fn(() => false),
  projectFindById: vi.fn(),
  connectionFindOne: vi.fn(),
  connectionCreate: vi.fn(),
  connectionFindOneAndUpdate: vi.fn(),
}));

vi.mock("@archmax/core/infra/db", () => ({ connectDB: mocks.connectDB }));
vi.mock("@archmax/core/config/env", () => ({
  getEnv: vi.fn(() => ({ ENCRYPTION_KEY: "" })),
  customFirebirdEnabled: mocks.customFirebirdEnabled,
}));
vi.mock("@archmax/core/models/index", () => ({
  Connection: {
    findOne: mocks.connectionFindOne,
    create: mocks.connectionCreate,
    findOneAndUpdate: mocks.connectionFindOneAndUpdate,
  },
  Project: { findById: mocks.projectFindById },
  CONNECTION_TYPES: ["postgres", "mysql", "mssql", "sqlite", "duckdb", "iceberg", "firebird"],
  SLUG_PATTERN: /^[a-zA-Z_][a-zA-Z0-9_]*$/,
  slugifyConnectionName: (s: string) => s.toLowerCase(),
}));
vi.mock("@archmax/core/services/duckdb", () => ({
  deleteProjectDuckdbFile: vi.fn(),
  disposeProjectInstance: vi.fn(),
  getProjectInstance: vi.fn(),
  testSingleConnection: vi.fn(),
  withQueryTimeout: vi.fn(async (_db: unknown, op: () => Promise<unknown>) => op()),
}));

import { createTestApp, jsonBody } from "../test-utils/api-client";
import connectionsRoute from "./connections";

const app = createTestApp("/api/projects/:projectId/connections", connectionsRoute);
const BASE = "/api/projects/proj1/connections";

function postFirebird(charset?: string) {
  return app.request(BASE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "fb",
      type: "firebird",
      connectionConfig: { host: "h", database: "d", user: "u", password: "p", ...(charset ? { charset } : {}) },
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.customFirebirdEnabled.mockReturnValue(false);
  mocks.projectFindById.mockReturnValue({ lean: vi.fn().mockResolvedValue({ _id: "proj1" }) });
});

describe("connections route — firebird gate", () => {
  it("rejects creating a firebird connection with 400 when disabled", async () => {
    const res = await postFirebird();
    expect(res.status).toBe(400);
    const body = await jsonBody<{ error: string }>(res);
    expect(body.error).toMatch(/not enabled/i);
    expect(mocks.connectionCreate).not.toHaveBeenCalled();
  });

  it("accepts creating a firebird connection (incl. charset) when enabled", async () => {
    mocks.customFirebirdEnabled.mockReturnValue(true);
    mocks.connectionCreate.mockResolvedValue({
      toObject: () => ({ _id: "c1", name: "fb", type: "firebird", connectionConfig: { charset: "WIN1252" } }),
    });
    const res = await postFirebird("WIN1252");
    expect(res.status).toBe(201);
    expect(mocks.connectionCreate).toHaveBeenCalledTimes(1);
    const created = mocks.connectionCreate.mock.calls[0][0] as { connectionConfig: { charset?: string } };
    expect(created.connectionConfig.charset).toBe("WIN1252");
  });

  it("rejects updating a connection to firebird with 400 when disabled", async () => {
    mocks.connectionFindOne.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: "c1", project: "proj1", connectionConfig: {} }),
    });
    const res = await app.request(`${BASE}/c1`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "firebird" }),
    });
    expect(res.status).toBe(400);
    expect(mocks.connectionFindOneAndUpdate).not.toHaveBeenCalled();
  });
});
