import { createHmac, randomBytes } from "node:crypto";
import { Hono } from "hono";
import { OAuthApp } from "@octokit/oauth-app";
import { Octokit } from "octokit";
import { connectDB } from "@archsem/core/infra/db";
import { Project } from "@archsem/core/models/index";
import { getEnv } from "@archsem/core/config/env";
import { encrypt, decrypt } from "@archsem/core/infra/crypto";
import { AppError } from "../utils/errors";

function getOAuthApp() {
  const env = getEnv();
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    throw AppError.badRequest("GitHub integration is not configured (missing GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET)");
  }
  return new OAuthApp({ clientType: "oauth-app", clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET });
}

function getEncryptionKey(): string {
  const key = getEnv().ENCRYPTION_KEY;
  if (!key) throw AppError.badRequest("ENCRYPTION_KEY is required for GitHub integration");
  return key;
}

function param(c: { req: { param: (name: string) => string | undefined } }, name: string): string {
  const val = c.req.param(name);
  if (!val) throw AppError.badRequest(`Missing parameter: ${name}`);
  return val;
}

const STATE_TTL_MS = 10 * 60 * 1000;

function signOAuthState(payload: Record<string, string>): string {
  const nonce = randomBytes(16).toString("hex");
  const ts = Date.now().toString();
  const data = JSON.stringify({ ...payload, nonce, ts });
  const sig = createHmac("sha256", getEnv().BETTER_AUTH_SECRET)
    .update(data)
    .digest("hex");
  return Buffer.from(JSON.stringify({ data, sig })).toString("base64url");
}

function verifyOAuthState(raw: string): Record<string, string> {
  let outer: { data: string; sig: string };
  try {
    outer = JSON.parse(Buffer.from(raw, "base64url").toString());
  } catch {
    throw AppError.badRequest("Invalid state parameter");
  }

  const expected = createHmac("sha256", getEnv().BETTER_AUTH_SECRET)
    .update(outer.data)
    .digest("hex");

  if (expected.length !== outer.sig.length) throw AppError.badRequest("Invalid state signature");
  const a = Buffer.from(expected);
  const b = Buffer.from(outer.sig);
  if (!a.equals(b)) throw AppError.badRequest("Invalid state signature");

  const parsed = JSON.parse(outer.data);
  const age = Date.now() - Number(parsed.ts);
  if (age > STATE_TTL_MS) throw AppError.badRequest("OAuth state expired");
  return parsed;
}

/**
 * Mounted before auth middleware — handles the GitHub OAuth redirect.
 */
export const githubCallback = new Hono().get("/callback", async (c) => {
  const code = c.req.query("code");
  const stateRaw = c.req.query("state");
  if (!code || !stateRaw) throw AppError.badRequest("Missing code or state");

  const statePayload = verifyOAuthState(stateRaw);
  const projectId = statePayload.projectId;
  if (!projectId) throw AppError.badRequest("Missing projectId in state");

  const oauthApp = getOAuthApp();
  const { authentication } = await oauthApp.createToken({ code });
  const token = authentication.token;

  const octokit = new Octokit({ auth: token });
  const { data: user } = await octokit.rest.users.getAuthenticated();

  const encryptedToken = encrypt(token, getEncryptionKey());

  await connectDB();
  await Project.updateOne(
    { _id: projectId },
    {
      $set: {
        "github.owner": user.login,
        "github.encryptedToken": encryptedToken,
        "github.branch": "main",
        "github.repo": "",
      },
    },
  );

  const env = getEnv();
  const baseUrl = env.corsOrigins[0] ?? "http://localhost:5173";
  const project = await Project.findById(projectId).lean();
  const settingsUrl = `${baseUrl}/${project?.slug ?? projectId}/settings`;
  return c.redirect(settingsUrl);
});

/**
 * Mounted behind auth middleware — project-scoped GitHub operations.
 */
const app = new Hono()
  .get("/authorize", async (c) => {
    const projectId = param(c, "projectId");
    const oauthApp = getOAuthApp();

    const origin = new URL(c.req.url).origin;
    const { url } = oauthApp.getWebFlowAuthorizationUrl({
      scopes: ["repo"],
      state: signOAuthState({ projectId }),
      redirectUrl: `${origin}/api/github/callback`,
    });

    return c.redirect(url);
  })
  .get("/repos", async (c) => {
    const projectId = param(c, "projectId");
    await connectDB();
    const project = await Project.findById(projectId).lean();
    if (!project) throw AppError.notFound("Project not found");
    if (!project.github?.encryptedToken) {
      throw AppError.badRequest("GitHub is not connected for this project");
    }

    const token = decrypt(project.github.encryptedToken, getEncryptionKey());
    const octokit = new Octokit({ auth: token });

    const repos: Array<{ full_name: string; name: string; owner: string }> = [];
    for await (const response of octokit.paginate.iterator(octokit.rest.repos.listForAuthenticatedUser, {
      sort: "updated",
      per_page: 100,
      affiliation: "owner,collaborator,organization_member",
    })) {
      for (const repo of response.data) {
        if (repo.permissions?.push) {
          repos.push({ full_name: repo.full_name, name: repo.name, owner: repo.owner.login });
        }
      }
    }

    return c.json(repos);
  })
  .delete("/", async (c) => {
    const projectId = param(c, "projectId");
    await connectDB();
    await Project.updateOne({ _id: projectId }, { $unset: { github: "" } });
    return c.json({ ok: true });
  });

export default app;
