import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { assertSafeSegment, SemanticModelFileService } from "./semantic-model-files";

describe("assertSafeSegment", () => {
  it("accepts valid MongoDB ObjectId hex strings", () => {
    expect(() => assertSafeSegment("507f1f77bcf86cd799439011", "projectId")).not.toThrow();
  });

  it("accepts alphanumeric names", () => {
    expect(() => assertSafeSegment("my-project", "projectId")).not.toThrow();
    expect(() => assertSafeSegment("model_v2", "name")).not.toThrow();
    expect(() => assertSafeSegment("dataset.v1", "name")).not.toThrow();
  });

  it("accepts names starting with a digit", () => {
    expect(() => assertSafeSegment("123abc", "name")).not.toThrow();
  });

  it("rejects path traversal with ..", () => {
    expect(() => assertSafeSegment("..", "projectId")).toThrow(/Invalid projectId/);
    expect(() => assertSafeSegment("../etc", "projectId")).toThrow(/Invalid projectId/);
    expect(() => assertSafeSegment("foo/../bar", "name")).toThrow(/Invalid name/);
  });

  it("rejects absolute paths", () => {
    expect(() => assertSafeSegment("/etc/passwd", "projectId")).toThrow(/Invalid projectId/);
  });

  it("rejects empty strings", () => {
    expect(() => assertSafeSegment("", "projectId")).toThrow(/Invalid projectId/);
  });

  it("rejects strings starting with a dot", () => {
    expect(() => assertSafeSegment(".hidden", "name")).toThrow(/Invalid name/);
  });

  it("rejects strings starting with a dash", () => {
    expect(() => assertSafeSegment("-flag", "name")).toThrow(/Invalid name/);
  });

  it("rejects strings with slashes", () => {
    expect(() => assertSafeSegment("a/b", "name")).toThrow(/Invalid name/);
    expect(() => assertSafeSegment("a\\b", "name")).toThrow(/Invalid name/);
  });

  it("rejects strings with spaces or special characters", () => {
    expect(() => assertSafeSegment("hello world", "name")).toThrow(/Invalid name/);
    expect(() => assertSafeSegment("name;rm -rf", "name")).toThrow(/Invalid name/);
    expect(() => assertSafeSegment("$HOME", "name")).toThrow(/Invalid name/);
  });
});

describe("SemanticModelFileService.updateModelExtensions", () => {
  let tmpDir: string;
  let svc: SemanticModelFileService;
  const projectId = "proj1";

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "smfs-test-"));
    svc = new SemanticModelFileService(tmpDir);
    const srcDir = join(tmpDir, projectId, "src");
    await mkdir(srcDir, { recursive: true });
    const rootYaml = yaml.dump({
      name: "test-model",
      description: "A test model",
      relationships: [],
      metrics: [],
    });
    await writeFile(join(srcDir, "test-model.yaml"), rootYaml, "utf-8");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("updates custom_extensions on the root file", async () => {
    const extensions = [
      { vendor_name: "COMMON", data: '{"dataset_groups":[{"id":"g1","name":"Sales","datasets":["orders"]}]}' },
    ];
    const ok = await svc.updateModelExtensions(projectId, "test-model", extensions);
    expect(ok).toBe(true);

    const raw = await readFile(join(tmpDir, projectId, "src", "test-model.yaml"), "utf-8");
    const parsed = yaml.load(raw) as Record<string, unknown>;
    expect(parsed.custom_extensions).toEqual(extensions);
    expect(parsed.name).toBe("test-model");
    expect(parsed.description).toBe("A test model");
  });

  it("removes custom_extensions when given an empty array", async () => {
    const ok = await svc.updateModelExtensions(projectId, "test-model", []);
    expect(ok).toBe(true);

    const raw = await readFile(join(tmpDir, projectId, "src", "test-model.yaml"), "utf-8");
    const parsed = yaml.load(raw) as Record<string, unknown>;
    expect(parsed.custom_extensions).toBeUndefined();
  });

  it("returns false for non-existent model", async () => {
    const ok = await svc.updateModelExtensions(projectId, "nonexistent", []);
    expect(ok).toBe(false);
  });

  it("preserves other root fields", async () => {
    const extensions = [{ vendor_name: "COMMON", data: '{"foo":"bar"}' }];
    await svc.updateModelExtensions(projectId, "test-model", extensions);

    const raw = await readFile(join(tmpDir, projectId, "src", "test-model.yaml"), "utf-8");
    const parsed = yaml.load(raw) as Record<string, unknown>;
    expect(parsed.name).toBe("test-model");
    expect(parsed.description).toBe("A test model");
    expect(parsed.relationships).toEqual([]);
    expect(parsed.metrics).toEqual([]);
  });

  it("rejects invalid JSON in extension data before writing", async () => {
    const extensions = [{ vendor_name: "COMMON", data: "{broken" }];
    await expect(svc.updateModelExtensions(projectId, "test-model", extensions)).rejects.toThrow(
      /Invalid JSON.*vendor "COMMON"/,
    );

    const raw = await readFile(join(tmpDir, projectId, "src", "test-model.yaml"), "utf-8");
    const parsed = yaml.load(raw) as Record<string, unknown>;
    expect(parsed.custom_extensions).toBeUndefined();
  });
});

