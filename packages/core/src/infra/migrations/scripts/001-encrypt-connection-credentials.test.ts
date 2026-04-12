import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Model, Document } from "mongoose";

vi.mock("../../../config/env", () => ({
  getEnv: vi.fn(() => ({ ENCRYPTION_KEY: "" })),
}));

vi.mock("../../crypto", () => ({
  encrypt: vi.fn((val: string) => `enc_${val}`),
}));

import { getEnv } from "../../../config/env";
import migration from "./001-encrypt-connection-credentials";

const mockGetEnv = vi.mocked(getEnv);

function createMockModel(docs: Record<string, unknown>[]): Model<Document> {
  return {
    find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(docs) }),
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: docs.length }),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
  } as unknown as Model<Document>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("001-encrypt-connection-credentials", () => {
  it("has correct metadata", () => {
    expect(migration.model).toBe("Connection");
    expect(migration.version).toBe(1);
  });

  it("returns 0 when no outdated documents exist", async () => {
    const model = createMockModel([]);
    const count = await migration.up(model);
    expect(count).toBe(0);
  });

  it("skips encryption and bumps version when ENCRYPTION_KEY is absent", async () => {
    mockGetEnv.mockReturnValue({ ENCRYPTION_KEY: "" } as any);
    const docs = [
      { _id: "1", connectionConfig: { password: "secret" } },
      { _id: "2", connectionConfig: { uri: "postgres://u:p@h/d" } },
    ];
    const model = createMockModel(docs);
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const count = await migration.up(model);

    expect(count).toBe(2);
    expect(model.updateMany).toHaveBeenCalledWith(
      expect.anything(),
      { $set: { _schemaVersion: 1 } },
    );
    expect(model.updateOne).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("encrypts plaintext password and uri", async () => {
    mockGetEnv.mockReturnValue({ ENCRYPTION_KEY: "test-key" } as any);
    const docs = [
      { _id: "1", connectionConfig: { host: "localhost", password: "secret", uri: "postgres://u:p@h/d" } },
    ];
    const model = createMockModel(docs);

    const count = await migration.up(model);

    expect(count).toBe(1);
    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: "1" },
      {
        $set: {
          _schemaVersion: 1,
          connectionConfig: {
            host: "localhost",
            password: "enc_secret",
            uri: "enc_postgres://u:p@h/d",
          },
        },
      },
    );
  });

  it("skips already-encrypted values (hex ciphertext)", async () => {
    mockGetEnv.mockReturnValue({ ENCRYPTION_KEY: "test-key" } as any);
    const hexCiphertext = "a".repeat(60);
    const docs = [
      { _id: "1", connectionConfig: { password: hexCiphertext } },
    ];
    const model = createMockModel(docs);

    await migration.up(model);

    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: "1" },
      { $set: { _schemaVersion: 1 } },
    );
  });

  it("handles documents with no password or uri", async () => {
    mockGetEnv.mockReturnValue({ ENCRYPTION_KEY: "test-key" } as any);
    const docs = [
      { _id: "1", connectionConfig: { host: "localhost", database: "/path/to/db" } },
    ];
    const model = createMockModel(docs);

    const count = await migration.up(model);

    expect(count).toBe(1);
    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: "1" },
      { $set: { _schemaVersion: 1 } },
    );
  });

  it("handles documents with missing connectionConfig", async () => {
    mockGetEnv.mockReturnValue({ ENCRYPTION_KEY: "test-key" } as any);
    const docs = [{ _id: "1" }];
    const model = createMockModel(docs);

    const count = await migration.up(model);

    expect(count).toBe(1);
    expect(model.updateOne).toHaveBeenCalledWith(
      { _id: "1" },
      { $set: { _schemaVersion: 1 } },
    );
  });
});
