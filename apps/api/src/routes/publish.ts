import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { createHash } from "node:crypto";
import { getEnv } from "@archmax/core/config/env";
import { connectDB } from "@archmax/core/infra/db";
import { PublishEvent } from "@archmax/core/models/index";
import { PublishService } from "@archmax/core/services/publish";
import { invalidateScopedViews } from "@archmax/core/services/duckdb";
import { param, getGitService } from "../utils/params";
import { getRemoteConfig } from "../utils/github";
import { AppError } from "../utils/errors";

function getPublishService(): PublishService {
  return new PublishService(getEnv().projectsDir);
}

const EMPTY_HASH = createHash("sha256").digest("hex");

const app = new Hono()
  .post(
    "/",
    zValidator("json", z.object({ message: z.string().min(1, "Publish message is required") })),
    async (c) => {
      const projectId = param(c, "projectId");
      const { message } = c.req.valid("json");
      const svc = getPublishService();
      const gitSvc = getGitService(projectId);

      await gitSvc.ensureRepo();
      await connectDB();

      const remote = await getRemoteConfig(projectId);
      if (remote) {
        const syncResult = await gitSvc.pull(remote);
        if (syncResult.conflicts) {
          throw AppError.conflict(
            `Merge conflicts in: ${syncResult.conflictedFiles.join(", ")}. Resolve conflicts before publishing.`,
          );
        }
      }

      const modelNames = await svc.assemble(projectId);
      const contentHash = await svc.computeSourceHash(projectId);

      invalidateScopedViews(projectId);

      const oid = await gitSvc.commit(message);

      let pushWarning: string | undefined;
      if (remote) {
        try {
          await gitSvc.push(remote);
        } catch (err) {
          pushWarning = err instanceof Error ? err.message : "Push to remote failed";
          console.error("[publish] Push failed:", err);
        }
      }

      const event = await PublishEvent.create({
        project: projectId,
        message,
        modelNames,
        contentHash,
      });

      const response: Record<string, unknown> = { ...event.toJSON(), commitOid: oid };
      if (pushWarning) response.pushWarning = pushWarning;

      return c.json(response, 201);
    },
  )
  .get("/status", async (c) => {
    const projectId = param(c, "projectId");
    const svc = getPublishService();
    const gitSvc = getGitService(projectId);

    await connectDB();
    const lastEvent = await PublishEvent.findOne({ project: projectId })
      .sort({ createdAt: -1 })
      .lean();

    const currentHash = await svc.computeSourceHash(projectId);
    const hasModels = currentHash !== EMPTY_HASH;
    const conflictedFiles = await gitSvc.detectConflicts();

    return c.json({
      hasUnpublishedChanges: hasModels && (!lastEvent || lastEvent.contentHash !== currentHash),
      lastPublishedAt: lastEvent?.createdAt?.toISOString() ?? null,
      lastMessage: lastEvent?.message ?? null,
      hasConflicts: conflictedFiles.length > 0,
    });
  });

export default app;