describe("SemanticModelFileService conflict detection", () => {
  let tmpDir: string;
  let svc: SemanticModelFileService;
  const projectId = "proj1";

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "smfs-conflict-"));
    svc = new SemanticModelFileService(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("list() returns a stub with hasConflicts for files with conflict markers", async () => {
    const srcDir = join(tmpDir, projectId, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "sales.yaml"),
      "name: sales\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>>\n",
      "utf-8",
    );

    const models = await svc.list(projectId);
    expect(models).toHaveLength(1);
    expect(models[0].name).toBe("sales");
    expect(models[0].hasConflicts).toBe(true);
    expect(models[0].datasets).toEqual([]);
  });

  it("get() returns a stub with rawContent for a conflicted file", async () => {
    const srcDir = join(tmpDir, projectId, "src");
    await mkdir(srcDir, { recursive: true });
    const conflictContent = "name: orders\n<<<<<<< HEAD\nversion: 1\n=======\nversion: 2\n>>>>>>>\n";
    await writeFile(join(srcDir, "orders.yaml"), conflictContent, "utf-8");

    const model = await svc.get(projectId, "orders");
    expect(model).not.toBeNull();
    expect(model!.hasConflicts).toBe(true);
    expect(model!.rawContent).toBe(conflictContent);
    expect(model!.datasets).toEqual([]);
  });

  it("list() returns normal models alongside conflicted ones", async () => {
    const srcDir = join(tmpDir, projectId, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(
      join(srcDir, "good.yaml"),
      yaml.dump({ name: "good", description: "", relationships: [], metrics: [], datasets: [] }),
      "utf-8",
    );
    await writeFile(
      join(srcDir, "bad.yaml"),
      "name: bad\n<<<<<<< HEAD\n=======\n>>>>>>>\n",
      "utf-8",
    );

    const models = await svc.list(projectId);
    expect(models).toHaveLength(2);

    const good = models.find((m) => m.name === "good");
    const bad = models.find((m) => m.name === "bad");
    expect(good?.hasConflicts).toBeUndefined();
    expect(bad?.hasConflicts).toBe(true);
  });

  it("list() skips dotfiles", async () => {
    const srcDir = join(tmpDir, projectId, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, ".hidden.yaml"), yaml.dump({ name: "hidden" }), "utf-8");
    await writeFile(
      join(srcDir, "visible.yaml"),
      yaml.dump({ name: "visible", description: "", relationships: [], metrics: [], datasets: [] }),
      "utf-8",
    );

    const models = await svc.list(projectId);
    expect(models.map((m) => m.name)).toEqual(["visible"]);
  });
});

