import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { connectDB } from "@archmax/core/infra/db";
import { McpCallLog } from "@archmax/core/models/index";

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  toolName: z.string().optional(),
  tokenId: z.string().optional(),
  errorOnly: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const app = new Hono().get("/", zValidator("query", listQuerySchema), async (c) => {
  await connectDB();
  const projectId = c.req.param("projectId")!;

  const q = c.req.valid("query");
  const page = Math.max(1, parseInt(q.page || "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(q.limit || "50", 10)));
  const toolName = q.toolName;
  const tokenId = q.tokenId;
  const errorOnly = q.errorOnly === "true";
  const from = q.from;
  const to = q.to;

  const filter: Record<string, unknown> = { project: projectId };

  if (toolName) filter.toolName = toolName;
  if (tokenId) filter.tokenId = tokenId;
  if (errorOnly) filter.isError = true;
  if (from || to) {
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.$gte = new Date(from);
    if (to) dateFilter.$lte = new Date(to);
    filter.createdAt = dateFilter;
  }

  const [data, total] = await Promise.all([
    McpCallLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    McpCallLog.countDocuments(filter),
  ]);

  return c.json({ data, total, page, limit });
});

export default app;
