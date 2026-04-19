import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import git from "isomorphic-git";
import fs from "node:fs";

vi.mock("./duckdb", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    hardenConnection: vi.fn(),
    getProjectInstance: vi.fn(),
  };
});

vi.mock("../infra/db", () => ({
  connectDB: vi.fn(),
}));

vi.mock("../models/index", () => ({
  Connection: { find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) },
  TestCase: {},
}));

import { makeExecuteQueryTool, makeRevertFileTool, makeDiscardAllChangesTool } from "./agent-tools";
import { hardenConnection, getProjectInstance } from "./duckdb";

describe("makeExecuteQueryTool", () => {
  const mockDisconnect = vi.fn();
  const mockDb = { prepare: vi.fn(), disconnectSync: mockDisconnect };
  const mockInstance = { connect: vi.fn().mockResolvedValue(mockDb) };

  beforeEach(() => {
    vi.clearAllMocks();
    (getProjectInstance as ReturnType<typeof vi.fn>).mockResolvedValue(mockInstance);
    (hardenConnection as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    mockDb.prepare.mockRejectedValue(new Error("test abort"));
  });

  it("calls hardenConnection before executing a query", async () => {
    const tool = makeExecuteQueryTool("proj-1");

    await tool.invoke({ sql: "SELECT 1", params: [] });

    expect(hardenConnection).toHaveBeenCalledTimes(1);
    expect(hardenConnection).toHaveBeenCalledWith(mockDb, undefined, { allowExternalAccess: false });

    const hardenOrder = (hardenConnection as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const prepareOrder = mockDb.prepare.mock.invocationCallOrder[0];
    expect(hardenOrder).toBeLessThan(prepareOrder);
  });
});

describe("makeRevertFileTool", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "revert-tool-"));
    await git.init({ fs, dir: tmpDir, defaultBranch: "main" });
    await writeFile(join(tmpDir, "file.txt"), "committed", "utf-8");
    await git.add({ fs, dir: tmpDir, filepath: "file.txt" });
    await git.commit({
      fs,
      dir: tmpDir,
      message: "init",
      author: { name: "test", email: "test@test" },
    });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns a tool with name 'revert_file'", () => {
    const t = makeRevertFileTool(tmpDir);
    expect(t.name).toBe("revert_file");
  });

  it("restores a modified file and returns JSON", async () => {
    await writeFile(join(tmpDir, "file.txt"), "changed", "utf-8");
    const t = makeRevertFileTool(tmpDir);
    const result = JSON.parse(await t.invoke({ path: "file.txt" }));
    expect(result.reverted).toBe("file.txt");
    expect(result.action).toBe("restored to last commit");

    const content = await readFile(join(tmpDir, "file.txt"), "utf-8");
    expect(content).toBe("committed");
  });

  it("returns error JSON for nonexistent file", async () => {
    const t = makeRevertFileTool(tmpDir);
    const result = JSON.parse(await t.invoke({ path: "nope.txt" }));
    expect(result.error).toMatch(/not found/);
  });

  it("returns error JSON for path traversal", async () => {
    const t = makeRevertFileTool(tmpDir);
    const result = JSON.parse(await t.invoke({ path: "../../etc/passwd" }));
    expect(result.error).toMatch(/Path traversal/);
  });
});

describe("makeDiscardAllChangesTool", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "discard-tool-"));
    await git.init({ fs, dir: tmpDir, defaultBranch: "main" });
    await writeFile(join(tmpDir, "tracked.txt"), "original", "utf-8");
    await git.add({ fs, dir: tmpDir, filepath: "tracked.txt" });
    await git.commit({
      fs,
      dir: tmpDir,
      message: "init",
      author: { name: "test", email: "test@test" },
    });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns a tool with name 'discard_all_changes'", () => {
    const t = makeDiscardAllChangesTool(tmpDir);
    expect(t.name).toBe("discard_all_changes");
  });

  it("returns success JSON", async () => {
    const t = makeDiscardAllChangesTool(tmpDir);
    const result = JSON.parse(await t.invoke({}));
    expect(result.ok).toBe(true);
    expect(result.message).toContain("discarded");
  });
});