describe("SemanticModelFileService.updateDatasetExtensions", () => {
  let tmpDir: string;
  let svc: SemanticModelFileService;
  const projectId = "proj1";

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "smfs-ds-test-"));
    svc = new SemanticModelFileService(tmpDir);
    const dsDir = join(tmpDir, projectId, "src", "test-model");
    await mkdir(dsDir, { recursive: true });
    const dsYaml = yaml.dump({
      dataset: {
        name: "orders",
        source: "shop.public.orders",
        fields: [],
      },
    });
    await writeFile(join(dsDir, "orders.yaml"), dsYaml, "utf-8");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("rejects invalid JSON in extension data before writing", async () => {
    const extensions = [{ vendor_name: "COMMON", data: "not-json" }];
    await expect(
      svc.updateDatasetExtensions(projectId, "test-model", "orders", extensions),
    ).rejects.toThrow(/Invalid JSON.*vendor "COMMON"/);

    const raw = await readFile(join(tmpDir, projectId, "src", "test-model", "orders.yaml"), "utf-8");
    const parsed = yaml.load(raw) as Record<string, unknown>;
    const ds = parsed.dataset as Record<string, unknown>;
    expect(ds.custom_extensions).toBeUndefined();
  });

  it("accepts valid JSON in extension data", async () => {
    const extensions = [{ vendor_name: "COMMON", data: '{"graph_x":100}' }];
    const ok = await svc.updateDatasetExtensions(projectId, "test-model", "orders", extensions);
    expect(ok).toBe(true);

    const raw = await readFile(join(tmpDir, projectId, "src", "test-model", "orders.yaml"), "utf-8");
    const parsed = yaml.load(raw) as Record<string, unknown>;
    const ds = parsed.dataset as Record<string, unknown>;
    expect(ds.custom_extensions).toEqual(extensions);
  });
});

