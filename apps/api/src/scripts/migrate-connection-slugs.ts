import { connectDB } from "@semlayer/core/infra/db";
import { Connection, slugifyConnectionName } from "@semlayer/core/models/index";

async function migrate() {
  await connectDB();

  const connections = await Connection.find({ $or: [{ slug: { $exists: false } }, { slug: "" }] }).lean();
  if (connections.length === 0) {
    console.log("No connections need slug migration.");
    return;
  }

  console.log(`Found ${connections.length} connection(s) without a slug.`);

  const slugsByProject = new Map<string, Set<string>>();

  const existing = await Connection.find({ slug: { $exists: true, $ne: "" } }).lean();
  for (const conn of existing) {
    const pid = conn.project.toString();
    if (!slugsByProject.has(pid)) slugsByProject.set(pid, new Set());
    slugsByProject.get(pid)!.add(conn.slug);
  }

  for (const conn of connections) {
    const pid = conn.project.toString();
    if (!slugsByProject.has(pid)) slugsByProject.set(pid, new Set());
    const usedSlugs = slugsByProject.get(pid)!;

    let candidate = slugifyConnectionName(conn.name);
    let suffix = 2;
    while (usedSlugs.has(candidate)) {
      candidate = `${slugifyConnectionName(conn.name)}_${suffix}`;
      suffix++;
    }

    usedSlugs.add(candidate);
    await Connection.updateOne({ _id: conn._id }, { $set: { slug: candidate } });
    console.log(`  ${conn.name} → ${candidate}`);
  }

  console.log("Migration complete.");
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
