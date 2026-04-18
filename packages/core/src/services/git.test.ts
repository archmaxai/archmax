import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import git from "isomorphic-git";
import fs from "node:fs";
import { GitService } from "./git";

describe("GitService", () => {
  let tmpDir: string;
  let svc: GitService;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "git-svc-test-"));
    svc = new GitService(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  describe("isInitialized", () => {
    it("returns false for an empty directory", async () => {
      expect(await svc.isInitialized()).toBe(false);
    });

    it("returns true after ensureRepo", async () => {
      await svc.ensureRepo();
      expect(await svc.isInitialized()).toBe(true);
    });
  });

  describe("ensureRepo", () => {
    it("creates a new repo with an initial commit", async () => {
      const result = await svc.ensureRepo();
      expect(result.created).toBe(true);

      const s = await stat(join(tmpDir, ".git"));
      expect(s.isDirectory()).toBe(true);

      const gitignore = await readFile(join(tmpDir, ".gitignore"), "utf-8");
      expect(gitignore).toContain("build/");

      const commits = await git.log({ fs, dir: tmpDir, depth: 1 });
      expect(commits).toHaveLength(1);
      expect(commits[0].commit.message.trim()).toBe("Initial commit");
    });

    it("is idempotent — returns created=false on second call", async () => {
      await svc.ensureRepo();
      const result = await svc.ensureRepo();
      expect(result.created).toBe(false);
    });

    it("preserves an existing .gitignore", async () => {
      await mkdir(tmpDir, { recursive: true });
      await writeFile(join(tmpDir, ".gitignore"), "custom\n", "utf-8");
      await svc.ensureRepo();
      const content = await readFile(join(tmpDir, ".gitignore"), "utf-8");
      expect(content).toBe("custom\n");
    });
  });

  describe("commit", () => {
    it("commits all staged changes and returns an oid", async () => {
      await svc.ensureRepo();
      await writeFile(join(tmpDir, "hello.txt"), "world", "utf-8");
      const oid = await svc.commit("add hello");
      expect(oid).toMatch(/^[0-9a-f]{40}$/);

      const commits = await git.log({ fs, dir: tmpDir, depth: 10 });
      expect(commits[0].commit.message.trim()).toBe("add hello");
    });

    it("always uses the fixed archmax author", async () => {
      await svc.ensureRepo();
      await writeFile(join(tmpDir, "f.txt"), "data", "utf-8");
      await svc.commit("test");

      const [latest] = await git.log({ fs, dir: tmpDir, depth: 1 });
      expect(latest.commit.author.name).toBe("archmax");
      expect(latest.commit.author.email).toBe("archmax@localhost");
    });
  });

  describe("log", () => {
    it("returns empty array for uninitialised repo", async () => {
      expect(await svc.log()).toEqual([]);
    });

    it("returns commits in reverse-chronological order", async () => {
      await svc.ensureRepo();
      await writeFile(join(tmpDir, "a.txt"), "1", "utf-8");
      await svc.commit("first");
      await writeFile(join(tmpDir, "b.txt"), "2", "utf-8");
      await svc.commit("second");

      const entries = await svc.log(10);
      expect(entries.length).toBeGreaterThanOrEqual(2);
      expect(entries[0].message.trim()).toBe("second");
      expect(entries[1].message.trim()).toBe("first");
      expect(entries[0].author.name).toBe("archmax");
      expect(entries[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("respects the limit parameter", async () => {
      await svc.ensureRepo();
      await writeFile(join(tmpDir, "a.txt"), "1", "utf-8");
      await svc.commit("c1");
      await writeFile(join(tmpDir, "b.txt"), "2", "utf-8");
      await svc.commit("c2");

      const entries = await svc.log(1);
      expect(entries).toHaveLength(1);
      expect(entries[0].message.trim()).toBe("c2");
    });
  });

  describe("revertFile", () => {
    it("restores a modified file to HEAD", async () => {
      await svc.ensureRepo();
      await writeFile(join(tmpDir, "file.txt"), "original", "utf-8");
      await svc.commit("add file");

      await writeFile(join(tmpDir, "file.txt"), "modified", "utf-8");
      const result = await svc.revertFile("file.txt");
      expect(result).toEqual({ reverted: true, deleted: false });

      const content = await readFile(join(tmpDir, "file.txt"), "utf-8");
      expect(content).toBe("original");
    });

    it("deletes a file not in HEAD", async () => {
      await svc.ensureRepo();
      await writeFile(join(tmpDir, "untracked.txt"), "new", "utf-8");
      // file exists on disk but not in any commit
      await writeFile(join(tmpDir, "dummy.txt"), "d", "utf-8");
      await svc.commit("initial");

      await writeFile(join(tmpDir, "brand-new.txt"), "content", "utf-8");
      const result = await svc.revertFile("brand-new.txt");
      expect(result).toEqual({ reverted: false, deleted: true });

      await expect(stat(join(tmpDir, "brand-new.txt"))).rejects.toThrow();
    });

    it("throws on path traversal", async () => {
      await svc.ensureRepo();
      await writeFile(join(tmpDir, "f.txt"), "ok", "utf-8");
      await svc.commit("init");

      await expect(svc.revertFile("../outside")).rejects.toThrow("Path traversal not allowed");
    });

    it("throws when no commits exist", async () => {
      const emptyDir = await mkdtemp(join(tmpdir(), "git-empty-"));
      const emptySvc = new GitService(emptyDir);
      await git.init({ fs, dir: emptyDir, defaultBranch: "main" });

      await expect(emptySvc.revertFile("any.txt")).rejects.toThrow("No commits yet");
      await rm(emptyDir, { recursive: true, force: true });
    });

    it("throws when file is not on disk or in HEAD", async () => {
      await svc.ensureRepo();
      await writeFile(join(tmpDir, "f.txt"), "ok", "utf-8");
      await svc.commit("init");

      await expect(svc.revertFile("nonexistent.txt")).rejects.toThrow("not found");
    });
  });

  describe("discardAllChanges", () => {
    it("restores modified files and removes untracked files", async () => {
      await svc.ensureRepo();
      await writeFile(join(tmpDir, "tracked.txt"), "original", "utf-8");
      await svc.commit("add tracked");

      await writeFile(join(tmpDir, "tracked.txt"), "changed", "utf-8");
      await writeFile(join(tmpDir, "untracked.txt"), "new", "utf-8");

      await svc.discardAllChanges();

      const tracked = await readFile(join(tmpDir, "tracked.txt"), "utf-8");
      expect(tracked).toBe("original");

      await expect(stat(join(tmpDir, "untracked.txt"))).rejects.toThrow();
    });

    it("is a no-op on a repo with no commits", async () => {
      const emptyDir = await mkdtemp(join(tmpdir(), "git-nocommit-"));
      const emptySvc = new GitService(emptyDir);
      await git.init({ fs, dir: emptyDir, defaultBranch: "main" });
      await expect(emptySvc.discardAllChanges()).resolves.toBeUndefined();
      await rm(emptyDir, { recursive: true, force: true });
    });
  });

  describe("detectConflicts", () => {
    it("returns empty array when no conflict markers exist", async () => {
      await svc.ensureRepo();
      await writeFile(join(tmpDir, "clean.yaml"), "name: test\n", "utf-8");
      const result = await svc.detectConflicts();
      expect(result).toEqual([]);
    });

    it("detects conflict markers in yaml files", async () => {
      await svc.ensureRepo();
      await writeFile(
        join(tmpDir, "model.yaml"),
        "name: test\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>>\n",
        "utf-8",
      );
      const result = await svc.detectConflicts();
      expect(result).toContain("model.yaml");
    });

    it("detects conflict markers in nested yaml files", async () => {
      await svc.ensureRepo();
      const subDir = join(tmpDir, "sub");
      await mkdir(subDir, { recursive: true });
      await writeFile(
        join(subDir, "nested.yml"),
        "<<<<<<< HEAD\nconflict\n>>>>>>>\n",
        "utf-8",
      );
      const result = await svc.detectConflicts();
      expect(result).toContain("sub/nested.yml");
    });

    it("skips dotfiles and dotdirs", async () => {
      await svc.ensureRepo();
      const hiddenDir = join(tmpDir, ".hidden");
      await mkdir(hiddenDir, { recursive: true });
      await writeFile(join(hiddenDir, "secret.yaml"), "<<<<<<< HEAD\n", "utf-8");
      const result = await svc.detectConflicts();
      expect(result).toEqual([]);
    });

    it("only scans yaml, yml, and md files", async () => {
      await svc.ensureRepo();
      await writeFile(join(tmpDir, "script.js"), "<<<<<<< HEAD\n", "utf-8");
      const result = await svc.detectConflicts();
      expect(result).toEqual([]);
    });
  });
});
