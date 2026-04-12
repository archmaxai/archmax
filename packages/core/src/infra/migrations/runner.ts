import mongoose from "mongoose";
import type { Migration } from "./types";
import { getMigrations } from "./registry";

async function stampInitialVersions(): Promise<number> {
  let totalStamped = 0;
  for (const [name, model] of Object.entries(mongoose.models)) {
    const result = await model.updateMany(
      { _schemaVersion: { $exists: false } },
      { $set: { _schemaVersion: 0 } },
    );
    if (result.modifiedCount > 0) {
      console.log(`[migrations]   Stamped _schemaVersion: 0 on ${result.modifiedCount} ${name} document(s)`);
      totalStamped += result.modifiedCount;
    }
  }
  return totalStamped;
}

function groupByModel(migrations: Migration[]): Map<string, Migration[]> {
  const grouped = new Map<string, Migration[]>();
  for (const m of migrations) {
    const list = grouped.get(m.model) ?? [];
    list.push(m);
    grouped.set(m.model, list);
  }
  return grouped;
}

export async function runMigrations(): Promise<void> {
  const start = Date.now();
  const migrations = getMigrations();
  const modelCount = Object.keys(mongoose.models).length;

  console.log(`[migrations] Starting schema migrations (${migrations.length} script(s), ${modelCount} model(s))`);

  const stamped = await stampInitialVersions();
  if (stamped > 0) {
    console.log(`[migrations] Stamped ${stamped} document(s) with initial schema version`);
  }

  if (migrations.length === 0) {
    console.log(`[migrations] No migration scripts registered, nothing to do (${Date.now() - start}ms)`);
    return;
  }

  let ran = 0;
  let failed = 0;

  for (const [modelName, modelMigrations] of groupByModel(migrations)) {
    const model = mongoose.models[modelName];
    if (!model) {
      console.warn(`[migrations] Model "${modelName}" not registered in Mongoose, skipping`);
      continue;
    }

    for (const migration of modelMigrations) {
      const outdated = await model.countDocuments({
        _schemaVersion: { $lt: migration.version },
      });

      if (outdated === 0) continue;

      console.log(`[migrations]   Running: ${modelName} v${migration.version} — ${migration.description} (${outdated} document(s))`);

      try {
        const count = await migration.up(model);
        ran++;
        console.log(`[migrations]   Completed: ${modelName} v${migration.version} — ${count} document(s) migrated`);
      } catch (err) {
        failed++;
        console.error(`[migrations]   FAILED: ${modelName} v${migration.version}`, err);
      }
    }
  }

  const elapsed = Date.now() - start;
  if (failed > 0) {
    console.error(`[migrations] Finished with errors: ${ran} succeeded, ${failed} failed (${elapsed}ms)`);
  } else if (ran > 0) {
    console.log(`[migrations] All migrations completed successfully: ${ran} script(s) ran (${elapsed}ms)`);
  } else {
    console.log(`[migrations] Schema is up to date, no migrations needed (${elapsed}ms)`);
  }
}
