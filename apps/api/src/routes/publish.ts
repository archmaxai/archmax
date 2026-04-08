import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { Octokit } from "octokit";
import { getEnv } from "@semlayer/core/config/env";
import { connectDB } from "@semlayer/core/infra/db";
import { Project, PublishEvent } from "@semlayer/core/models/index";
import { PublishService } from "@semlayer/core/services/publish";
import { decrypt } from "@semlayer/core/infra/crypto";
import { invalidateScopedViews } from "@semlayer/core/services/duckdb";
import { AppError } from "../utils/errors";

function getPublishService(): PublishService {
  return new PublishService(getEnv().SEMLAYER_DATA_DIR);
}

function param(c: { req: { param: (name: string) => string | undefined } }, name: string): string {
  const val = c.req.param(name);
  if (!val) throw AppError.badRequest(`Missing parameter: ${name}`);
  return val;
}

async function collectFiles(dir: string, base: string): Promise<Array<{ path: string; content: string }>> {
  const files: Array<{ path: string; content: string }> = [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const s = await stat(fullPath).catch(() => null);
    if (!s) continue;
    if (s.isDirectory()) {
      files.push(...(await collectFiles(fullPath, base)));
    } else if (s.isFile()) {
      const content = await readFile(fullPath, "utf-8");
      files.push({ path: relative(base, fullPath), content });
    }
  }
  return files;
}

async function pushToGitHub(projectId: string, message: string): Promise<void> {
  await connectDB();
  const project = await Project.findById(projectId).lean();
  if (!project?.github?.encryptedToken || !project.github.repo) return;

  const env = getEnv();
  if (!env.ENCRYPTION_KEY) return;

  const token = decrypt(project.github.encryptedToken, env.ENCRYPTION_KEY);
  const octokit = new Octokit({ auth: token });

  const [owner, repo] = project.github.repo.includes("/")
    ? project.github.repo.split("/")
    : [project.github.owner, project.github.repo];
  const branch = project.github.branch || "main";

  const dataDir = env.SEMLAYER_DATA_DIR;
  const projectDir = join(dataDir, projectId);
  const allFiles = await collectFiles(projectDir, projectDir);
  if (allFiles.length === 0) return;

  const blobs = await Promise.all(
    allFiles.map(async (f) => {
      const { data } = await octokit.rest.git.createBlob({ owner, repo, content: f.content, encoding: "utf-8" });
      return { path: f.path, sha: data.sha, mode: "100644" as const, type: "blob" as const };
    }),
  );

  let parentSha: string | undefined;
  try {
    const { data: ref } = await octokit.rest.git.getRef({ owner, repo, ref: `heads/${branch}` });
    parentSha = ref.object.sha;
  } catch {
    // branch doesn't exist yet — will create
  }

  const baseTree = parentSha
    ? (await octokit.rest.git.getCommit({ owner, repo, commit_sha: parentSha })).data.tree.sha
    : undefined;

  const { data: tree } = await octokit.rest.git.createTree({
    owner,
    repo,
    tree: blobs,
    base_tree: baseTree,
  });

  const { data: commit } = await octokit.rest.git.createCommit({
    owner,
    repo,
    message,
    tree: tree.sha,
    parents: parentSha ? [parentSha] : [],
  });

  if (parentSha) {
    await octokit.rest.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: commit.sha });
  } else {
    await octokit.rest.git.createRef({ owner, repo, ref: `refs/heads/${branch}`, sha: commit.sha });
  }
}

const app = new Hono()
  .post(
    "/",
    zValidator("json", z.object({ message: z.string().min(1, "Publish message is required") })),
    async (c) => {
      const projectId = param(c, "projectId");
      const { message } = c.req.valid("json");
      const svc = getPublishService();

      const modelNames = await svc.assemble(projectId);
      const contentHash = await svc.computeSourceHash(projectId);

      invalidateScopedViews(projectId);

      await connectDB();
      const event = await PublishEvent.create({
        project: projectId,
        message,
        modelNames,
        contentHash,
      });

      pushToGitHub(projectId, message).catch((err) => {
        console.error("[publish] GitHub push failed:", err);
      });

      return c.json(event.toJSON(), 201);
    },
  )
  .get("/status", async (c) => {
    const projectId = param(c, "projectId");
    const svc = getPublishService();

    await connectDB();
    const lastEvent = await PublishEvent.findOne({ project: projectId })
      .sort({ createdAt: -1 })
      .lean();

    const currentHash = await svc.computeSourceHash(projectId);
    const hasModels = currentHash !== EMPTY_HASH;

    return c.json({
      hasUnpublishedChanges: hasModels && (!lastEvent || lastEvent.contentHash !== currentHash),
      lastPublishedAt: lastEvent?.createdAt?.toISOString() ?? null,
      lastMessage: lastEvent?.message ?? null,
    });
  });

const EMPTY_HASH = createHash("sha256").digest("hex");

export default app;
