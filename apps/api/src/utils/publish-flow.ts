import { getEnv } from "@archmax/core/config/env";
import { connectDB } from "@archmax/core/infra/db";
import { PublishEvent } from "@archmax/core/models/index";
import type { IPublishEventDocument } from "@archmax/core/models/PublishEvent";
import { PublishService } from "@archmax/core/services/publish";
import type { GitService } from "@archmax/core/services/git";
import { getRemoteConfig } from "./github";

export interface FinalizePublishOptions {
  /** Message stored on the PublishEvent (visible in history). */
  publishMessage: string;
  /** Git commit message; defaults to publishMessage. */
  commitMessage?: string;
}

export interface FinalizePublishResult {
  oid: string;
  event: IPublishEventDocument;
  modelNames: string[];
  contentHash: string;
  pushWarning?: string;
}

/**
 * Reassembles the build output, creates a commit, optionally pushes to the
 * configured remote, and records a PublishEvent. Shared by the publish route
 * and the revert-to-commit flow so both always stay in lockstep.
 */
export async function finalizePublish(
  projectId: string,
  gitSvc: GitService,
  opts: FinalizePublishOptions,
): Promise<FinalizePublishResult> {
  const { publishMessage, commitMessage = publishMessage } = opts;
  const svc = new PublishService(getEnv().projectsDir);

  const modelNames = await svc.assemble(projectId);
  const contentHash = await svc.computeSourceHash(projectId);

  // Stateless materialisation: scoped VIEWs are (re)created on every
  // model-scoped query against the project's persistent DuckDB file, so
  // there is no in-memory cache for the publish flow to invalidate.

  const oid = await gitSvc.commit(commitMessage);

  await connectDB();

  let pushWarning: string | undefined;
  const remote = await getRemoteConfig(projectId);
  if (remote) {
    try {
      await gitSvc.push(remote);
    } catch (err) {
      pushWarning = err instanceof Error ? err.message : "Push to remote failed";
      console.error("[publish] Push failed:", err);
    }
  }

  const event = new PublishEvent({
    project: projectId,
    message: publishMessage,
    modelNames,
    contentHash,
  });
  await event.save();

  return { oid, event, modelNames, contentHash, pushWarning };
}
