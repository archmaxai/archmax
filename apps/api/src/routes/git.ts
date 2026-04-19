import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { connectDB } from "@archmax/core/infra/db";
import { param, getGitService } from "../utils/params";
import { getRemoteConfig } from "../utils/github";
import { AppError } from "../utils/errors";
import { finalizePublish } from "../utils/publish-flow";

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
  .post("/reinit", async (c) => {
    const projectId = param(c, "projectId");
    const gitSvc = getGitService(projectId);
    await gitSvc.reinit();
    return c.json({
      initialized: true,
      message: "Repository re-initialized with fresh history",
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
  .get(
    "/log",
    zValidator("query", z.object({
      limit: z.string().optional(),
      page: z.string().optional(),
    })),
    async (c) => {
      const projectId = param(c, "projectId");
      const q = c.req.valid("query");
      const limit = Math.min(parseInt(q.limit ?? "10", 10) || 10, 100);
      const page = Math.max(parseInt(q.page ?? "1", 10) || 1, 1);
      const gitSvc = getGitService(projectId);
      const result = await gitSvc.log({ limit, page });
      return c.json(result);
    },
  )
  .post(
    "/revert-to-commit",
    zValidator("json", z.object({ oid: z.string().min(1) })),
    async (c) => {
      const projectId = param(c, "projectId");
      const { oid } = c.req.valid("json");
      const gitSvc = getGitService(projectId);
      try {
        const result = await gitSvc.revertToCommit(oid);
        if (!result) {
          return c.json({ oid, message: "Already at this version" });
        }

        const { oid: revertOid, pushWarning } = await finalizePublish(projectId, gitSvc, {
          publishMessage: result.message,
        });

        const response: Record<string, unknown> = {
          oid: revertOid,
          message: result.message,
        };
        if (pushWarning) response.pushWarning = pushWarning;

        return c.json(response);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Revert failed";
        throw AppError.badRequest(msg);
      }
    },
  )
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
