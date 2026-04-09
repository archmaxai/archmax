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
});
