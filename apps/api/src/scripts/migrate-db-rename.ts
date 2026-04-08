/**
 * Migrates all collections from the "archmax" database to "archsem".
 *
 * Run: npx tsx apps/api/src/scripts/migrate-db-rename.ts
 *
 * The script copies every document from each collection in the source into
 * the target, skipping collections that already have data in the target
 * to avoid duplicating on re-run. After a successful copy the source
 * collection is dropped.
 */
import "../env";
import { MongoClient } from "mongodb";

const SOURCE_DB = "archmax";
const TARGET_DB = "archsem";

function getBaseUri(): string {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");

  // Strip any existing database name from the URI so we can connect at the server level
  try {
    const url = new URL(uri);
    url.pathname = "/";
    return url.toString();
  } catch {
    // Some MongoDB URIs (e.g. mongodb+srv) may not parse as URL — fall back to regex
    return uri.replace(/\/[^/?]+(\?|$)/, "/$1");
  }
}

async function migrate() {
  const baseUri = getBaseUri();
  console.log(`Connecting to MongoDB…`);

  const client = new MongoClient(baseUri);
  await client.connect();

  const sourceDb = client.db(SOURCE_DB);
  const targetDb = client.db(TARGET_DB);

  const collections = await sourceDb.listCollections().toArray();
  if (collections.length === 0) {
    console.log(`No collections found in "${SOURCE_DB}". Nothing to migrate.`);
    await client.close();
    return;
  }

  console.log(
    `Found ${collections.length} collection(s) in "${SOURCE_DB}": ${collections.map((c) => c.name).join(", ")}`,
  );

  let migrated = 0;
  let skipped = 0;

  for (const collInfo of collections) {
    const name = collInfo.name;
    const sourceColl = sourceDb.collection(name);
    const targetColl = targetDb.collection(name);

    const targetCount = await targetColl.countDocuments();
    if (targetCount > 0) {
      console.log(`  SKIP "${name}" — target already has ${targetCount} document(s)`);
      skipped++;
      continue;
    }

    const docs = await sourceColl.find().toArray();
    if (docs.length === 0) {
      console.log(`  SKIP "${name}" — empty collection`);
      skipped++;
      continue;
    }

    await targetColl.insertMany(docs);
    console.log(`  COPIED "${name}" — ${docs.length} document(s)`);

    // Copy indexes (excluding the default _id index)
    const indexes = await sourceColl.indexes();
    for (const idx of indexes) {
      if (idx.name === "_id_") continue;
      const { key, ...opts } = idx;
      // v is internal, remove it
      delete (opts as Record<string, unknown>).v;
      try {
        await targetColl.createIndex(key, opts);
      } catch (err) {
        console.warn(`    WARN: could not create index "${idx.name}" on "${name}": ${err}`);
      }
    }

    await sourceColl.drop();
    console.log(`  DROPPED source "${SOURCE_DB}.${name}"`);
    migrated++;
  }

  console.log(`\nDone. Migrated: ${migrated}, Skipped: ${skipped}`);

  // Drop the empty source database if all collections were moved
  const remaining = await sourceDb.listCollections().toArray();
  if (remaining.length === 0) {
    await sourceDb.dropDatabase();
    console.log(`Dropped empty database "${SOURCE_DB}".`);
  }

  await client.close();
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
