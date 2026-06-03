import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import git from "isomorphic-git";
import fs from "node:fs";

vi.mock("./duckdb", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const getProjectInstance = vi.fn();
  return {
    ...actual,
    hardenConnection: vi.fn(),
    getProjectInstance,
    // Run the op against the mocked instance directly. The real wrapper's
    // dispose/rebuild-on-fatal-error behaviour is exercised in duckdb.test.ts;
    // here it only needs to hand the op whatever getProjectInstance resolves to.
    withRecoverableProjectInstance: vi.fn(
      async (
        _projectId: string,
        _connections: unknown,
        _options: unknown,
        op: (instance: unknown) => Promise<unknown>,
      ) => op(await getProjectInstance()),
    ),
    materialiseModelViews: vi.fn(),
    getAttachedCatalogSlugs: vi.fn().mockReturnValue([]),
  };
});

vi.mock("../config/env", () => ({
  getEnv: vi.fn(() => ({
    ENCRYPTION_KEY: "",
    projectsDir: "/tmp/agent-tools-test-projects",
    AGENT_MODEL: "gpt-4",
    AGENT_API_KEY: "test",
    AGENT_API_BASE_URL: "https://api.test",
    AGENT_MAX_RETRIES: 3,
    AGENT_REQUEST_TIMEOUT: 300,
  })),
}));

vi.mock("../infra/db", () => ({
  connectDB: vi.fn(),
}));

vi.mock("../models/index", () => ({
  Connection: { find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }) },
  TestCase: {},
}));

const { mockGetSemanticModel } = vi.hoisted(() => ({
  mockGetSemanticModel: vi.fn(),
}));
vi.mock("./semantic-model-files", () => {
  class SemanticModelFileService {
    get = mockGetSemanticModel;
  }
  return { SemanticModelFileService };
});

import {
  buildSystemPrompt,
  makeDiscardAllChangesTool,
  makeExecuteQueryTool,
  makeRevertFileTool,
  makeRunModelQueryTool,
} from "./agent-tools";
import { SEMANTIC_MODEL_AGENT_PROMPT } from "../prompts/index";
import {
  getAttachedCatalogSlugs,
  getProjectInstance,
  hardenConnection,
  materialiseModelViews,
} from "./duckdb";

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

  it("rejects forbidden table functions via the AST validator before any DuckDB call", async () => {
    // Wiring contract: read_parquet evades the lexical regex (no DDL
    // tokens, no semicolons) but the AST validator rejects it. Proves
    // makeExecuteQueryTool actually runs validateSqlAst.
    const tool = makeExecuteQueryTool("proj-1");
    const out = JSON.parse(
      await tool.invoke({ sql: "SELECT * FROM read_parquet('/etc/x.parquet')", params: [] }),
    );
    expect(out.error).toMatch(/read_parquet/);
    expect(getProjectInstance).not.toHaveBeenCalled();
  });

  it("rejects forbidden scalar functions via the AST validator", async () => {
    const tool = makeExecuteQueryTool("proj-1");
    const out = JSON.parse(
      await tool.invoke({ sql: "SELECT pg_read_file('/etc/passwd')", params: [] }),
    );
    expect(out.error).toMatch(/pg_read_file/);
    expect(getProjectInstance).not.toHaveBeenCalled();
  });

  it("permits information_schema queries (agent mode skips BASE_TABLE rules)", async () => {
    // Counterpart to the rejection tests: the agent path explicitly
    // allows information_schema for schema exploration, so the AST
    // validator must NOT reject it.
    const tool = makeExecuteQueryTool("proj-1");
    await tool.invoke({
      sql: "SELECT table_name FROM information_schema.tables",
      params: [],
    });
    expect(getProjectInstance).toHaveBeenCalled();
  });
});

describe("makeExecuteQueryTool description", () => {
  it("describes itself as the schema-exploration tool and points users to runModelQuery for views", () => {
    const t = makeExecuteQueryTool("proj-1");
    expect(t.description).toMatch(/information_schema/);
    expect(t.description).toMatch(/Do NOT use it to test scoped views/);
    expect(t.description).toMatch(/runModelQuery/);
  });

  it("does not mention the internal _scope_ schema name", () => {
    const t = makeExecuteQueryTool("proj-1");
    expect(t.description).not.toMatch(/_scope_/);
  });
});

