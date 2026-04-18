import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { connectDB } from "@archmax/core/infra/db";
import { param, getGitService } from "../utils/params";
import { getRemoteConfig } from "../utils/github";
import { AppError } from "../utils/errors";

const app = new Hono()
  .get("/status", async (c) => {
    const projectId = param(c, "projectId");
    const gitSvc = getGitService(projectId);
    const initialized = await gitSvc.isInitialized();
    return c.json({ initialized });
  })
  .post("/init", async (c) => {
    const projectId = param(c, "projectId");
    const gitSvc = getGitService(projectId);
    const { created } = await gitSvc.ensureRepo();
    return c.json({
      initialized: true,
      message: created ? "Repository initialized with initial commit" : "Repository already initialized",
    });
  })
  .post(
    "/revert-file",
    zValidator("json", z.object({ path: z.string().min(1) })),
    async (c) => {
      const projectId = param(c, "projectId");
      const { path: filePath } = c.req.valid("json");
      const gitSvc = getGitService(projectId);
      try {
        const result = await gitSvc.revertFile(filePath);
        return c.json({ path: filePath, ...result });
      } catch (err) {
        if (err instanceof Error && err.message.includes("not found")) {
          throw AppError.notFound(err.message);
        }
        throw err;
      }
    },
  )
  .post("/discard-all", async (c) => {
    const projectId = param(c, "projectId");
    const gitSvc = getGitService(projectId);
    await gitSvc.discardAllChanges();
    return c.json({ ok: true });
  })
  .get("/log", async (c) => {
    const projectId = param(c, "projectId");
    const limit = Math.min(parseInt(c.req.query("limit") ?? "20", 10) || 20, 100);
    const gitSvc = getGitService(projectId);
    const entries = await gitSvc.log(limit);
    return c.json(entries);
  })
  .post("/sync", async (c) => {
    const projectId = param(c, "projectId");
    await connectDB();
    const remote = await getRemoteConfig(projectId);
    if (!remote) throw AppError.badRequest("No remote repository configured");

    const gitSvc = getGitService(projectId);
    try {
      const result = await gitSvc.pull(remote);
      if (result.conflicts) {
        return c.json({
          conflicts: true,
          files: result.conflictedFiles,
          message: result.message,
        }, 200);
      }
      return c.json({
        conflicts: false,
        newCommits: result.newCommits,
        message: result.message,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      if (msg.includes("401") || msg.includes("auth") || msg.includes("Authentication")) {
        throw AppError.unauthorized("GitHub authentication failed — check your PAT");
      }
      throw AppError.badRequest(msg);
    }
  });

export default app;
