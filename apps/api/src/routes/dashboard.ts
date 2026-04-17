import { Hono } from "hono";
import mongoose from "mongoose";
import { connectDB } from "@archmax/core/infra/db";
import { Connection, McpToken, McpCallLog, Improvement } from "@archmax/core/models/index";
import { SemanticModelFileService } from "@archmax/core/services/semantic-model-files";
import { getEnv } from "@archmax/core/config/env";

function getFileService(): SemanticModelFileService {
  return new SemanticModelFileService(getEnv().projectsDir);
}

async function aggregateCallsByDay(projectId: string, since: Date) {
  const result = await McpCallLog.aggregate([
    {
      $match: {
        project: new mongoose.Types.ObjectId(projectId),
        createdAt: { $gte: since },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        calls: { $sum: 1 },
        errors: { $sum: { $cond: ["$isError", 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const byDay: Record<string, { calls: number; errors: number }> = {};
  for (const row of result) {
    byDay[row._id as string] = { calls: row.calls as number, errors: row.errors as number };
  }

  const days: { date: string; calls: number; errors: number }[] = [];
  const cursor = new Date(since);
  const today = new Date();
  while (cursor <= today) {
    const key = cursor.toISOString().slice(0, 10);
    const entry = byDay[key];
    days.push({ date: key, calls: entry?.calls ?? 0, errors: entry?.errors ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

const app = new Hono().get("/", async (c) => {
  await connectDB();
  const projectId = c.req.param("projectId")!;
  const daysParam = c.req.query("days");
  const days = Math.min(90, Math.max(1, parseInt(daysParam || "14", 10)));

  const since = new Date();
  since.setDate(since.getDate() - days);

  const svc = getFileService();

  const queryToolNames = ["execute_query", "execute_stored_query"];

  const [
    connectionsTotal,
    tokensTotal,
    openImprovements,
    totalCalls,
    errorCalls,
    totalQueries,
    models,
    callsByDay,
  ] = await Promise.all([
    Connection.countDocuments({ project: projectId }),
    McpToken.countDocuments({ project: projectId }),
    Improvement.countDocuments({ project: projectId, status: "pending" }),
    McpCallLog.countDocuments({ project: projectId, createdAt: { $gte: since } }),
    McpCallLog.countDocuments({ project: projectId, createdAt: { $gte: since }, isError: true }),
    McpCallLog.countDocuments({ project: projectId, createdAt: { $gte: since }, toolName: { $in: queryToolNames } }),
    svc.list(projectId),
    aggregateCallsByDay(projectId, since),
  ]);

  const totalDatasets = models.reduce((sum, m) => sum + m.datasets.length, 0);

  return c.json({
    connections: { total: connectionsTotal, totalQueries },
    semanticModels: {
      total: models.length,
      openImprovements,
      totalDatasets,
    },
    mcpAccess: {
      tokens: tokensTotal,
      totalCalls,
      errorCalls,
      callsByDay,
    },
  });
});

export default app;
