import { readdir, readFile, writeFile, rename, unlink, mkdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import yaml from "js-yaml";
import {
  semanticModelSchema,
  semanticModelRootSchema,
  datasetFileSchema,
  type SemanticModel,
  type Dataset,
} from "./semantic-model-schema";

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

const SAFE_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export function assertSafeSegment(value: string, label: string): void {
  if (!value || !SAFE_SEGMENT.test(value)) {
    throw new Error(`Invalid ${label}: must be alphanumeric (with ._-), got "${value}"`);
  }
}

export interface FileServiceOptions {
  subDir?: string;
}

export class SemanticModelFileService {
  private baseDir: string;
  private subDir: string;

  constructor(dataDir: string, opts?: FileServiceOptions) {
    this.baseDir = resolve(dataDir);
    this.subDir = opts?.subDir ?? "src";
  }

  /** Project root: <baseDir>/<projectId> — used for AGENTS.md */
  projectRootDir(projectId: string): string {
    assertSafeSegment(projectId, "projectId");
    return join(this.baseDir, projectId);
  }

  /** Working directory for model files: <baseDir>/<projectId>/<subDir> */
  private workDir(projectId: string): string {
    return join(this.projectRootDir(projectId), this.subDir);
  }

  private modelPath(projectId: string, name: string): string {
    assertSafeSegment(name, "model name");
    return join(this.workDir(projectId), `${name}.yaml`);
  }

  private datasetDir(projectId: string, modelName: string): string {
    assertSafeSegment(modelName, "model name");
    return join(this.workDir(projectId), modelName);
  }

  private datasetPath(projectId: string, modelName: string, datasetName: string): string {
    assertSafeSegment(datasetName, "dataset name");
    return join(this.datasetDir(projectId, modelName), `${datasetName}.yaml`);
  }

  /**
   * Check if the workDir exists. If not and we're using "src", fall back
   * to the project root (legacy layout before the src/ migration).
   */
  private async resolveWorkDir(projectId: string): Promise<string> {
    const primary = this.workDir(projectId);
    if (await this.dirExists(primary)) return primary;
    if (this.subDir === "src") {
      const root = this.projectRootDir(projectId);
      if (await this.dirExists(root)) return root;
    }
    return primary;
  }

  private async ensureDir(dir: string): Promise<void> {
    await mkdir(dir, { recursive: true });
  }

  private async dirExists(dir: string): Promise<boolean> {
    try {
      const s = await stat(dir);
      return s.isDirectory();
    } catch {
      return false;
    }
  }

  private async atomicWrite(targetPath: string, content: string): Promise<void> {
    const dir = join(targetPath, "..");
    const tmpPath = join(dir, `.${randomUUID()}.tmp`);
    await writeFile(tmpPath, content, "utf-8");
    await rename(tmpPath, targetPath);
  }

  async list(projectId: string): Promise<SemanticModel[]> {
    const dir = await this.resolveWorkDir(projectId);
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return [];
    }

    const yamlFiles = entries.filter((f) => f.endsWith(".yaml"));
    const models: SemanticModel[] = [];

    for (const file of yamlFiles) {
      const name = file.replace(/\.yaml$/, "");
      try {
        const model = await this.get(projectId, name);
        if (model) models.push(model);
      } catch {
        // skip invalid files
      }
    }

    return models;
  }

  async get(projectId: string, name: string): Promise<SemanticModel | null> {
    assertSafeSegment(name, "model name");
    const dir = await this.resolveWorkDir(projectId);
    const rootPath = join(dir, `${name}.yaml`);
    let rawRoot: string;
    try {
      rawRoot = await readFile(rootPath, "utf-8");
    } catch {
      return null;
    }

    const parsed = yaml.load(rawRoot);
    const dsDir = join(dir, name);

    if (await this.dirExists(dsDir)) {
      const root = semanticModelRootSchema.parse(parsed);
      const datasets = await this.readAllDatasets(dsDir);
      return { ...root, datasets };
    }

    return semanticModelSchema.parse(parsed);
  }

  async getDataset(projectId: string, modelName: string, datasetName: string): Promise<Dataset | null> {
    assertSafeSegment(modelName, "model name");
    assertSafeSegment(datasetName, "dataset name");
    const dir = await this.resolveWorkDir(projectId);
    const filePath = join(dir, modelName, `${datasetName}.yaml`);
    try {
      const raw = await readFile(filePath, "utf-8");
      const parsed = yaml.load(raw);
      return datasetFileSchema.parse(parsed).dataset;
    } catch {
      return null;
    }
  }

  async exists(projectId: string, name: string): Promise<boolean> {
    assertSafeSegment(name, "model name");
    const dir = await this.resolveWorkDir(projectId);
    try {
      await readFile(join(dir, `${name}.yaml`), "utf-8");
      return true;
    } catch {
      return false;
    }
  }

  async write(projectId: string, model: SemanticModel): Promise<void> {
    const dir = this.workDir(projectId);
    await this.ensureDir(dir);

    const { datasets, ...rootData } = model;

    await this.atomicWrite(
      this.modelPath(projectId, model.name),
      yaml.dump(stripEmptyExtensions(rootData), YAML_OPTS),
    );

    const dsDir = this.datasetDir(projectId, model.name);
    await this.ensureDir(dsDir);

    const currentNames = new Set(datasets.map((d) => d.name));

    for (const dataset of datasets) {
      await this.atomicWrite(
        this.datasetPath(projectId, model.name, dataset.name),
        yaml.dump({ dataset: stripEmptyExtensions(dataset) }, YAML_OPTS),
      );
    }

    let existingFiles: string[];
    try {
      existingFiles = (await readdir(dsDir)).filter((f) => f.endsWith(".yaml"));
    } catch {
      existingFiles = [];
    }
    for (const file of existingFiles) {
      const dsName = file.replace(/\.yaml$/, "");
      if (!currentNames.has(dsName)) {
        await unlink(join(dsDir, file)).catch(() => {});
      }
    }

    await this.regenerateAgentsMd(projectId);
  }

  async delete(projectId: string, name: string): Promise<boolean> {
    assertSafeSegment(name, "model name");
    const dir = await this.resolveWorkDir(projectId);
    try {
      await unlink(join(dir, `${name}.yaml`));
    } catch {
      return false;
    }

    await rm(join(dir, name), { recursive: true, force: true }).catch(() => {});

    await this.regenerateAgentsMd(projectId);
    return true;
  }

  private async readAllDatasets(dsDir: string): Promise<Dataset[]> {
    let entries: string[];
    try {
      entries = (await readdir(dsDir)).filter((f) => f.endsWith(".yaml"));
    } catch {
      return [];
    }

    const datasets: Dataset[] = [];
    for (const file of entries) {
      try {
        const raw = await readFile(join(dsDir, file), "utf-8");
        const parsed = yaml.load(raw);
        datasets.push(datasetFileSchema.parse(parsed).dataset);
      } catch {
        // skip invalid dataset files
      }
    }
    return datasets;
  }

  async getRawYaml(projectId: string, name: string): Promise<string | null> {
    assertSafeSegment(name, "model name");
    const dir = await this.resolveWorkDir(projectId);
    const rootPath = join(dir, `${name}.yaml`);
    let rootContent: string;
    try {
      rootContent = await readFile(rootPath, "utf-8");
    } catch {
      return null;
    }

    const dsDir = join(dir, name);
    if (!(await this.dirExists(dsDir))) {
      return rootContent;
    }

    const root = yaml.load(rootContent) as Record<string, unknown>;
    const datasets = await this.readAllDatasets(dsDir);
    root.datasets = datasets;

    return yaml.dump(stripEmptyExtensions(root as Record<string, unknown> & { datasets: unknown[] }), YAML_OPTS);
  }

  async updateDatasetExtensions(
    projectId: string,
    modelName: string,
    datasetName: string,
    extensions: Array<{ vendor_name: string; data: string }>,
  ): Promise<boolean> {
    assertSafeSegment(modelName, "model name");
    assertSafeSegment(datasetName, "dataset name");
    const dir = await this.resolveWorkDir(projectId);
    const filePath = join(dir, modelName, `${datasetName}.yaml`);
    let rawContent: string;
    try {
      rawContent = await readFile(filePath, "utf-8");
    } catch {
      return false;
    }

    const wrapper = yaml.load(rawContent) as Record<string, unknown>;
    const ds = (wrapper.dataset ?? wrapper) as Record<string, unknown>;
    ds.custom_extensions = extensions.length > 0 ? extensions : undefined;
    if (!ds.custom_extensions) delete ds.custom_extensions;
    await this.atomicWrite(filePath, yaml.dump({ dataset: ds }, YAML_OPTS));
    return true;
  }

  async regenerateAgentsMd(projectId: string): Promise<void> {
    const models = await this.list(projectId);
    const rootDir = this.projectRootDir(projectId);
    await this.ensureDir(rootDir);

    const lines: string[] = [
      "# Semantic Models",
      "",
      `This project contains ${models.length} semantic model${models.length === 1 ? "" : "s"}.`,
      "",
    ];

    for (const model of models) {
      lines.push(`## ${model.name}`);
      if (model.description) lines.push("", model.description);

      if (model.datasets.length > 0) {
        lines.push("", "**Datasets:**", ...model.datasets.map((d) => `- ${d.name}`));
      }

      if (model.metrics.length > 0) {
        lines.push("", "**Metrics:**", ...model.metrics.map((m) => `- ${m.name}`));
      }

      lines.push("");
    }

    const content = lines.join("\n");
    await this.atomicWrite(join(rootDir, "AGENTS.md"), content);
  }
}
