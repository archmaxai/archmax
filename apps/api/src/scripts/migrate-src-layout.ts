import { readdir, rename, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { getEnv } from "@semlayer/core/config/env";

const SKIP_DIRS = new Set(["src", "build", "uploads"]);

async function dirExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Migrate a single project directory from flat layout to src/ layout.
 * Moves .yaml files and model dataset directories into src/.
 * Preserves uploads/, build/, and AGENTS.md at the project root.
 */
async function migrateProject(projectDir: string): Promise<boolean> {
  const srcDir = join(projectDir, "src");
  if (await dirExists(srcDir)) return false;

  let entries: string[];
  try {
    entries = await readdir(projectDir);
  } catch {
    return false;
  }

  const yamlFiles = entries.filter((f) => f.endsWith(".yaml"));
  if (yamlFiles.length === 0) return false;

  await mkdir(srcDir, { recursive: true });

  for (const file of yamlFiles) {
    await rename(join(projectDir, file), join(srcDir, file));
  }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    if (entry === "AGENTS.md") continue;
    if (entry.endsWith(".yaml")) continue;

    const entryPath = join(projectDir, entry);
    if (await dirExists(entryPath)) {
      const contents = await readdir(entryPath);
      const hasYaml = contents.some((f) => f.endsWith(".yaml"));
      if (hasYaml) {
        await rename(entryPath, join(srcDir, entry));
      }
    }
  }

  return true;
}

export async function migrateSrcLayout(): Promise<void> {
  const dataDir = getEnv().SEMLAYER_DATA_DIR;
  let projectDirs: string[];
  try {
    projectDirs = await readdir(dataDir);
  } catch {
    return;
  }

  for (const name of projectDirs) {
    const projectDir = join(dataDir, name);
    if (!(await dirExists(projectDir))) continue;
    const migrated = await migrateProject(projectDir);
    if (migrated) {
      console.log(`[migrate-src-layout] Migrated project "${name}" to src/ layout`);
    }
  }
}
