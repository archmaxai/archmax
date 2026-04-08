import { readdir, readFile, writeFile, unlink, mkdir, stat } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { MarkItDown } from "markitdown-ts";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const SAFE_FILENAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export interface DocumentMeta {
  filename: string;
  size: number;
  mimeType: string;
  lastModified: string;
}

const MIME_MAP: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".htm": "text/html",
  ".json": "application/json",
  ".xml": "application/xml",
};

function guessMimeType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  return MIME_MAP[ext] ?? "application/octet-stream";
}

export function sanitizeFilename(raw: string): string {
  let name = raw.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-{2,}/g, "-");
  name = name.replace(/^[-_.]+/, "");
  if (!name) name = "upload";
  return name;
}

export class DocumentFileService {
  private baseDir: string;

  constructor(dataDir: string) {
    this.baseDir = resolve(dataDir);
  }

  private uploadsDir(projectId: string): string {
    return join(this.baseDir, projectId, "uploads");
  }

  private filePath(projectId: string, filename: string): string {
    if (!SAFE_FILENAME.test(filename)) {
      throw new Error(`Invalid filename: "${filename}"`);
    }
    return join(this.uploadsDir(projectId), filename);
  }

  async upload(
    projectId: string,
    rawFilename: string,
    data: Buffer | Uint8Array,
  ): Promise<DocumentMeta> {
    if (data.length > MAX_FILE_SIZE) {
      throw new FileTooLargeError(data.length);
    }

    const filename = sanitizeFilename(rawFilename);
    const dir = this.uploadsDir(projectId);
    await mkdir(dir, { recursive: true });
    const path = join(dir, filename);
    await writeFile(path, data);

    return {
      filename,
      size: data.length,
      mimeType: guessMimeType(filename),
      lastModified: new Date().toISOString(),
    };
  }

  async list(projectId: string): Promise<DocumentMeta[]> {
    const dir = this.uploadsDir(projectId);
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return [];
    }

    const results: DocumentMeta[] = [];
    for (const name of entries) {
      if (name.startsWith(".")) continue;
      try {
        const s = await stat(join(dir, name));
        if (!s.isFile()) continue;
        results.push({
          filename: name,
          size: s.size,
          mimeType: guessMimeType(name),
          lastModified: s.mtime.toISOString(),
        });
      } catch {
        // skip inaccessible files
      }
    }

    return results;
  }

  async get(projectId: string, filename: string): Promise<Buffer> {
    const path = this.filePath(projectId, filename);
    return readFile(path);
  }

  async delete(projectId: string, filename: string): Promise<boolean> {
    try {
      const path = this.filePath(projectId, filename);
      await unlink(path);
      return true;
    } catch {
      return false;
    }
  }

  async exists(projectId: string, filename: string): Promise<boolean> {
    try {
      const path = this.filePath(projectId, filename);
      const s = await stat(path);
      return s.isFile();
    } catch {
      return false;
    }
  }

  async readAsMarkdown(projectId: string, filename: string): Promise<string> {
    const path = this.filePath(projectId, filename);

    const ext = extname(filename).toLowerCase();
    if ([".txt", ".md", ".csv"].includes(ext)) {
      return readFile(path, "utf-8");
    }

    const converter = new MarkItDown();
    const result = await converter.convert(path);
    if (!result || !result.text_content) {
      throw new Error(`Conversion failed for "${filename}" — format may not be supported`);
    }
    return result.text_content;
  }
}

export class FileTooLargeError extends Error {
  constructor(public readonly actualSize: number) {
    super(`File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024} MB (got ${(actualSize / 1024 / 1024).toFixed(1)} MB)`);
    this.name = "FileTooLargeError";
  }
}
