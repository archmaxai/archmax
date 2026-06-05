import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { connectDB } from "@archmax/core/infra/db";
import { Project } from "@archmax/core/models/index";
import {
  executeDuckdbConsoleQuery,
  getDuckdbConsoleSetup,
  installDuckdbConsoleExtension,
} from "@archmax/core/services/duckdb-console";
import { AppError } from "../utils/errors";

function safeJson(c: Context, data: unknown): Response {
  const body = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
  return c.newResponse(body, 200, { "Content-Type": "application/json" });
}

const sqlBodySchema = z.object({
  sql: z.string().min(1),
});

const app = new Hono()
  .get("/setup", async (c) => {
    const projectId = c.req.param("projectId") as string;
    await connectDB();
    const project = await Project.findById(projectId).lean();
    if (!project) throw AppError.notFound("Project not found");

    try {
      const setup = await getDuckdbConsoleSetup(projectId);
      return safeJson(c, setup);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "Project not found") throw AppError.notFound(message);
      throw err;
    }
  })

  .post("/query", zValidator("json", sqlBodySchema), async (c) => {
    const projectId = c.req.param("projectId") as string;
    const { sql } = c.req.valid("json");

    try {
      const result = await executeDuckdbConsoleQuery(projectId, sql);
      return safeJson(c, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "Project not found") throw AppError.notFound(message);
      if (
        message.includes("not allowed")
        || message.includes("single SQL")
        || message.includes("empty")
        || message.includes("statement type")
      ) {
        throw AppError.badRequest(message);
      }
      if (message.includes("timed out")) {
        throw new AppError(504, message);
      }
      throw AppError.badRequest(message);
    }
  })

  .post("/extensions", zValidator("json", sqlBodySchema), async (c) => {
    const projectId = c.req.param("projectId") as string;
    const { sql } = c.req.valid("json");

    try {
      const result = await installDuckdbConsoleExtension(projectId, sql);
      return c.json({ ok: true, ...result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message === "Project not found") throw AppError.notFound(message);
      if (
        message.includes("must be INSTALL")
        || message.includes("Invalid extension")
        || message.includes("single statement")
      ) {
        throw AppError.badRequest(message);
      }
      throw AppError.badRequest(message);
    }
  });

export default app;
