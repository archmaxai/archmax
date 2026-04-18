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

  it("returns a deterministic empty hash for missing src dir", async () => {
    const hash = await svc.computeSourceHash(projectId);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
