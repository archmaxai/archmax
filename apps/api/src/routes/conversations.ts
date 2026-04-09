import { Hono } from "hono";
import { connectDB } from "@archmax/core/infra/db";
import { Conversation } from "@archmax/core/models/index";
import { isStreamActive } from "@archmax/core/streaming/stream-bridge";
import { AppError } from "../utils/errors";

const app = new Hono()
  .get("/", async (c) => {
    await connectDB();
    const projectId = c.req.param("projectId")!;
    const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "10", 10) || 10, 1), 100);
    const skip = Math.max(parseInt(c.req.query("skip") ?? "0", 10) || 0, 0);

    const filter = { project: projectId, testAgent: null };
    const [items, total] = await Promise.all([
      Conversation.find(filter)
        .select("title createdAt updatedAt")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Conversation.countDocuments(filter),
    ]);
    return c.json({ items, total });
  })
  .get("/:id", async (c) => {
    await connectDB();
    const conv = await Conversation.findOne({
      _id: c.req.param("id"),
      project: c.req.param("projectId")!,
      testAgent: null,
    }).lean();
    if (!conv) throw AppError.notFound("Conversation not found");
    const streaming = await isStreamActive(conv._id.toString());
    return c.json({ ...conv, isStreaming: streaming });
  })
  .delete("/:id", async (c) => {
    await connectDB();
    const conv = await Conversation.findOne({
      _id: c.req.param("id"),
      project: c.req.param("projectId")!,
      testAgent: null,
    });
    if (!conv) throw AppError.notFound("Conversation not found");
    await conv.softDelete();
    return c.json({ ok: true });
  });

export default app;