describe("makeRunModelQueryTool", () => {
  const mockDisconnect = vi.fn();
  const mockResultIterator = (async function* () { /* no rows */ })();
  const mockResult = Object.assign(mockResultIterator, { columnNames: vi.fn().mockReturnValue([]) });
  const mockPrepared = {
    bindVarchar: vi.fn(),
    run: vi.fn().mockResolvedValue(mockResult),
  };
  const mockDb = {
    prepare: vi.fn().mockResolvedValue(mockPrepared),
    disconnectSync: mockDisconnect,
  };
  const mockInstance = { connect: vi.fn().mockResolvedValue(mockDb) };

  beforeEach(() => {
    vi.clearAllMocks();
    (getProjectInstance as ReturnType<typeof vi.fn>).mockResolvedValue(mockInstance);
    (hardenConnection as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (getAttachedCatalogSlugs as ReturnType<typeof vi.fn>).mockReturnValue([]);
    mockGetSemanticModel.mockReset();
    mockDb.prepare.mockResolvedValue(mockPrepared);
  });

  it("rejects non-read-only SQL before any DuckDB call", async () => {
    const t = makeRunModelQueryTool("proj-1");
    const out = JSON.parse(await t.invoke({ modelName: "ecommerce", sql: "DROP TABLE orders", params: [] }));
    expect(out.error).toMatch(/Only SELECT/);
    expect(getProjectInstance).not.toHaveBeenCalled();
  });

  it("rejects SQL that references attached catalogs", async () => {
    (getAttachedCatalogSlugs as ReturnType<typeof vi.fn>).mockReturnValue(["shopify"]);
    const t = makeRunModelQueryTool("proj-1");
    const out = JSON.parse(
      await t.invoke({ modelName: "ecommerce", sql: "SELECT * FROM shopify.public.orders", params: [] }),
    );
    expect(out.error).toMatch(/catalog/);
    expect(getProjectInstance).not.toHaveBeenCalled();
  });

  it("rejects SQL that explicitly references _scope_*", async () => {
    const t = makeRunModelQueryTool("proj-1");
    const out = JSON.parse(
      await t.invoke({ modelName: "ecommerce", sql: 'SELECT * FROM _scope_ecommerce.orders', params: [] }),
    );
    expect(out.error).toMatch(/_scope_/);
    expect(getProjectInstance).not.toHaveBeenCalled();
  });

  it("rejects quoted system schemas the regex layer would miss (AST wiring)", async () => {
    // Wiring contract: makeRunModelQueryTool runs the AST validator in
    // 'mcp' mode. `"information_schema"."tables"` slips past the
    // lexical regex (no banned tokens, no semicolons) but the AST
    // validator rejects it. If this assertion fires, the validator is
    // not wired into the agent's runModelQuery path.
    const t = makeRunModelQueryTool("proj-1");
    const out = JSON.parse(
      await t.invoke({
        modelName: "ecommerce",
        sql: 'SELECT * FROM "information_schema"."tables"',
        params: [],
      }),
    );
    expect(out.error).toMatch(/information_schema/i);
    expect(getProjectInstance).not.toHaveBeenCalled();
  });

  it("returns a clear error when the model is not found", async () => {
    mockGetSemanticModel.mockResolvedValue(null);
    const t = makeRunModelQueryTool("proj-1");
    const out = JSON.parse(
      await t.invoke({ modelName: "missing", sql: 'SELECT * FROM "orders"', params: [] }),
    );
    expect(out.error).toMatch(/not found/);
  });

  it("reports datasets that are incomplete (no view_query AND not enough metadata to infer one) and does not run the query", async () => {
    mockGetSemanticModel.mockResolvedValue({ name: "ecommerce", datasets: [{ name: "orders" }, { name: "customers" }] });
    (materialiseModelViews as ReturnType<typeof vi.fn>).mockResolvedValue({
      materialised: ["orders"],
      inferred: [],
      missingViewQuery: ["customers"],
      failed: [],
    });
    const t = makeRunModelQueryTool("proj-1");
    const out = JSON.parse(
      await t.invoke({ modelName: "ecommerce", sql: 'SELECT * FROM "orders"', params: [] }),
    );
    expect(out.error).toMatch(/customers/);
    // After the inferred-fallback landed, this error fires only when the
    // dataset is genuinely incomplete. The self-correction prompt MUST
    // expose BOTH paths the agent can take — fix the metadata to enable
    // inference, OR author an explicit `view_query`.
    expect(out.error).toMatch(/view_query/);
    expect(out.error).toMatch(/fields/);
    expect(out.error).toMatch(/source/);
    expect(out.error).toMatch(/infer/i);
    // The error is the agent's self-correction prompt — it MUST tell the
    // agent this is its job (not an operator's) and point at the workflow
    // step where the three view_query shapes are documented.
    expect(out.error).toMatch(/your job, not the operator/i);
    expect(out.error).toMatch(/step 4f|workflow step/i);
    expect(mockDb.prepare).not.toHaveBeenCalled();
  });

  it("strips _scope_<modelName>. qualifiers from materialisation failures", async () => {
    mockGetSemanticModel.mockResolvedValue({ name: "ecommerce", datasets: [{ name: "orders" }] });
    (materialiseModelViews as ReturnType<typeof vi.fn>).mockResolvedValue({
      materialised: [],
      inferred: [],
      missingViewQuery: [],
      failed: [{ dataset: "orders", error: 'Column "_scope_ecommerce.orders.foo" does not exist' }],
    });
    const t = makeRunModelQueryTool("proj-1");
    const out = JSON.parse(
      await t.invoke({ modelName: "ecommerce", sql: 'SELECT * FROM "orders"', params: [] }),
    );
    expect(out.failures[0].error).toMatch(/orders\.foo/);
    expect(out.failures[0].error).not.toMatch(/_scope_/);
  });

  it("strips _scope_<modelName>. qualifiers from query-time DuckDB error messages", async () => {
    mockGetSemanticModel.mockResolvedValue({ name: "ecommerce", datasets: [{ name: "orders" }] });
    (materialiseModelViews as ReturnType<typeof vi.fn>).mockResolvedValue({
      materialised: ["orders"],
      inferred: [],
      missingViewQuery: [],
      failed: [],
    });
    mockDb.prepare.mockRejectedValueOnce(new Error('Column "_scope_ecommerce.orders.bogus" does not exist'));
    const t = makeRunModelQueryTool("proj-1");
    const out = JSON.parse(
      await t.invoke({ modelName: "ecommerce", sql: 'SELECT bogus FROM "orders"', params: [] }),
    );
    expect(out.error).toMatch(/orders\.bogus/);
    expect(out.error).not.toMatch(/_scope_/);
  });
});

describe("runModelQuery surfaces are clean of internal _scope_ naming", () => {
  it("tool description does not mention _scope_", () => {
    const t = makeRunModelQueryTool("proj-1");
    expect(t.description).not.toMatch(/_scope_/);
  });

  it("rendered system prompt does not mention _scope_", () => {
    const prompt = buildSystemPrompt([]);
    expect(prompt).toContain(SEMANTIC_MODEL_AGENT_PROMPT);
    expect(prompt).not.toMatch(/_scope_/);
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
