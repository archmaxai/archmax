import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { connectDB } from "@semlayer/core/infra/db";
import { TestCase } from "@semlayer/core/models/index";
import { AppError } from "../utils/errors";

const createSchema = z.object({
  title: z.string().min(1),
  semanticModel: z.string().min(1),
  inputMessage: z.string().min(1),
  expectedFacts: z.array(z.string().min(1)).min(1),
});

const updateSchema = createSchema.partial();

const app = new Hono()
  .get("/", async (c) => {
    await connectDB();
    const projectId = c.req.param("projectId")!;
    const cases = await TestCase.find({ project: projectId }).sort({ createdAt: -1 }).lean();
    return c.json(cases);
  })
  .get("/:caseId", async (c) => {
    await connectDB();
    const tc = await TestCase.findOne({
      _id: c.req.param("caseId"),
      project: c.req.param("projectId")!,
    }).lean();
    if (!tc) throw AppError.notFound("Test case not found");
    return c.json(tc);
  })
  .post("/", zValidator("json", createSchema), async (c) => {
    await connectDB();
    const projectId = c.req.param("projectId")!;
    const body = c.req.valid("json");
    const tc = await TestCase.create({ ...body, project: projectId });
    return c.json(tc.toObject(), 201);
  })
  .put("/:caseId", zValidator("json", updateSchema), async (c) => {
    await connectDB();
    const query = { _id: c.req.param("caseId"), project: c.req.param("projectId")! };
    const existing = await TestCase.findOne(query).lean();
    if (!existing) throw AppError.notFound("Test case not found");

    const body = c.req.valid("json");
    const tc = await TestCase.findOneAndUpdate(query, { $set: body }, { new: true }).lean();
    if (!tc) throw AppError.notFound("Test case not found");
    return c.json(tc);
  })
  .delete("/:caseId", async (c) => {
    await connectDB();
    const tc = await TestCase.findOne({
      _id: c.req.param("caseId"),
      project: c.req.param("projectId")!,
    });
    if (!tc) throw AppError.notFound("Test case not found");
    await tc.softDelete();
    return c.json({ ok: true });
  });

export default app;
