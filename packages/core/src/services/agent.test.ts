import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ValidatingFilesystemBackend } from "./agent";

describe("ValidatingFilesystemBackend", () => {
  let dir: string;
  let backend: ValidatingFilesystemBackend;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "semlayer-test-"));
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
});
