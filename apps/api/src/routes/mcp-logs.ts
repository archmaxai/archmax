import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { connectDB } from "@archmax/core/infra/db";
import { McpCallLog } from "@archmax/core/models/index";
import { AppError } from "../utils/errors";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Must be a 24-character hex ObjectId");

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(1_000_000).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  toolName: z.string().min(1).max(200).optional(),
  tokenId: objectIdSchema.optional(),
  errorOnly: z.enum(["true", "false"]).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

function parseProjectId(c: { req: { param: (k: string) => string | undefined } }): string {
  const raw = c.req.param("projectId");
  const parsed = objectIdSchema.safeParse(raw);
  if (!parsed.success) throw AppError.badRequest("Invalid projectId");
  return parsed.data;
}

const app = new Hono()
  .get("/", zValidator("query", listQuerySchema), async (c) => {
    await connectDB();
    const projectId = parseProjectId(c);

    const q = c.req.valid("query");
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const errorOnly = q.errorOnly === "true";

    const filter: Record<string, unknown> = { project: projectId };

    if (q.toolName) filter.toolName = q.toolName;
    if (q.tokenId) filter.tokenId = q.tokenId;
    if (errorOnly) filter.isError = true;
    if (q.from || q.to) {
      const dateFilter: Record<string, Date> = {};
      if (q.from) dateFilter.$gte = new Date(q.from);
      if (q.to) dateFilter.$lte = new Date(q.to);
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
  })
  .get("/tools", async (c) => {
    await connectDB();
    const projectId = parseProjectId(c);

    const tools = await McpCallLog.distinct("toolName", {
      project: projectId,
      toolName: { $ne: null },
    });

    const sorted = (tools as (string | null)[])
      .filter((t): t is string => typeof t === "string" && t.length > 0)
      .sort();

    return c.json(sorted);
  });

export default app;
