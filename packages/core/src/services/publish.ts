import { readdir, readFile, writeFile, rename, unlink, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import yaml from "js-yaml";
import { SemanticModelFileService } from "./semantic-model-files";
import type { SemanticModel } from "./semantic-model-schema";

const YAML_OPTS = { lineWidth: 120, noRefs: true };

function stripEmptyExtensions<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = { ...obj };
  if (Array.isArray(result.custom_extensions) && result.custom_extensions.length === 0) {
    delete result.custom_extensions;
  }
  if (Array.isArray(result.fields)) {
    result.fields = (result.fields as Record<string, unknown>[]).map(stripEmptyExtensions);
  }
  if (Array.isArray(result.datasets)) {
    result.datasets = (result.datasets as Record<string, unknown>[]).map(stripEmptyExtensions);
  }
  if (Array.isArray(result.relationships)) {
    result.relationships = (result.relationships as Record<string, unknown>[]).map(stripEmptyExtensions);
  }
  if (Array.isArray(result.metrics)) {
    result.metrics = (result.metrics as Record<string, unknown>[]).map(stripEmptyExtensions);
  }
  return result as T;
}

export class PublishService {
  private baseDir: string;
  private srcService: SemanticModelFileService;

  constructor(dataDir: string) {
    this.baseDir = resolve(dataDir);
    this.srcService = new SemanticModelFileService(dataDir);
  }

  private projectDir(projectId: string): string {
    return join(this.baseDir, projectId);
  }

  private defaultBuildDir(projectId: string): string {
    return join(this.projectDir(projectId), "build");
  }

  /**
   * Assemble all source models into fully-inlined single-file YAMLs.
   * Writes to `targetDir` (default: `<projectDir>/build/`).
   * Returns the list of model names that were assembled.
   */
  async assemble(projectId: string, targetDir?: string): Promise<string[]> {
    const outDir = targetDir ? resolve(targetDir) : this.defaultBuildDir(projectId);
    await mkdir(outDir, { recursive: true });

    const models = await this.srcService.list(projectId);
    const modelNames = new Set(models.map((m) => m.name));

    for (const model of models) {
      await this.writeAssembledModel(outDir, model);
    }

    await this.cleanStaleFiles(outDir, modelNames);

    return [...modelNames];
  }

  /**
   * Compute a SHA-256 hash of all source YAML content (sorted by filename).
   * Used for change detection between publishes.
   */
  async computeSourceHash(projectId: string): Promise<string> {
    const srcDir = join(this.projectDir(projectId), "src");
    const hash = createHash("sha256");
    await this.hashDirectory(srcDir, hash);
    return hash.digest("hex");
  }

  private async hashDirectory(dir: string, hash: ReturnType<typeof createHash>): Promise<void> {
    let entries: string[];
    try {
      entries = (await readdir(dir)).sort();
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      if (entry.endsWith(".yaml")) {
        try {
          const content = await readFile(fullPath, "utf-8");
          hash.update(entry);
          hash.update(content);
        } catch {
          // skip unreadable files
        }
      } else {
        await this.hashDirectory(fullPath, hash);
      }
    }
  }

  private async writeAssembledModel(outDir: string, model: SemanticModel): Promise<void> {
    const assembled = stripEmptyExtensions({ ...model } as Record<string, unknown>);
    const content = yaml.dump(assembled, YAML_OPTS);
    const targetPath = join(outDir, `${model.name}.yaml`);
    const tmpPath = join(outDir, `.${randomUUID()}.tmp`);
    await writeFile(tmpPath, content, "utf-8");
    await rename(tmpPath, targetPath);
  }

  private async cleanStaleFiles(outDir: string, validNames: Set<string>): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(outDir);
    } catch {
      return;
    }

    for (const file of entries) {
      if (!file.endsWith(".yaml")) continue;
      const name = file.replace(/\.yaml$/, "");
      if (!validNames.has(name)) {
        await unlink(join(outDir, file)).catch(() => {});
      }
    }
  }
}
