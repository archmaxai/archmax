import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import mongoose from "mongoose";
import { connectDB } from "@archmax/core/infra/db";
import { McpToken, McpCallLog, generateMcpToken, Project } from "@archmax/core/models/index";
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

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const counts = await McpCallLog.aggregate<{ _id: mongoose.Types.ObjectId | null; count: number }>([
      {
        $match: {
          project: new mongoose.Types.ObjectId(projectId),
          createdAt: { $gte: since },
          tokenId: { $ne: null },
        },
      },
      { $group: { _id: "$tokenId", count: { $sum: 1 } } },
    ]);

    const countByToken = new Map<string, number>();
    for (const row of counts) {
      if (row._id) countByToken.set(row._id.toString(), row.count);
    }

    const enriched = tokens.map((t) => ({
      ...t,
      eventCount30d: countByToken.get(String(t._id)) ?? 0,
    }));

    return c.json(enriched);
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
