#!/usr/bin/env node
/**
 * One-time migration: backfill the `view_query` value inside every dataset's
 * COMMON custom extension.
 *
 * Why: the platform used to auto-derive the per-model scoped DuckDB VIEW
 * body mechanically from each dataset's `fields` array. The new contract is
 * "the dataset's `view_query` (inside its COMMON extension) IS the view
 * body". This script performs the one-time backfill so existing models keep
 * working after the auto-derivation code path is removed.
 *
 * What it does:
 *   1. Walks every `<ARCHMAX_DATA_DIR>/projects/<projectId>/src/<modelName>/<datasetName>.yaml`.
 *   2. Skips datasets whose COMMON extension already has a non-empty
 *      `view_query` (so it is safe to re-run).
 *   3. For datasets with at least one field, builds a SELECT body using the
 *      same column-quoting and aliasing logic the legacy `createScopedViews`
 *      used (see `buildColumnSelect` in `packages/core/src/services/duckdb.ts`).
 *      Columns are emitted one per line for readability when an operator
 *      reviews the YAML.
 *   4. Writes a `.yaml.bak` of the unmodified dataset file alongside the
 *      original (atomic temp + rename), then writes the updated YAML.
 *      A pre-existing `.yaml.bak` is treated as a partial previous run and
 *      is NEVER overwritten — the dataset is skipped (counted as "skipped
 *      (existing backup)").
 *   5. Datasets with an empty `fields` array emit a WARN line and are
 *      counted under "errored" so a CI run of the script exits non-zero.
 *      They are left exactly as they were (no `.yaml.bak`, no `view_query`).
 *
 * Usage: `node --import tsx src/scripts/migrate-view-query.ts`
 *
 * Exit code: 0 when no errored datasets, 1 otherwise.
 */

import { readdir, readFile, writeFile, rename, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import yaml from "js-yaml";
import { datasetFileSchema, type Dataset } from "@archmax/core/services/semantic-model-schema";

interface MigrationCounts {
  total: number;
  migrated: number;
  skippedAlreadyMigrated: number;
  skippedExistingBackup: number;
  errored: number;
}

interface ProcessOptions {
  baseDir: string;
  log?: (level: "INFO" | "WARN" | "ERROR", message: string) => void;
}

const SIMPLE_IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Build the SELECT column fragment for a field. Mirrors `buildColumnSelect`
 * in `packages/core/src/services/duckdb.ts` — kept inline here so the
 * migration is independent of any future refactor of that helper.
 */
export function buildColumnSelect(expr: string, name: string): string {
  if (expr === name) return `"${name}"`;
  if (SIMPLE_IDENT_RE.test(expr)) return `"${expr}" AS "${name}"`;
  return `${expr} AS "${name}"`;
}

/**
 * Compose a SELECT body for a dataset using the legacy `createScopedViews`
 * column rules, with one column per line for readability. Returns `null`
 * when the dataset has no fields (caller handles this as an error).
 */
export function buildLegacyViewQuery(dataset: Dataset): string | null {
  if (!dataset.fields || dataset.fields.length === 0) return null;
  const columns = dataset.fields.map((f) => {
    const expr = f.expression?.dialects?.[0]?.expression ?? f.name;
    return buildColumnSelect(expr, f.name);
  });
  return `SELECT\n  ${columns.join(",\n  ")}\nFROM ${dataset.source}`;
}

/**
 * Find or insert the COMMON extension entry. Mutates the supplied object
 * representation of the dataset YAML.
 */
function setViewQueryInCommon(
  rawDataset: Record<string, unknown>,
  viewQuery: string,
): void {
  const exts = (rawDataset.custom_extensions as Array<Record<string, unknown>> | undefined) ?? [];
  const existing = exts.find((ext) => ext.vendor_name === "COMMON");
  if (existing) {
    let parsed: Record<string, unknown> = {};
    try {
      const candidate = JSON.parse(String(existing.data));
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        parsed = candidate as Record<string, unknown>;
      }
    } catch {
      // Treat unparsable payload as empty rather than discarding fields blindly.
    }
    parsed.view_query = viewQuery;
    existing.data = JSON.stringify(parsed);
    return;
  }
  exts.push({
    vendor_name: "COMMON",
    data: JSON.stringify({ view_query: viewQuery }),
  });
  rawDataset.custom_extensions = exts;
}

function readExistingViewQuery(extensions: Array<Record<string, unknown>> | undefined): string | null {
  if (!Array.isArray(extensions)) return null;
  const common = extensions.find((ext) => ext?.vendor_name === "COMMON");
  if (!common) return null;
  try {
    const parsed = JSON.parse(String(common.data));
    if (parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).view_query === "string") {
      const candidate = (parsed as Record<string, unknown>).view_query as string;
      return candidate.length > 0 ? candidate : null;
    }
  } catch {
    return null;
  }
  return null;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function atomicWrite(targetPath: string, content: string): Promise<void> {
  const dir = join(targetPath, "..");
  const tmp = join(dir, `.${randomUUID()}.tmp`);
  await writeFile(tmp, content, "utf-8");
  await rename(tmp, targetPath);
}

async function listProjects(baseDir: string): Promise<string[]> {
  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function listModels(projectSrcDir: string): Promise<string[]> {
  try {
    const entries = await readdir(projectSrcDir, { withFileTypes: true });
    // A model is represented as a sub-directory containing per-dataset YAML
    // files (the layout the file service writes since the src/ split). We
    // ignore root `<modelName>.yaml` files because they hold the model's
    // metadata only — datasets are *always* in the sibling directory.
    return entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name);
  } catch {
    return [];
  }
}

