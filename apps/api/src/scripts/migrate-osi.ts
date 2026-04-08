import { readdir, readFile, writeFile, copyFile, stat } from "node:fs/promises";
import { join } from "node:path";
import yaml from "js-yaml";

const YAML_OPTS = { lineWidth: 120, noRefs: true };
const DATA_DIR = process.argv[2] || join(import.meta.dirname, "../../../../data/projects");

interface OldField {
  name: string;
  expression: string | { dialects: unknown[] };
  data_type?: string;
  example_data?: string[];
  distinct_values?: string[];
  label?: string;
  description?: string;
  aiContext?: unknown;
  ai_context?: unknown;
  dimension?: unknown;
  custom_extensions?: unknown[];
}

type AnyObj = Record<string, unknown>;

function isAlreadyMigrated(obj: AnyObj): boolean {
  if (obj.ai_context !== undefined && obj.aiContext === undefined) return true;
  if (obj.primary_key !== undefined && obj.primaryKey === undefined) return true;
  if (obj.from_columns !== undefined && obj.fromColumns === undefined) return true;
  return false;
}

function migrateAiContext(obj: AnyObj): void {
  if ("aiContext" in obj) {
    obj.ai_context = obj.aiContext;
    delete obj.aiContext;
  }
}

function migrateExpression(obj: AnyObj): void {
  if (typeof obj.expression === "string") {
    obj.expression = {
      dialects: [{ dialect: "ANSI_SQL", expression: obj.expression }],
    };
  }
}

function migrateField(field: OldField): AnyObj {
  const result: AnyObj = { ...field };

  const extData: AnyObj = {};
  let dataType: string | undefined;

  if (result.data_type) {
    dataType = result.data_type as string;
    extData.data_type = dataType;
    delete result.data_type;
  }
  if (result.example_data && (result.example_data as string[]).length > 0) {
    extData.example_data = result.example_data;
    delete result.example_data;
  } else {
    delete result.example_data;
  }
  if (result.distinct_values && (result.distinct_values as string[]).length > 0) {
    extData.distinct_values = result.distinct_values;
    delete result.distinct_values;
  } else {
    delete result.distinct_values;
  }

  if (Object.keys(extData).length > 0) {
    const existing = (result.custom_extensions as unknown[]) || [];
    result.custom_extensions = [
      ...existing,
      { vendor_name: "COMMON", data: JSON.stringify(extData) },
    ];
  }

  if (dataType && /TIMESTAMP|DATE/i.test(dataType) && !result.dimension) {
    result.dimension = { is_time: true };
  }

  migrateExpression(result);
  migrateAiContext(result);

  return result;
}

function migrateDataset(ds: AnyObj): AnyObj {
  const result: AnyObj = { ...ds };

  if ("primaryKey" in result) {
    result.primary_key = result.primaryKey;
    delete result.primaryKey;
  }
  if ("uniqueKeys" in result) {
    result.unique_keys = result.uniqueKeys;
    delete result.uniqueKeys;
  }

  migrateAiContext(result);

  if (Array.isArray(result.fields)) {
    result.fields = (result.fields as OldField[]).map(migrateField);
  }

  return result;
}

function migrateRelationship(rel: AnyObj): AnyObj {
  const result: AnyObj = { ...rel };

  if ("fromColumns" in result) {
    result.from_columns = result.fromColumns;
    delete result.fromColumns;
  }
  if ("toColumns" in result) {
    result.to_columns = result.toColumns;
    delete result.toColumns;
  }

  migrateAiContext(result);
  return result;
}

function migrateMetric(m: AnyObj): AnyObj {
  const result: AnyObj = { ...m };
  migrateExpression(result);
  migrateAiContext(result);
  return result;
}

function migrateRootModel(obj: AnyObj): AnyObj {
  const result: AnyObj = { ...obj };

  migrateAiContext(result);

  if (Array.isArray(result.datasets)) {
    result.datasets = (result.datasets as AnyObj[]).map(migrateDataset);
  }
  if (Array.isArray(result.relationships)) {
    result.relationships = (result.relationships as AnyObj[]).map(migrateRelationship);
  }
  if (Array.isArray(result.metrics)) {
    result.metrics = (result.metrics as AnyObj[]).map(migrateMetric);
  }

  return result;
}

async function processYamlFile(filePath: string, isDatasetFile: boolean): Promise<boolean> {
  const raw = await readFile(filePath, "utf-8");
  const parsed = yaml.load(raw) as AnyObj;
  if (!parsed || typeof parsed !== "object") return false;

  if (isAlreadyMigrated(parsed)) {
    console.log(`  SKIP (already migrated): ${filePath}`);
    return false;
  }

  const migrated = isDatasetFile ? migrateDataset(parsed) : migrateRootModel(parsed);

  await copyFile(filePath, `${filePath}.bak`);
  await writeFile(filePath, yaml.dump(migrated, YAML_OPTS), "utf-8");
  console.log(`  MIGRATED: ${filePath}`);
  return true;
}

async function isDir(p: string): Promise<boolean> {
  try { return (await stat(p)).isDirectory(); } catch { return false; }
}

async function migrate(): Promise<void> {
  console.log(`Migrating YAML files in: ${DATA_DIR}`);

  let projectDirs: string[];
  try {
    projectDirs = await readdir(DATA_DIR);
  } catch {
    console.log("No project directories found.");
    return;
  }

  let totalMigrated = 0;

  for (const projectId of projectDirs) {
    const projectPath = join(DATA_DIR, projectId);
    if (!(await isDir(projectPath))) continue;

    console.log(`\nProject: ${projectId}`);
    const entries = await readdir(projectPath);

    for (const entry of entries) {
      const entryPath = join(projectPath, entry);

      if (entry.endsWith(".yaml")) {
        const name = entry.replace(/\.yaml$/, "");
        const subDir = join(projectPath, name);
        const hasSubDir = await isDir(subDir);

        try {
          if (await processYamlFile(entryPath, !hasSubDir)) totalMigrated++;
        } catch (err) {
          console.error(`  ERROR on ${entryPath}: ${err instanceof Error ? err.message : err}`);
        }

        if (hasSubDir) {
          const dsFiles = (await readdir(subDir)).filter((f) => f.endsWith(".yaml"));
          for (const dsFile of dsFiles) {
            try {
              if (await processYamlFile(join(subDir, dsFile), true)) totalMigrated++;
            } catch (err) {
              console.error(`  ERROR on ${join(subDir, dsFile)}: ${err instanceof Error ? err.message : err}`);
            }
          }
        }
      }
    }
  }

  console.log(`\nMigration complete. ${totalMigrated} file(s) migrated.`);
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
