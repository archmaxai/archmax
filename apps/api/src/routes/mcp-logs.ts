import { Hono } from "hono";
import { connectDB } from "@archmax/core/infra/db";
import { McpCallLog } from "@archmax/core/models/index";

const app = new Hono().get("/", async (c) => {
  await connectDB();
  const projectId = c.req.param("projectId")!;

  const page = Math.max(1, parseInt(c.req.query("page") || "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(c.req.query("limit") || "50", 10)));
  const toolName = c.req.query("toolName");
  const tokenId = c.req.query("tokenId");
  const errorOnly = c.req.query("errorOnly") === "true";
  const from = c.req.query("from");
  const to = c.req.query("to");

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