async function listDatasetFiles(modelDir: string): Promise<string[]> {
  try {
    const entries = await readdir(modelDir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".yaml") && !e.name.startsWith("."))
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Process a single dataset YAML file. Returns the action taken so the caller
 * can update its counts and exit code accordingly.
 */
export async function processDatasetFile(
  projectId: string,
  modelName: string,
  datasetFilePath: string,
  log: (level: "INFO" | "WARN" | "ERROR", message: string) => void,
): Promise<"migrated" | "skipped-already" | "skipped-backup" | "errored"> {
  const raw = await readFile(datasetFilePath, "utf-8");
  const wrapper = yaml.load(raw) as Record<string, unknown>;
  const ds = (wrapper?.dataset ?? wrapper) as Record<string, unknown> | undefined;
  if (!ds || typeof ds !== "object") {
    log("WARN", `Skipping ${datasetFilePath}: not a dataset YAML`);
    return "skipped-already";
  }

  const datasetName = String(ds.name ?? "<unknown>");
  const ident = `${projectId}/${modelName}/${datasetName}`;

  const existing = readExistingViewQuery(ds.custom_extensions as Array<Record<string, unknown>> | undefined);
  if (existing) {
    log("INFO", `Skipping ${ident}: view_query already present`);
    return "skipped-already";
  }

  let dataset: Dataset;
  try {
    dataset = datasetFileSchema.parse({ dataset: ds }).dataset;
  } catch (err) {
    log("WARN", `Skipping ${ident}: dataset failed schema validation (${err instanceof Error ? err.message : String(err)})`);
    return "errored";
  }

  if (!dataset.fields || dataset.fields.length === 0) {
    log(
      "WARN",
      `Dataset ${ident} has no fields and will not be queryable until you add either fields or an explicit \`view_query\` to its COMMON extension`,
    );
    return "errored";
  }

  const backupPath = `${datasetFilePath}.bak`;
  if (await pathExists(backupPath)) {
    log(
      "WARN",
      `Skipping ${ident}: existing backup ${backupPath} would be overwritten — resolve manually before re-running`,
    );
    return "skipped-backup";
  }

  const viewQuery = buildLegacyViewQuery(dataset);
  if (viewQuery === null) {
    // Defensive: should be caught by the no-fields check above.
    return "errored";
  }

  setViewQueryInCommon(ds, viewQuery);

  // 1. Write `.yaml.bak` first so we never get into a state where the
  //    backup is missing but the new content is on disk.
  await atomicWrite(backupPath, raw);
  // 2. Then write the updated YAML. We mirror the file service's YAML_OPTS
  //    so format diffs stay minimal.
  const updated = yaml.dump(wrapper.dataset ? { dataset: ds } : ds, { lineWidth: 120, noRefs: true });
  await atomicWrite(datasetFilePath, updated);

  log("INFO", `Migrated ${ident}`);
  return "migrated";
}

export async function runMigration(opts: ProcessOptions): Promise<MigrationCounts> {
  const log = opts.log ?? ((level, msg) => console.log(`[${level}] ${msg}`));
  const counts: MigrationCounts = {
    total: 0,
    migrated: 0,
    skippedAlreadyMigrated: 0,
    skippedExistingBackup: 0,
    errored: 0,
  };

  const baseDir = resolve(opts.baseDir);
  const projects = await listProjects(baseDir);

  for (const projectId of projects) {
    const srcDir = join(baseDir, projectId, "src");
    if (!(await pathExists(srcDir))) continue;
    const models = await listModels(srcDir);
    for (const modelName of models) {
      const modelDir = join(srcDir, modelName);
      if (!(await pathExists(modelDir))) continue;
      const files = await listDatasetFiles(modelDir);
      for (const file of files) {
        if (file.endsWith(".yaml.bak")) continue;
        const datasetFilePath = join(modelDir, file);
        counts.total++;
        try {
          const result = await processDatasetFile(projectId, modelName, datasetFilePath, log);
          if (result === "migrated") counts.migrated++;
          else if (result === "skipped-already") counts.skippedAlreadyMigrated++;
          else if (result === "skipped-backup") counts.skippedExistingBackup++;
          else if (result === "errored") counts.errored++;
        } catch (err) {
          log(
            "ERROR",
            `Failed to process ${projectId}/${modelName}/${file}: ${err instanceof Error ? err.message : String(err)}`,
          );
          counts.errored++;
        }
      }
    }
  }

  return counts;
}

function formatSummary(counts: MigrationCounts): string {
  return [
    "── view_query migration summary ──",
    `  total datasets seen:        ${counts.total}`,
    `  migrated:                   ${counts.migrated}`,
    `  skipped (already migrated): ${counts.skippedAlreadyMigrated}`,
    `  skipped (existing backup):  ${counts.skippedExistingBackup}`,
    `  errored:                    ${counts.errored}`,
  ].join("\n");
}

async function main(): Promise<void> {
  const baseDir = process.env.ARCHMAX_DATA_DIR
    ? resolve(process.env.ARCHMAX_DATA_DIR, "projects")
    : resolve("data", "projects");
  const counts = await runMigration({ baseDir });
  console.log(formatSummary(counts));
  process.exit(counts.errored > 0 ? 1 : 0);
}

const invokedAsScript =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url === new URL(`file://${resolve(process.argv[1] ?? "")}`).href;

if (invokedAsScript) {
  void main();
}
