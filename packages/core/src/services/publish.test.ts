import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PublishService } from "./publish";

describe("PublishService.computeSourceHash", () => {
  let tmpDir: string;
  let svc: PublishService;
  const projectId = "proj1";

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "publish-test-"));
    svc = new PublishService(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("returns a stable hash for the same content", async () => {
    const srcDir = join(tmpDir, projectId, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, "model.yaml"), "name: test\n", "utf-8");

    const hash1 = await svc.computeSourceHash(projectId);
    const hash2 = await svc.computeSourceHash(projectId);
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes when file content changes", async () => {
    const srcDir = join(tmpDir, projectId, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, "model.yaml"), "name: v1\n", "utf-8");
    const hash1 = await svc.computeSourceHash(projectId);

    await writeFile(join(srcDir, "model.yaml"), "name: v2\n", "utf-8");
    const hash2 = await svc.computeSourceHash(projectId);

    expect(hash1).not.toBe(hash2);
  });

  it("excludes dotfiles from the hash", async () => {
    const srcDir = join(tmpDir, projectId, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, "model.yaml"), "name: test\n", "utf-8");
    const hashWithout = await svc.computeSourceHash(projectId);

    await writeFile(join(srcDir, ".hidden.yaml"), "name: hidden\n", "utf-8");
    const hashWith = await svc.computeSourceHash(projectId);

    expect(hashWithout).toBe(hashWith);
  });

  it("excludes dotdirs from the hash", async () => {
    const srcDir = join(tmpDir, projectId, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, "model.yaml"), "name: test\n", "utf-8");
    const hashWithout = await svc.computeSourceHash(projectId);

    const gitDir = join(srcDir, ".git");
    await mkdir(gitDir, { recursive: true });
    await writeFile(join(gitDir, "config.yaml"), "gitdata\n", "utf-8");
    const hashWith = await svc.computeSourceHash(projectId);

    expect(hashWithout).toBe(hashWith);
  });

  it("returns a deterministic empty hash for missing project dir", async () => {
    const hash = await svc.computeSourceHash(projectId);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes files at the project root, not just src/", async () => {
    const projDir = join(tmpDir, projectId);
    await mkdir(projDir, { recursive: true });
    await writeFile(join(projDir, "README.md"), "# Hello\n", "utf-8");
    const hashWithRoot = await svc.computeSourceHash(projectId);

    const srcDir = join(projDir, "src");
    await mkdir(srcDir, { recursive: true });
    await writeFile(join(srcDir, "model.yaml"), "name: test\n", "utf-8");
    const hashWithSrc = await svc.computeSourceHash(projectId);

    expect(hashWithRoot).not.toBe(hashWithSrc);
  });

  it("includes non-YAML files in the hash", async () => {
    const projDir = join(tmpDir, projectId);
    await mkdir(projDir, { recursive: true });
    await writeFile(join(projDir, "data.json"), '{"key":"value"}\n', "utf-8");
    const hash1 = await svc.computeSourceHash(projectId);

    await writeFile(join(projDir, "data.json"), '{"key":"changed"}\n', "utf-8");
    const hash2 = await svc.computeSourceHash(projectId);

    expect(hash1).not.toBe(hash2);
  });

  it("excludes large_tool_results/ from the hash", async () => {
    const projDir = join(tmpDir, projectId);
    await mkdir(projDir, { recursive: true });
    await writeFile(join(projDir, "model.yaml"), "name: test\n", "utf-8");
    const hashBefore = await svc.computeSourceHash(projectId);

    const skipDir = join(projDir, "large_tool_results");
    await mkdir(skipDir, { recursive: true });
    await writeFile(join(skipDir, "big.json"), '{"lots":"of data"}\n', "utf-8");
    const hashAfter = await svc.computeSourceHash(projectId);

    expect(hashBefore).toBe(hashAfter);
  });

  it("excludes node_modules/ from the hash", async () => {
    const projDir = join(tmpDir, projectId);
    await mkdir(projDir, { recursive: true });
    await writeFile(join(projDir, "model.yaml"), "name: test\n", "utf-8");
    const hashBefore = await svc.computeSourceHash(projectId);

    const nmDir = join(projDir, "node_modules");
    await mkdir(nmDir, { recursive: true });
    await writeFile(join(nmDir, "package.json"), '{"name":"dep"}\n', "utf-8");
    const hashAfter = await svc.computeSourceHash(projectId);

    expect(hashBefore).toBe(hashAfter);
  });

  it("includes build/ directory in the hash", async () => {
    const projDir = join(tmpDir, projectId);
    await mkdir(projDir, { recursive: true });
    await writeFile(join(projDir, "model.yaml"), "name: test\n", "utf-8");
    const hashBefore = await svc.computeSourceHash(projectId);

    const buildDir = join(projDir, "build");
    await mkdir(buildDir, { recursive: true });
    await writeFile(join(buildDir, "output.yaml"), "name: built\n", "utf-8");
    const hashAfter = await svc.computeSourceHash(projectId);

    expect(hashBefore).not.toBe(hashAfter);
  });
});
