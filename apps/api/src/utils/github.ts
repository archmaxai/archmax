import { getEnv } from "@archmax/core/config/env";
import { Project } from "@archmax/core/models/index";
import { decrypt } from "@archmax/core/infra/crypto";
import type { GitRemoteConfig } from "@archmax/core/services/git";

/**
 * Load the decrypted GitHub remote config for a project.
 * Returns null if the project has no configured GitHub integration
 * or if ENCRYPTION_KEY is not set.
 */
export async function getRemoteConfig(projectId: string): Promise<GitRemoteConfig | null> {
  const project = await Project.findById(projectId).lean();
  if (!project?.github?.encryptedToken || !project.github.url) return null;

  const encryptionKey = getEnv().ENCRYPTION_KEY;
  if (!encryptionKey) return null;

  return {
    url: project.github.url,
    branch: project.github.branch || "main",
    token: decrypt(project.github.encryptedToken, encryptionKey),
  };
}
