import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { connectDB } from "@archmax/core/infra/db";
import { McpToken, generateMcpToken, Project } from "@archmax/core/models/index";
import { SemanticModelFileService } from "@archmax/core/services/semantic-model-files";
import { getEnv } from "@archmax/core/config/env";
import { AppError } from "../utils/errors";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string().min(1).max(200)).min(1).max(50),
  expiresAt: z.string().datetime().nullable().optional().default(null),
});

function getFileService(): SemanticModelFileService {
  return new SemanticModelFileService(getEnv().projectsDir);
}

const app = new Hono()
  .get("/", async (c) => {
    await connectDB();
    const projectId = c.req.param("projectId")!;
    const tokens = await McpToken.find({ project: projectId })
      .select("name scopes expiresAt lastUsedAt createdAt")
      .sort({ createdAt: -1 })
      .lean();
    return c.json(tokens);
  })
  .post("/", zValidator("json", createSchema), async (c) => {
    await connectDB();
    const projectId = c.req.param("projectId")!;

    const project = await Project.findById(projectId).lean();
    if (!project) throw AppError.notFound("Project not found");

    const body = c.req.valid("json");

    const svc = getFileService();
    const models = await svc.list(projectId);
    const modelNames = new Set(models.map((m: { name: string }) => m.name));
    const invalidScopes = body.scopes.filter((s) => !modelNames.has(s));
    if (invalidScopes.length > 0) {
      throw AppError.badRequest(`Invalid scopes (no matching semantic model): ${invalidScopes.join(", ")}`);
    }

    const { raw, hash } = generateMcpToken();

    const token = await McpToken.create({
      name: body.name,
      tokenHash: hash,
      project: projectId,
      scopes: body.scopes,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    });

    return c.json(
      {
        _id: token._id,
        name: token.name,
        scopes: token.scopes,
        expiresAt: token.expiresAt,
        createdAt: token.createdAt,
        token: raw,
      },
      201,
    );
  })
  .delete("/:tokenId", async (c) => {
    await connectDB();
    const projectId = c.req.param("projectId")!;
    const tokenId = c.req.param("tokenId")!;

    const token = await McpToken.findOne({ _id: tokenId, project: projectId });
    if (!token) throw AppError.notFound("Token not found");

    await token.softDelete();
    return c.json({ ok: true });
  });

export default app;
