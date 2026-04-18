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
