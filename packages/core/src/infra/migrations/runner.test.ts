import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import mongoose from "mongoose";

vi.mock("./registry", () => ({
  getMigrations: vi.fn(() => []),
}));

import { runMigrations } from "./runner";
import { getMigrations } from "./registry";

const mockGetMigrations = vi.mocked(getMigrations);

let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

function createMockModel(docs: Record<string, unknown>[]) {
  return {
    countDocuments: vi.fn().mockResolvedValue(docs.length),
    find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(docs) }),
    updateMany: vi.fn().mockResolvedValue({ modifiedCount: docs.length }),
    updateOne: vi.fn().mockResolvedValue({ modifiedCount: 1 }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const key of Object.keys(mongoose.models)) {
    delete (mongoose.models as Record<string, unknown>)[key];
  }
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

describe("runMigrations", () => {
  it("logs startup and completion summary", async () => {
    mockGetMigrations.mockReturnValue([]);
    await runMigrations();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Starting schema migrations"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("No migration scripts registered"));
  });

  it("stamps _schemaVersion: 0 on documents missing the field", async () => {
    const mockModel = createMockModel([]);
    mockModel.updateMany.mockResolvedValue({ modifiedCount: 3 });
    (mongoose.models as Record<string, unknown>).SomeModel = mockModel;
    mockGetMigrations.mockReturnValue([]);

    await runMigrations();

    expect(mockModel.updateMany).toHaveBeenCalledWith(
      { _schemaVersion: { $exists: false } },
      { $set: { _schemaVersion: 0 } },
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Stamped _schemaVersion: 0 on 3 SomeModel"));
  });

  it("skips stamping when all documents already have _schemaVersion", async () => {
    const mockModel = createMockModel([]);
    mockModel.updateMany.mockResolvedValue({ modifiedCount: 0 });
    (mongoose.models as Record<string, unknown>).SomeModel = mockModel;
    mockGetMigrations.mockReturnValue([]);

    await runMigrations();

    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining("Stamped _schemaVersion: 0 on"));
  });

  it("skips when model is not registered in mongoose", async () => {
    mockGetMigrations.mockReturnValue([{
      model: "NonExistent",
      version: 1,
      description: "test",
      up: vi.fn(),
    }]);
    await runMigrations();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("NonExistent"));
  });

  it("runs migration on outdated documents", async () => {
    const mockModel = createMockModel([{ _id: "1", _schemaVersion: 0 }]);
    (mongoose.models as Record<string, unknown>).TestModel = mockModel;

    const upFn = vi.fn().mockResolvedValue(1);
    mockGetMigrations.mockReturnValue([{
      model: "TestModel",
      version: 1,
      description: "test migration",
      up: upFn,
    }]);

    await runMigrations();
    expect(upFn).toHaveBeenCalledWith(mockModel);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("All migrations completed successfully: 1 script(s)"));
  });

  it("skips migration when all documents are current", async () => {
    const mockModel = createMockModel([]);
    mockModel.countDocuments.mockResolvedValue(0);
    (mongoose.models as Record<string, unknown>).TestModel = mockModel;

    const upFn = vi.fn();
    mockGetMigrations.mockReturnValue([{
      model: "TestModel",
      version: 1,
      description: "test",
      up: upFn,
    }]);

    await runMigrations();
    expect(upFn).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Schema is up to date"));
  });

  it("stamps multiple models and reports total", async () => {
    const modelA = createMockModel([]);
    modelA.updateMany.mockResolvedValue({ modifiedCount: 2 });
    const modelB = createMockModel([]);
    modelB.updateMany.mockResolvedValue({ modifiedCount: 5 });
    (mongoose.models as Record<string, unknown>).Alpha = modelA;
    (mongoose.models as Record<string, unknown>).Beta = modelB;
    mockGetMigrations.mockReturnValue([]);

    await runMigrations();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Stamped 7 document(s)"));
  });

  it("runs multiple versions for the same model in order", async () => {
    const mockModel = createMockModel([]);
    mockModel.countDocuments.mockResolvedValue(1);
    (mongoose.models as Record<string, unknown>).TestModel = mockModel;

    const calls: number[] = [];
    const upV1 = vi.fn().mockImplementation(() => { calls.push(1); return Promise.resolve(1); });
    const upV2 = vi.fn().mockImplementation(() => { calls.push(2); return Promise.resolve(1); });

    mockGetMigrations.mockReturnValue([
      { model: "TestModel", version: 1, description: "v1", up: upV1 },
      { model: "TestModel", version: 2, description: "v2", up: upV2 },
    ]);

    await runMigrations();

    expect(calls).toEqual([1, 2]);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("2 script(s) ran"));
  });

  it("continues after a migration error and reports failures", async () => {
    const mockModel1 = createMockModel([{ _id: "1" }]);
    mockModel1.countDocuments.mockResolvedValue(1);
    const mockModel2 = createMockModel([{ _id: "2" }]);
    mockModel2.countDocuments.mockResolvedValue(1);
    (mongoose.models as Record<string, unknown>).Model1 = mockModel1;
    (mongoose.models as Record<string, unknown>).Model2 = mockModel2;

    const failingUp = vi.fn().mockRejectedValue(new Error("boom"));
    const succeedingUp = vi.fn().mockResolvedValue(1);

    mockGetMigrations.mockReturnValue([
      { model: "Model1", version: 1, description: "fails", up: failingUp },
      { model: "Model2", version: 1, description: "succeeds", up: succeedingUp },
    ]);

    await runMigrations();

    expect(failingUp).toHaveBeenCalled();
    expect(succeedingUp).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("FAILED: Model1 v1"), expect.any(Error));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("1 succeeded, 1 failed"));
  });
});
