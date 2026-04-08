import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DocumentFileService, FileTooLargeError, sanitizeFilename } from "./document-files";

describe("sanitizeFilename", () => {
  it("passes through clean filenames", () => {
    expect(sanitizeFilename("report.pdf")).toBe("report.pdf");
    expect(sanitizeFilename("data-dictionary_v2.xlsx")).toBe("data-dictionary_v2.xlsx");
  });

  it("replaces spaces and special chars with hyphens", () => {
    expect(sanitizeFilename("my report (final).pdf")).toBe("my-report-final-.pdf");
  });

  it("collapses consecutive hyphens", () => {
    expect(sanitizeFilename("a   b")).toBe("a-b");
  });

  it("strips leading dots/dashes/underscores", () => {
    expect(sanitizeFilename(".hidden")).toBe("hidden");
    expect(sanitizeFilename("_private.txt")).toBe("private.txt");
  });

  it("returns 'upload' for completely invalid input", () => {
    expect(sanitizeFilename("!!!")).toBe("upload");
  });
});

describe("DocumentFileService", () => {
  let tmpDir: string;
  let svc: DocumentFileService;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "doctest-"));
    svc = new DocumentFileService(tmpDir);
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  const PROJECT = "test-project";

  describe("upload", () => {
    it("stores a file and returns metadata", async () => {
      const data = Buffer.from("hello world");
      const meta = await svc.upload(PROJECT, "readme.txt", data);

      expect(meta.filename).toBe("readme.txt");
      expect(meta.size).toBe(data.length);
      expect(meta.mimeType).toBe("text/plain");
      expect(meta.lastModified).toBeTruthy();
    });

    it("creates uploads directory on first upload", async () => {
      await svc.upload(PROJECT, "file.pdf", Buffer.from("pdf content"));
      const files = await svc.list(PROJECT);
      expect(files).toHaveLength(1);
    });

    it("sanitizes filenames", async () => {
      const meta = await svc.upload(PROJECT, "my file (1).pdf", Buffer.from("data"));
      expect(meta.filename).not.toContain(" ");
      expect(meta.filename).not.toContain("(");
    });

    it("overwrites existing file with same name", async () => {
      await svc.upload(PROJECT, "doc.txt", Buffer.from("version 1"));
      await svc.upload(PROJECT, "doc.txt", Buffer.from("version 2"));
      const content = await svc.get(PROJECT, "doc.txt");
      expect(content.toString()).toBe("version 2");
    });

    it("rejects files exceeding 20 MB", async () => {
      const bigData = Buffer.alloc(21 * 1024 * 1024);
      await expect(svc.upload(PROJECT, "big.pdf", bigData)).rejects.toThrow(FileTooLargeError);
    });
  });

  describe("list", () => {
    it("returns empty array for project with no uploads", async () => {
      const files = await svc.list("nonexistent-project");
      expect(files).toEqual([]);
    });

    it("lists uploaded files with metadata", async () => {
      await svc.upload(PROJECT, "a.pdf", Buffer.from("pdf"));
      await svc.upload(PROJECT, "b.xlsx", Buffer.from("xlsx"));
      const files = await svc.list(PROJECT);
      expect(files).toHaveLength(2);
      expect(files.map((f) => f.filename).sort()).toEqual(["a.pdf", "b.xlsx"]);
    });

    it("skips hidden files", async () => {
      await svc.upload(PROJECT, "visible.txt", Buffer.from("ok"));
      const dir = join(tmpDir, PROJECT, "uploads");
      await writeFile(join(dir, ".hidden"), "secret");
      const files = await svc.list(PROJECT);
      expect(files).toHaveLength(1);
      expect(files[0].filename).toBe("visible.txt");
    });
  });

  describe("get", () => {
    it("returns file contents as buffer", async () => {
      await svc.upload(PROJECT, "test.txt", Buffer.from("content here"));
      const buf = await svc.get(PROJECT, "test.txt");
      expect(buf.toString()).toBe("content here");
    });

    it("throws for non-existent file", async () => {
      await expect(svc.get(PROJECT, "missing.txt")).rejects.toThrow();
    });
  });

  describe("delete", () => {
    it("deletes an existing file and returns true", async () => {
      await svc.upload(PROJECT, "doomed.txt", Buffer.from("bye"));
      const deleted = await svc.delete(PROJECT, "doomed.txt");
      expect(deleted).toBe(true);
      const files = await svc.list(PROJECT);
      expect(files).toHaveLength(0);
    });

    it("returns false for non-existent file", async () => {
      const deleted = await svc.delete(PROJECT, "ghost.txt");
      expect(deleted).toBe(false);
    });
  });

  describe("exists", () => {
    it("returns true for uploaded file", async () => {
      await svc.upload(PROJECT, "exists.txt", Buffer.from("hi"));
      expect(await svc.exists(PROJECT, "exists.txt")).toBe(true);
    });

    it("returns false for non-existent file", async () => {
      expect(await svc.exists(PROJECT, "nope.txt")).toBe(false);
    });
  });

  describe("readAsMarkdown", () => {
    it("returns plain text files as-is", async () => {
      await svc.upload(PROJECT, "notes.txt", Buffer.from("plain text content"));
      const md = await svc.readAsMarkdown(PROJECT, "notes.txt");
      expect(md).toBe("plain text content");
    });

    it("returns markdown files as-is", async () => {
      await svc.upload(PROJECT, "readme.md", Buffer.from("# Title\n\nBody"));
      const md = await svc.readAsMarkdown(PROJECT, "readme.md");
      expect(md).toBe("# Title\n\nBody");
    });

    it("returns CSV files as-is", async () => {
      const csv = "name,age\nAlice,30\nBob,25";
      await svc.upload(PROJECT, "data.csv", Buffer.from(csv));
      const md = await svc.readAsMarkdown(PROJECT, "data.csv");
      expect(md).toBe(csv);
    });

    it("throws for non-existent file", async () => {
      await expect(svc.readAsMarkdown(PROJECT, "missing.pdf")).rejects.toThrow();
    });
  });
});
