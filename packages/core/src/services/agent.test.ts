import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, stat, symlink, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ValidatingFilesystemBackend } from "./agent";

describe("ValidatingFilesystemBackend", () => {
  let dir: string;
  let backend: ValidatingFilesystemBackend;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "archsem-test-"));
    backend = new ValidatingFilesystemBackend({ rootDir: dir });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  describe("write()", () => {
    it("writes valid YAML without error", async () => {
      const result = await backend.write(
        join(dir, "model.yaml"),
        "name: test\ndescription: hello\n",
      );
      expect(result.error).toBeUndefined();
      expect(result.path).toBeDefined();
    });

    it("returns error for syntactically invalid YAML", async () => {
      const result = await backend.write(
        join(dir, "bad.yaml"),
        "name: test\n  bad indent: here\n",
      );
      expect(result.error).toMatch(/YAML syntax error/);
      expect(result.path).toBeUndefined();
    });

    it("returns error for YAML with unmatched quotes", async () => {
      const result = await backend.write(
        join(dir, "quotes.yml"),
        'key: "unclosed value\n',
      );
      expect(result.error).toMatch(/YAML syntax error/);
    });

    it("returns error for YAML with tab indentation", async () => {
      const result = await backend.write(
        join(dir, "tabs.yaml"),
        "parent:\n\tchild: value\n",
      );
      expect(result.error).toMatch(/YAML syntax error/);
    });

    it("does not validate non-YAML files", async () => {
      const result = await backend.write(
        join(dir, "readme.md"),
        "this: is not { valid yaml: [",
      );
      expect(result.error).toBeUndefined();
      expect(result.path).toBeDefined();
    });

    it("handles .yml extension", async () => {
      const result = await backend.write(
        join(dir, "config.yml"),
        "valid: true\n",
      );
      expect(result.error).toBeUndefined();
    });

    it("handles .YAML extension (case insensitive)", async () => {
      const result = await backend.write(
        join(dir, "MODEL.YAML"),
        "name: test\n  broken: indent\n",
      );
      expect(result.error).toMatch(/YAML syntax error/);
    });
  });

  describe("delete()", () => {
    it("deletes a file", async () => {
      await backend.write(join(dir, "to-delete.txt"), "bye");
      const result = await backend.delete(join(dir, "to-delete.txt"));
      expect(result.error).toBeUndefined();
      expect(result.path).toBeDefined();
      await expect(stat(join(dir, "to-delete.txt"))).rejects.toThrow();
    });

    it("returns error for non-existent file", async () => {
      const result = await backend.delete(join(dir, "nope.txt"));
      expect(result.error).toMatch(/not found/);
    });

    it("returns error when deleting a directory without recursive", async () => {
      await mkdir(join(dir, "subdir"), { recursive: true });
      await writeFile(join(dir, "subdir", "file.txt"), "content");
      const result = await backend.delete(join(dir, "subdir"));
      expect(result.error).toMatch(/directory/i);
    });

    it("deletes a directory recursively", async () => {
      await mkdir(join(dir, "subdir"), { recursive: true });
      await writeFile(join(dir, "subdir", "file.txt"), "content");
      const result = await backend.delete(join(dir, "subdir"), true);
      expect(result.error).toBeUndefined();
      expect(result.path).toBeDefined();
      await expect(stat(join(dir, "subdir"))).rejects.toThrow();
    });

    it("blocks path traversal in virtual mode", async () => {
      const vBackend = new ValidatingFilesystemBackend({
        rootDir: dir,
        virtualMode: true,
      });
      const result = await vBackend.delete("/../../../etc/passwd");
      expect(result.error).toMatch(/traversal/i);
    });
  });

  describe("edit()", () => {
    it("allows edits that produce valid YAML", async () => {
      await backend.write(join(dir, "model.yaml"), "name: old\n");
      const result = await backend.edit(
        join(dir, "model.yaml"),
        "name: old",
        "name: new",
      );
      expect(result.error).toBeUndefined();
      expect(result.occurrences).toBe(1);
    });

    it("returns error when edit breaks YAML syntax", async () => {
      await backend.write(join(dir, "model.yaml"), "name: test\nkey: value\n");
      const result = await backend.edit(
        join(dir, "model.yaml"),
        "key: value",
        "  bad: indent",
      );
      expect(result.error).toMatch(/YAML syntax error after edit/);
    });

    it("does not validate edits to non-YAML files", async () => {
      await backend.write(join(dir, "notes.txt"), "hello world");
      const result = await backend.edit(
        join(dir, "notes.txt"),
        "hello",
        "this: is not { valid yaml: [",
      );
      expect(result.error).toBeUndefined();
    });
  });

  describe("rename()", () => {
    it("renames a file", async () => {
      await writeFile(join(dir, "old.yaml"), "name: test\n");
      const result = await backend.rename(join(dir, "old.yaml"), join(dir, "new.yaml"));
      expect(result.error).toBeUndefined();
      expect(result.oldPath).toBe(join(dir, "old.yaml"));
      expect(result.newPath).toBe(join(dir, "new.yaml"));
      await expect(stat(join(dir, "old.yaml"))).rejects.toThrow();
      const content = await readFile(join(dir, "new.yaml"), "utf-8");
      expect(content).toBe("name: test\n");
    });

    it("renames a directory", async () => {
      await mkdir(join(dir, "olddir"));
      await writeFile(join(dir, "olddir", "file.txt"), "content");
      const result = await backend.rename(join(dir, "olddir"), join(dir, "newdir"));
      expect(result.error).toBeUndefined();
      await expect(stat(join(dir, "olddir"))).rejects.toThrow();
      const content = await readFile(join(dir, "newdir", "file.txt"), "utf-8");
      expect(content).toBe("content");
    });

    it("returns error when source does not exist", async () => {
      const result = await backend.rename(join(dir, "nope.yaml"), join(dir, "dest.yaml"));
      expect(result.error).toMatch(/not found/);
    });

    it("returns error when target already exists", async () => {
      await writeFile(join(dir, "a.yaml"), "name: a\n");
      await writeFile(join(dir, "b.yaml"), "name: b\n");
      const result = await backend.rename(join(dir, "a.yaml"), join(dir, "b.yaml"));
      expect(result.error).toMatch(/Target already exists/);
      const content = await readFile(join(dir, "a.yaml"), "utf-8");
      expect(content).toBe("name: a\n");
    });

    it("rejects symlinks", async () => {
      await writeFile(join(dir, "real.txt"), "content");
      await symlink(join(dir, "real.txt"), join(dir, "link.txt"));
      const result = await backend.rename(join(dir, "link.txt"), join(dir, "moved.txt"));
      expect(result.error).toMatch(/Symlinks/i);
    });

    it("blocks path traversal in virtual mode", async () => {
      const vBackend = new ValidatingFilesystemBackend({
        rootDir: dir,
        virtualMode: true,
      });
      await writeFile(join(dir, "file.txt"), "content");
      const result = await vBackend.rename("/file.txt", "/../../../tmp/stolen.txt");
      expect(result.error).toMatch(/traversal/i);
    });
  });

  describe("copy()", () => {
    it("copies a file", async () => {
      await writeFile(join(dir, "src.yaml"), "name: test\n");
      const result = await backend.copy(join(dir, "src.yaml"), join(dir, "dest.yaml"));
      expect(result.error).toBeUndefined();
      expect(result.srcPath).toBe(join(dir, "src.yaml"));
      expect(result.destPath).toBe(join(dir, "dest.yaml"));
      const srcContent = await readFile(join(dir, "src.yaml"), "utf-8");
      const destContent = await readFile(join(dir, "dest.yaml"), "utf-8");
      expect(srcContent).toBe("name: test\n");
      expect(destContent).toBe("name: test\n");
    });

    it("copies a directory recursively", async () => {
      await mkdir(join(dir, "model"));
      await writeFile(join(dir, "model", "orders.yaml"), "name: orders\n");
      await writeFile(join(dir, "model", "items.yaml"), "name: items\n");
      const result = await backend.copy(join(dir, "model"), join(dir, "model_v2"), true);
      expect(result.error).toBeUndefined();
      const orig = await readFile(join(dir, "model", "orders.yaml"), "utf-8");
      expect(orig).toBe("name: orders\n");
      const copied = await readFile(join(dir, "model_v2", "orders.yaml"), "utf-8");
      expect(copied).toBe("name: orders\n");
      const copiedItems = await readFile(join(dir, "model_v2", "items.yaml"), "utf-8");
      expect(copiedItems).toBe("name: items\n");
    });

    it("returns error when copying directory without recursive", async () => {
      await mkdir(join(dir, "mydir"));
      await writeFile(join(dir, "mydir", "file.txt"), "content");
      const result = await backend.copy(join(dir, "mydir"), join(dir, "mydir2"));
      expect(result.error).toMatch(/directory/i);
    });

    it("returns error when source does not exist", async () => {
      const result = await backend.copy(join(dir, "nope.yaml"), join(dir, "dest.yaml"));
      expect(result.error).toMatch(/not found/);
    });

    it("returns error when target already exists", async () => {
      await writeFile(join(dir, "a.yaml"), "name: a\n");
      await writeFile(join(dir, "b.yaml"), "name: b\n");
      const result = await backend.copy(join(dir, "a.yaml"), join(dir, "b.yaml"));
      expect(result.error).toMatch(/Target already exists/);
      const contentB = await readFile(join(dir, "b.yaml"), "utf-8");
      expect(contentB).toBe("name: b\n");
    });

    it("rejects symlinks", async () => {
      await writeFile(join(dir, "real.txt"), "content");
      await symlink(join(dir, "real.txt"), join(dir, "link.txt"));
      const result = await backend.copy(join(dir, "link.txt"), join(dir, "copied.txt"));
      expect(result.error).toMatch(/Symlinks/i);
    });

    it("blocks path traversal in virtual mode", async () => {
      const vBackend = new ValidatingFilesystemBackend({
        rootDir: dir,
        virtualMode: true,
      });
      await writeFile(join(dir, "file.txt"), "content");
      const result = await vBackend.copy("/file.txt", "/../../../tmp/stolen.txt");
      expect(result.error).toMatch(/traversal/i);
    });
  });
});
