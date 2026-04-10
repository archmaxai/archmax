import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { McpServer, WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/server";
import { connectDB } from "@archmax/core/infra/db";
import { Project, McpToken, hashMcpToken } from "@archmax/core/models/index";
import { getEnv } from "@archmax/core/config/env";
import { SemanticModelFileService } from "@archmax/core/services/semantic-model-files";
import { PublishService } from "@archmax/core/services/publish";
import { registerArchmaxTools, type McpAuthContext, type McpToolContext } from "./archmax-server";

const _env = getEnv();
const MCP_RATE_WINDOW_MS = 60_000;
const MCP_RATE_MAX = parseInt(_env.MCP_RATE_LIMIT_MAX, 10) || 60;
const mcpRateBuckets = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of mcpRateBuckets) {
    if (now >= bucket.resetAt) mcpRateBuckets.delete(ip);
  }
}, MCP_RATE_WINDOW_MS).unref();

const UNAUTHORIZED = { error: "Invalid or missing authorization" } as const;

async function authenticateRequest(c: { req: { header: (name: string) => string | undefined; param: (name: string) => string | undefined } }, clientIp: string): Promise<McpAuthContext | null> {
  const authHeader = c.req.header("Authorization");
  const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!rawToken) return null;

  const slug = c.req.param("slug");
  if (!slug) return null;

  await connectDB();
  const project = await Project.findOne({ slug }).lean();
  if (!project) return null;

  const tokenHash = hashMcpToken(rawToken);
  const mcpToken = await McpToken.findOne({ tokenHash, project: project._id }).lean();
  if (!mcpToken) return null;

  if (mcpToken.expiresAt && mcpToken.expiresAt < new Date()) return null;

  McpToken.updateOne({ _id: mcpToken._id }, { $set: { lastUsedAt: new Date() } })
    .exec()
    .catch((err) => console.error("[MCP] Failed to update lastUsedAt:", err));

  return {
    projectId: project._id.toString(),
    scopes: mcpToken.scopes,
    tokenId: mcpToken._id.toString(),
    tokenName: mcpToken.name,
    clientIp,
    mcpPageSize: project.mcpPageSize ?? 50,
  };
}

function rateLimit(clientIp: string): number | null {
  const now = Date.now();
  let bucket = mcpRateBuckets.get(clientIp);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + MCP_RATE_WINDOW_MS };
    mcpRateBuckets.set(clientIp, bucket);
  }
  bucket.count++;
  if (bucket.count > MCP_RATE_MAX) {
    return Math.ceil((bucket.resetAt - now) / 1000);
  }
  return null;
}

// ── Session management ───────────────────────────────────────────────

interface McpSession {
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
  createdAt: number;
  tokenId: string;
}

const sessions = new Map<string, McpSession>();
const SESSION_TTL_MS = 30 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
      session.server.close().catch(() => {});
    }
  }
}, 60_000).unref();

// ── Route ────────────────────────────────────────────────────────────

const app = new Hono();

app.all("/", async (c) => {
  const clientIp = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const retryAfter = rateLimit(clientIp);
  if (retryAfter !== null) {
    c.header("Retry-After", String(retryAfter));
    return c.json({ error: "Too many requests" }, 429);
  }

  const sessionId = c.req.header("mcp-session-id");
  if (sessionId) {
    const session = sessions.get(sessionId);
    if (!session) {
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Session not found" }, id: null }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    await connectDB();
    const token = await McpToken.findById(session.tokenId).lean();
    if (!token || (token.expiresAt && token.expiresAt < new Date())) {
      sessions.delete(sessionId);
      session.server.close().catch(() => {});
      return c.json(UNAUTHORIZED, 401);
    }

    return session.transport.handleRequest(c.req.raw);
  }

  const authCtx = await authenticateRequest(c, clientIp);
  if (!authCtx) return c.json(UNAUTHORIZED, 401);

  const isTestRoute = c.req.path.includes("/test/");
  const dataDir = getEnv().ARCHMAX_DATA_DIR;
  let fileSvc: SemanticModelFileService;
  let tempDir: string | null = null;

  if (isTestRoute) {
    tempDir = await mkdtemp(join(tmpdir(), "archmax-test-build-"));
    const publishSvc = new PublishService(dataDir);
    const assembledDir = join(tempDir, authCtx.projectId);
    await publishSvc.assemble(authCtx.projectId, assembledDir);
    fileSvc = new SemanticModelFileService(tempDir, { subDir: "." });
  } else {
    fileSvc = new SemanticModelFileService(dataDir, { subDir: "build" });
  }

  const toolCtx: McpToolContext = { ...authCtx, fileSvc };

  const mcpServer = new McpServer({
    name: "archmax",
    version: "1.0.0",
    description: "Semantic layer tools for querying data models and connections",
  });

  const capturedTempDir = tempDir;
  const capturedTokenId = authCtx.tokenId ?? "";
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (sid) => {
      sessions.set(sid, { server: mcpServer, transport, createdAt: Date.now(), tokenId: capturedTokenId });
    },
  });

  await registerArchmaxTools(mcpServer, toolCtx);
  await mcpServer.connect(transport);

  transport.onclose = () => {
    const sid = transport.sessionId;
    if (sid) sessions.delete(sid);
    if (capturedTempDir) {
      rm(capturedTempDir, { recursive: true, force: true }).catch(() => {});
    }
  };

  return transport.handleRequest(c.req.raw);
});

export default app;
