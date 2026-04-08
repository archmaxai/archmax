import { connectDB } from "@archsem/core/infra/db";
import { Project, slugifyProjectTitle } from "@archsem/core/models/index";

async function migrate() {
  await connectDB();

  const projects = await Project.find({ $or: [{ slug: { $exists: false } }, { slug: "" }] }).lean();
  if (projects.length === 0) {
    console.log("No projects need slug migration.");
    return;
  }

  console.log(`Found ${projects.length} project(s) without a slug.`);

  const usedSlugs = new Set<string>();
  const existing = await Project.find({ slug: { $exists: true, $ne: "" } }).lean();
  for (const p of existing) usedSlugs.add(p.slug);

  for (const project of projects) {
    const base = slugifyProjectTitle(project.title);
    let candidate = base;
    let suffix = 2;
    while (usedSlugs.has(candidate)) {
      candidate = `${base}-${suffix++}`;
    }

    usedSlugs.add(candidate);
    await Project.updateOne({ _id: project._id }, { $set: { slug: candidate } });
    console.log(`  ${project.title} → ${candidate}`);
  }

  console.log("Migration complete.");
}

migrate()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
