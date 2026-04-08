import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { connectDB } from "@semlayer/core/infra/db";
import { TestRun, TestCase, TestAgent } from "@semlayer/core/models/index";
import { isRedisConfigured } from "@semlayer/core/infra/redis";
import { enqueueTestRunJob } from "@semlayer/core/queue/producer";
import { processTestCase } from "@semlayer/core/services/test-runner";
import { AppError } from "../utils/errors";

const createSchema = z.object({
  testAgentId: z.string().min(1),
  testCaseIds: z.array(z.string().min(1)).min(1),
});

const app = new Hono()
  .get("/", async (c) => {
    await connectDB();
    const projectId = c.req.param("projectId")!;
    const runs = await TestRun.find({ project: projectId })
      .sort({ createdAt: -1 })
      .populate("testAgent", "name")
      .lean();

    const summary = runs.map((r: any) => {
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
    return c.json(summary);
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
    const { testAgentId, testCaseIds } = c.req.valid("json");

    const agent = await TestAgent.findOne({ _id: testAgentId, project: projectId }).lean();
    if (!agent) throw AppError.notFound("Test agent not found");

    const cases = await TestCase.find({ _id: { $in: testCaseIds }, project: projectId }).lean();
    if (cases.length === 0) throw AppError.badRequest("No valid test cases found");

    const run = await TestRun.create({
      project: projectId,
      testAgent: testAgentId,
      status: "pending",
      cases: cases.map((tc) => ({
        testCase: tc._id,
        title: tc.title,
        semanticModel: tc.semanticModel,
        inputMessage: tc.inputMessage,
        expectedFacts: tc.expectedFacts,
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
        const tc = cases[i];
        await enqueueTestRunJob({
          testRunId: run._id.toString(),
          caseIndex: i,
          testAgentId,
          semanticModel: tc.semanticModel,
          inputMessage: tc.inputMessage,
          expectedFacts: tc.expectedFacts,
        });
      }
    } else {
      (async () => {
        try {
          for (let i = 0; i < cases.length; i++) {
            const tc = cases[i];
            await processTestCase(
              run._id.toString(),
              i,
              testAgentId,
              tc.semanticModel,
              tc.inputMessage,
              tc.expectedFacts,
            );
          }
          await TestRun.updateOne({ _id: run._id }, { status: "completed", completedAt: new Date() });
        } catch (err) {
          console.error("[test-runs] In-process batch failed:", err);
          await TestRun.updateOne({ _id: run._id }, { status: "failed", completedAt: new Date() });
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
