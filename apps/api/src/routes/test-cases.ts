import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { connectDB } from "@archsem/core/infra/db";
import { TestCase, TestAgent } from "@archsem/core/models/index";
import { AppError } from "../utils/errors";

const createSchema = z.object({
  title: z.string().min(1),
  testAgentId: z.string().min(1).optional(),
  semanticModel: z.string().min(1),
  inputMessage: z.string().min(1),
  expectedFacts: z.array(z.string().min(1)).min(1),
  tags: z.array(z.string()).optional(),
  maxToolCalls: z.number().int().min(1).optional(),
});

const updateSchema = createSchema.partial();

const app = new Hono()
  .get("/", async (c) => {
    await connectDB();
    const projectId = c.req.param("projectId")!;
    const page = Math.max(parseInt(c.req.query("page") ?? "1", 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "25", 10) || 25, 1), 100);
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { project: projectId };
    const agentId = c.req.query("agentId");
    const semanticModel = c.req.query("semanticModel");
    const tagsParam = c.req.query("tags");
    if (agentId) filter.testAgent = agentId;
    if (semanticModel) filter.semanticModel = semanticModel;
    if (tagsParam) filter.tags = { $in: tagsParam.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean) };

    const [items, total] = await Promise.all([
      TestCase.find(filter)
        .populate("testAgent", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      TestCase.countDocuments(filter),
    ]);
    return c.json({ items, total, page, limit });
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
    const { testAgentId, ...body } = c.req.valid("json");

    let testAgent: string | null = null;
    if (testAgentId) {
      const agent = await TestAgent.findOne({ _id: testAgentId, project: projectId }).lean();
      if (!agent) throw AppError.notFound("Test agent not found");
      testAgent = testAgentId;
    }

    const tc = await TestCase.create({ ...body, testAgent, project: projectId });
    return c.json(tc.toObject(), 201);
  })
  .put("/:caseId", zValidator("json", updateSchema), async (c) => {
    await connectDB();
    const projectId = c.req.param("projectId")!;
    const query = { _id: c.req.param("caseId"), project: projectId };
    const existing = await TestCase.findOne(query).lean();
    if (!existing) throw AppError.notFound("Test case not found");

    const { testAgentId, ...body } = c.req.valid("json");
    const update: Record<string, unknown> = { ...body };

    if (testAgentId) {
      const agent = await TestAgent.findOne({ _id: testAgentId, project: projectId }).lean();
      if (!agent) throw AppError.notFound("Test agent not found");
      update.testAgent = testAgentId;
    }

    const tc = await TestCase.findOneAndUpdate(query, { $set: update }, { new: true }).lean();
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
