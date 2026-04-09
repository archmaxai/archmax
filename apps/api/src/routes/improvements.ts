import { Hono } from "hono";
import { connectDB } from "@archmax/core/infra/db";
import { Improvement } from "@archmax/core/models/index";
import { AppError } from "../utils/errors";

const app = new Hono()
  .get("/", async (c) => {
    await connectDB();
    const projectId = c.req.param("projectId")!;
    const modelName = c.req.query("modelName");
    const status = c.req.query("status");

    const filter: Record<string, unknown> = { project: projectId };
    if (modelName) filter.modelName = modelName;
    if (status) filter.status = status;

    const items = await Improvement.find(filter).sort({ createdAt: -1 }).lean();
    return c.json(items);
  })
  .get("/:id", async (c) => {
    await connectDB();
    const item = await Improvement.findOne({
      _id: c.req.param("id"),
      project: c.req.param("projectId")!,
    }).lean();
    if (!item) throw AppError.notFound("Improvement not found");
    return c.json(item);
  })
  .patch("/:id/implement", async (c) => {
    await connectDB();
    const item = await Improvement.findOneAndUpdate(
      { _id: c.req.param("id"), project: c.req.param("projectId")! },
      { $set: { status: "implemented", implementedAt: new Date() } },
      { new: true },
    ).lean();
    if (!item) throw AppError.notFound("Improvement not found");
    return c.json(item);
  });

export default app;
