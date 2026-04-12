import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { connectDB } from "@archmax/core/infra/db";
import { TestRun, TestCase, TestAgent } from "@archmax/core/models/index";
import { isRedisConfigured } from "@archmax/core/infra/redis";
import { enqueueTestRunJob } from "@archmax/core/queue/producer";
import { processTestCase } from "@archmax/core/services/test-runner";
import { AppError } from "../utils/errors";

const createSchema = z.object({
  testCaseIds: z.array(z.string().min(1)).min(1),
});

const app = new Hono()
  .get("/", async (c) => {
    await connectDB();
    const projectId = c.req.param("projectId")!;
    const page = Math.max(parseInt(c.req.query("page") ?? "1", 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(c.req.query("limit") ?? "25", 10) || 25, 1), 100);
    const skip = (page - 1) * limit;

    const filter = { project: projectId };
    const [runs, total] = await Promise.all([
      TestRun.find(filter)
        .sort({ createdAt: -1 })
        .populate("testAgent", "name")
        .skip(skip)
        .limit(limit)
        .lean(),
      TestRun.countDocuments(filter),
    ]);

    const items = runs.map((r: any) => {
      const passed = r.cases.filter((tc: any) => tc.status === "passed").length;
      const failed = r.cases.filter((tc: any) => tc.status === "failed").length;
      const errors = r.cases.filter((tc: any) => tc.status === "error").length;
      return {
        _id: r._id,
        testAgent: r.testAgent,
        status: r.status,
        caseCount: r.cases.length,
        passed,
        failed,
        errors,
        startedAt: r.startedAt,
        completedAt: r.completedAt,
        createdAt: r.createdAt,
      };
    });
    return c.json({ items, total, page, limit });
  })
  .get("/:runId", async (c) => {
    await connectDB();
    const run = await TestRun.findOne({
      _id: c.req.param("runId"),
      project: c.req.param("projectId")!,
    })
      .populate("testAgent", "name")
      .lean();
    if (!run) throw AppError.notFound("Test run not found");
    return c.json(run);
  })
  .post("/", zValidator("json", createSchema), async (c) => {
    await connectDB();
    const projectId = c.req.param("projectId")!;
    const { testCaseIds } = c.req.valid("json");

    const cases = await TestCase.find({ _id: { $in: testCaseIds }, project: projectId }).lean();
    if (cases.length === 0) throw AppError.badRequest("No valid test cases found");

    const missingAgent = cases.find((tc: any) => !tc.testAgent);
    if (missingAgent) throw AppError.badRequest(`Test case "${(missingAgent as any).title}" has no agent assigned`);

    const run = await TestRun.create({
      project: projectId,
      testAgent: (cases[0] as any).testAgent,
      status: "pending",
      cases: cases.map((tc: any) => ({
        testCase: tc._id,
        title: tc.title,
        semanticModel: tc.semanticModel,
        inputMessage: tc.inputMessage,
        expectedFacts: tc.expectedFacts,
        maxToolCalls: tc.maxToolCalls,
        testAgent: tc.testAgent,
        status: "pending",
        agentResponse: "",
        toolCalls: [],
        factResults: [],
        durationMs: 0,
      })),
    });

    await TestRun.updateOne({ _id: run._id }, { status: "running", startedAt: new Date() });

    if (isRedisConfigured()) {
      for (let i = 0; i < cases.length; i++) {
        const tc = cases[i] as any;
        await enqueueTestRunJob({
          testRunId: run._id.toString(),
          caseIndex: i,
          testAgentId: tc.testAgent.toString(),
          semanticModel: tc.semanticModel,
          inputMessage: tc.inputMessage,
          expectedFacts: tc.expectedFacts,
          maxToolCalls: tc.maxToolCalls,
        });
      }
    } else {
      (async () => {
        for (let i = 0; i < cases.length; i++) {
          const tc = cases[i] as any;
          try {
            await processTestCase(
              run._id.toString(),
              i,
              tc.testAgent.toString(),
              tc.semanticModel,
              tc.inputMessage,
              tc.expectedFacts,
              tc.maxToolCalls,
            );
          } catch (err) {
            console.error(`[test-runs] In-process case ${i} failed:`, err);
          }
        }
        try {
          const latest = await TestRun.findById(run._id).lean();
          const hasFailures = latest?.cases.some((c: any) => c.status === "error" || c.status === "pending");
          await TestRun.updateOne(
            { _id: run._id },
            { status: hasFailures ? "failed" : "completed", completedAt: new Date() },
          );
        } catch (err) {
          console.error("[test-runs] Failed to finalize run:", err);
        }
      })();
    }

    return c.json({ _id: run._id, status: "running" }, 201);
  })
  .delete("/:runId", async (c) => {
    await connectDB();
    const run = await TestRun.findOne({
      _id: c.req.param("runId"),
      project: c.req.param("projectId")!,
    });
    if (!run) throw AppError.notFound("Test run not found");
    await run.deleteOne();
    return c.json({ ok: true });
  });

export default app;
