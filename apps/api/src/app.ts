import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { logger } from "hono/logger";
import { getEnv } from "@archmax/core/config/env";
import { runHealthChecks } from "@archmax/core/infra/health";
import { corsMiddleware } from "./middleware/cors";
import { AppError } from "./utils/errors";
import { auth } from "./lib/auth";

import projects from "./routes/projects";
import connections from "./routes/connections";
import conversations from "./routes/conversations";
import semanticModels from "./routes/semantic-models";
import mcpTokens from "./routes/mcp-tokens";
import mcpLogs from "./routes/mcp-logs";
import agentChat from "./routes/agent";
import dataBrowser from "./routes/data-browser";
import documents from "./routes/documents";
import publish from "./routes/publish";
import github, { githubCallback } from "./routes/github";
import testAgents from "./routes/test-agents";
import testCases from "./routes/test-cases";
import testRuns from "./routes/test-runs";
import playground from "./routes/playground";
import improvements from "./routes/improvements";
import dashboard from "./routes/dashboard";
import archmaxMcp from "./mcp/archmax-route";

const app = new Hono()
  .use("*", logger())
  .use("/api/*", corsMiddleware)
  .use("/api/*", async (c, next) => {
    const method = c.req.method;
    if (method === "POST" || method === "PUT" || method === "PATCH") {
      const cl = c.req.header("content-length");
      const hasBody = cl !== undefined && cl !== "0";
      if (hasBody) {
        const ct = c.req.header("content-type") ?? "";
        const isJson = ct.startsWith("application/json");
        const isMultipart = ct.startsWith("multipart/");
        const isAuthRoute = c.req.path.startsWith("/api/auth/");
        if (!isJson && !isMultipart && !isAuthRoute) {
          return c.json({ error: "Content-Type must be application/json" }, 415);
        }
      }
    }
    await next();
  })
  .use("/api/*", async (c, next) => {
    await next();
    if (!c.res.headers.has("Cache-Control")) {
      c.res.headers.set("Cache-Control", "no-store");
    }
  })
  .get("/api/health", async (c) => {
    const result = await runHealthChecks();
    return c.json(result, result.status === "healthy" ? 200 : 503);
  })
  .get("/api/config", (c) => {
    const env = getEnv();
    return c.json({
      githubEnabled: !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
      agentConfigured: !!env.AGENT_API_KEY,
    });
  })
  .on(["POST", "GET"], "/api/auth/**", (c) => auth.handler(c.req.raw))
  .route("/api/github", githubCallback)
  .route("/mcp/:slug/mcp", archmaxMcp)
  .route("/mcp/:slug/test/mcp", archmaxMcp)
  .use("/api/*", async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    await next();
  })
  .get("/api/version", (c) => {
    return c.json({ version: getEnv().APP_VERSION });
  })
  .route("/api/projects", projects)
  .route("/api/projects/:projectId/connections", connections)
  .route("/api/projects/:projectId/conversations", conversations)
  .route("/api/projects/:projectId/semantic-models", semanticModels)
  .route("/api/projects/:projectId/mcp-tokens", mcpTokens)
  .route("/api/projects/:projectId/mcp-logs", mcpLogs)
  .route("/api/projects/:projectId/agent", agentChat)
  .route("/api/projects/:projectId/data-browser", dataBrowser)
  .route("/api/projects/:projectId/documents", documents)
  .route("/api/projects/:projectId/publish", publish)
  .route("/api/projects/:projectId/github", github)
  .route("/api/projects/:projectId/test-agents", testAgents)
  .route("/api/projects/:projectId/test-cases", testCases)
  .route("/api/projects/:projectId/test-runs", testRuns)
  .route("/api/projects/:projectId/playground", playground)
  .route("/api/projects/:projectId/improvements", improvements)
  .route("/api/projects/:projectId/dashboard-stats", dashboard);

app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json(
      { error: err.message, ...(err.code ? { code: err.code } : {}) },
      err.statusCode as ContentfulStatusCode,
    );
  }
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal server error" }, 500);
});

export type AppType = typeof app;
export default app;
