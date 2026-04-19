import { join } from "node:path";
import { getEnv } from "@archmax/core/config/env";
import { GitService } from "@archmax/core/services/git";
import { assertSafeSegment } from "@archmax/core/services/semantic-model-files";
import { AppError } from "./errors";

/**
 * Extract a required route parameter, throwing 400 if absent.
 * Works with Hono's context object.
 */
export function param(
  c: { req: { param: (name: string) => string | undefined } },
  name: string,
): string {
  const val = c.req.param(name);
  if (!val) throw AppError.badRequest(`Missing parameter: ${name}`);
  return val;
}

/** Create a GitService scoped to the given project, with path-safety validation. */
export function getGitService(projectId: string): GitService {
  assertSafeSegment(projectId, "projectId");
  return new GitService(join(getEnv().projectsDir, projectId));
}