describe("SemanticModelFileService.updateDatasetMetadata", () => {
  let tmpDir: string;
  let svc: SemanticModelFileService;
  const projectId = "proj1";
  const dsPath = () => join(tmpDir, projectId, "src", "test-model", "orders.yaml");

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "smfs-meta-test-"));
    svc = new SemanticModelFileService(tmpDir);
    const dsDir = join(tmpDir, projectId, "src", "test-model");
    await mkdir(dsDir, { recursive: true });
    const dsYaml = yaml.dump({
      dataset: {
        name: "orders",
        source: "shop.public.orders",
        primary_key: ["id"],
        description: "old description",
        fields: [
          {
            name: "total_price",
            expression: { dialects: [{ dialect: "ANSI_SQL", expression: "total_price" }] },
            description: "old field description",
            custom_extensions: [{ vendor_name: "COMMON", data: '{"data_type":"DECIMAL"}' }],
          },
          {
            name: "status",
            expression: { dialects: [{ dialect: "ANSI_SQL", expression: "status" }] },
            description: "",
          },
        ],
        custom_extensions: [{ vendor_name: "COMMON", data: '{"view_query":"SELECT * FROM orders"}' }],
      },
    });
    await writeFile(join(dsDir, "orders.yaml"), dsYaml, "utf-8");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("updates dataset description and ai_context, preserving source/fields/extensions", async () => {
    const ok = await svc.updateDatasetMetadata(projectId, "test-model", "orders", {
      description: "Order line items",
      ai_context: { instructions: "Use for revenue analysis" },
    });
    expect(ok).toBe(true);

    const parsed = yaml.load(await readFile(dsPath(), "utf-8")) as { dataset: Record<string, unknown> };
    const ds = parsed.dataset;
    expect(ds.description).toBe("Order line items");
    expect(ds.ai_context).toEqual({ instructions: "Use for revenue analysis" });
    expect(ds.source).toBe("shop.public.orders");
    expect(ds.primary_key).toEqual(["id"]);
    expect(ds.custom_extensions).toEqual([
      { vendor_name: "COMMON", data: '{"view_query":"SELECT * FROM orders"}' },
    ]);
    const fields = ds.fields as Record<string, unknown>[];
    expect(fields[0].expression).toEqual({ dialects: [{ dialect: "ANSI_SQL", expression: "total_price" }] });
  });

  it("updates only the targeted field description, leaving others untouched", async () => {
    const ok = await svc.updateDatasetMetadata(projectId, "test-model", "orders", {
      fields: [{ name: "total_price", description: "Line total in USD" }],
    });
    expect(ok).toBe(true);

    const parsed = yaml.load(await readFile(dsPath(), "utf-8")) as { dataset: Record<string, unknown> };
    const fields = parsed.dataset.fields as Record<string, unknown>[];
    expect(fields[0].description).toBe("Line total in USD");
    expect(fields[0].custom_extensions).toEqual([{ vendor_name: "COMMON", data: '{"data_type":"DECIMAL"}' }]);
    expect(fields[1].description).toBe("");
  });

  it("throws and writes nothing for an unknown field name", async () => {
    const before = await readFile(dsPath(), "utf-8");
    await expect(
      svc.updateDatasetMetadata(projectId, "test-model", "orders", {
        fields: [{ name: "does_not_exist", description: "x" }],
      }),
    ).rejects.toThrow(/Unknown field "does_not_exist"/);
    expect(await readFile(dsPath(), "utf-8")).toBe(before);
  });

  it("clears ai_context when given an empty value", async () => {
    await svc.updateDatasetMetadata(projectId, "test-model", "orders", {
      ai_context: { instructions: "temp" },
    });
    await svc.updateDatasetMetadata(projectId, "test-model", "orders", { ai_context: "" });

    const parsed = yaml.load(await readFile(dsPath(), "utf-8")) as { dataset: Record<string, unknown> };
    expect(parsed.dataset.ai_context).toBeUndefined();
  });

  it("returns false for a non-existent dataset", async () => {
    const ok = await svc.updateDatasetMetadata(projectId, "test-model", "missing", {
      description: "x",
    });
    expect(ok).toBe(false);
  });
});

describe("SemanticModelFileService.cleanupLegacyAgentsMd", () => {
  let tmpDir: string;
  let svc: SemanticModelFileService;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "smfs-agents-test-"));
    svc = new SemanticModelFileService(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function writeAgentsMd(projectId: string, content: string): Promise<string> {
    const dir = join(tmpDir, projectId);
    await mkdir(dir, { recursive: true });
    const path = join(dir, "AGENTS.md");
    await writeFile(path, content, "utf-8");
    return path;
  }

  async function exists(path: string): Promise<boolean> {
    try {
      await readFile(path, "utf-8");
      return true;
    } catch {
      return false;
    }
  }

  it("removes an auto-generated AGENTS.md (matching the header signature)", async () => {
    const path = await writeAgentsMd("proj1", "# Semantic Models\n\nThis project contains 2 semantic models.\n");

    const removed = await svc.cleanupLegacyAgentsMd();

    expect(removed).toBe(1);
    expect(await exists(path)).toBe(false);
  });

  it("preserves a user-authored AGENTS.md (no signature)", async () => {
    const path = await writeAgentsMd("proj1", "# Project Instructions\n\nAlways use snake_case.\n");

    const removed = await svc.cleanupLegacyAgentsMd();

    expect(removed).toBe(0);
    expect(await exists(path)).toBe(true);
  });

  it("is idempotent and tolerant of a missing base dir / missing files", async () => {
    const empty = new SemanticModelFileService(join(tmpDir, "does-not-exist"));
    expect(await empty.cleanupLegacyAgentsMd()).toBe(0);

    await writeAgentsMd("proj1", "# Semantic Models\n");
    expect(await svc.cleanupLegacyAgentsMd()).toBe(1);
    expect(await svc.cleanupLegacyAgentsMd()).toBe(0);
  });
});
