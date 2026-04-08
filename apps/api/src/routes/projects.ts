import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { connectDB } from "@archsem/core/infra/db";
import { Project, type IProject, Connection, McpToken, generateUniqueSlug, PROJECT_SLUG_PATTERN } from "@archsem/core/models/index";
import { AppError } from "../utils/errors";

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(""),
  mcpPageSize: z.number().int().min(10).max(200).optional().default(50),
});

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  mcpPageSize: z.number().int().min(10).max(200).optional(),
  slug: z.string().regex(PROJECT_SLUG_PATTERN).min(2).optional(),
  githubRepo: z.string().optional(),
  githubBranch: z.string().optional(),
});

interface SerializedGitHub { connected: boolean; owner: string; repo: string; branch: string }
type ProjectResponse = Omit<IProject, "github"> & { _id: string; deleted: boolean; deletedAt: Date | null; github?: SerializedGitHub };

function serializeProject(project: Record<string, unknown>): ProjectResponse {
  const { github, ...rest } = project as Record<string, unknown> & { github?: { owner?: string; repo?: string; branch?: string; encryptedToken?: string } };
  const serialized = { ...rest } as unknown as ProjectResponse;
  if (github?.encryptedToken) {
    serialized.github = { connected: true, owner: github.owner ?? "", repo: github.repo ?? "", branch: github.branch ?? "main" };
  }
  return serialized;
}

const app = new Hono()
  .get("/", async (c) => {
    await connectDB();
    const projects = await Project.find().sort({ createdAt: -1 }).lean();
    return c.json(projects.map((p) => serializeProject(p as unknown as Record<string, unknown>)));
  })
  .get("/:id", async (c) => {
    await connectDB();
    const project = await Project.findById(c.req.param("id")).lean();
    if (!project) throw AppError.notFound("Project not found");
    return c.json(serializeProject(project as unknown as Record<string, unknown>));
  })
  .post("/", zValidator("json", createSchema), async (c) => {
    await connectDB();
    const body = c.req.valid("json");
    const slug = await generateUniqueSlug(body.title);
    const project = await Project.create({ ...body, slug });
    return c.json(serializeProject(project.toJSON() as unknown as Record<string, unknown>), 201);
  })
  .put("/:id", zValidator("json", updateSchema), async (c) => {
    await connectDB();
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const prev = await Project.findById(id).lean();
    if (!prev) throw AppError.notFound("Project not found");

    if (body.slug && body.slug !== prev.slug) {
      const existing = await Project.findOne({ slug: body.slug, _id: { $ne: id } }).select("_id").lean();
      if (existing) throw AppError.conflict("Slug already in use");
    }

    const { githubRepo, githubBranch, ...updateFields } = body;
    const $set: Record<string, unknown> = { ...updateFields };
    if (githubRepo !== undefined) $set["github.repo"] = githubRepo;
    if (githubBranch !== undefined) $set["github.branch"] = githubBranch;

    const project = await Project.findByIdAndUpdate(
      id,
      { $set },
      { new: true },
    );
    if (!project) throw AppError.notFound("Project not found");

    return c.json(serializeProject(project.toJSON() as unknown as Record<string, unknown>));
  })
  .delete("/:id", async (c) => {
    await connectDB();
    const id = c.req.param("id");
    const project = await Project.findById(id);
    if (!project) throw AppError.notFound("Project not found");

    const now = new Date();
    await Promise.all([
      Connection.updateMany({ project: id }, { $set: { deleted: true, deletedAt: now } }),
      McpToken.updateMany({ project: id }, { $set: { deleted: true, deletedAt: now } }),
    ]);

    await project.softDelete();
    return c.json({ ok: true });
  });

export default app;
