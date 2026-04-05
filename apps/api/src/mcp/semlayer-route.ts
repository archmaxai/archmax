import { Hono } from "hono";
import crypto from "node:crypto";
import { getSemlayerTools, getToolSchema, getToolRequired } from "./semlayer-server";
import { safeTokenCompare } from "../utils/crypto";
import { getEnv } from "@semlayer/core/config/env";

const _env = getEnv();
const MCP_BEARER_TOKEN = _env.MCP_BEARER_TOKEN || (() => {
  const generated = crypto.randomBytes(24).toString("hex");
  console.warn(
    `[MCP] MCP_BEARER_TOKEN is not set — generated ephemeral token: ${generated}\n` +
    `[MCP] Set MCP_BEARER_TOKEN in your environment to use a stable token.`,
  );
  return generated;
})();

const MCP_RATE_WINDOW_MS = 60_000;
const MCP_RATE_MAX = parseInt(_env.MCP_RATE_LIMIT_MAX, 10);
const mcpRateBuckets = new Map<string, { count: number; resetAt: number }>();

const app = new Hono();

app.post("/", async (c) => {
  const clientIp = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  let bucket = mcpRateBuckets.get(clientIp);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + MCP_RATE_WINDOW_MS };
    mcpRateBuckets.set(clientIp, bucket);
  }
  bucket.count++;
  if (bucket.count > MCP_RATE_MAX) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    c.header("Retry-After", String(retryAfter));
    return c.json({ error: "Too many requests" }, 429);
  }

  const authHeader = c.req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return c.json({ error: "Missing authorization" }, 401);
  if (!safeTokenCompare(token, MCP_BEARER_TOKEN)) {
    return c.json({ error: "Invalid authorization token" }, 401);
  }

  const body = await c.req.json<{
    jsonrpc?: string;
    method?: string;
    params?: Record<string, unknown>;
    id?: string | number;
  }>();

  if (body.method === "tools/list") {
    console.log(`[MCP] tools/list id=${body.id}`);
    const tools = getSemlayerTools();
    const toolList = Object.entries(tools).map(([name, t]) => ({
      name,
      description: t.description,
      inputSchema: {
        type: "object" as const,
        properties: getToolSchema(name),
        required: getToolRequired(name),
      },
    }));
    return c.json({ jsonrpc: "2.0", id: body.id, result: { tools: toolList } });
  }

  if (body.method === "tools/call") {
    const toolName = (body.params?.name as string) || "";
    const toolArgs = (body.params?.arguments as Record<string, unknown>) || {};
    const tools = getSemlayerTools();
    const tool = tools[toolName];
    if (!tool) {
      console.warn(`[MCP] tools/call unknown tool="${toolName}" id=${body.id}`);
      return c.json({
        jsonrpc: "2.0",
        id: body.id,
        error: { code: -32601, message: `Unknown tool: ${toolName}` },
      });
    }
    const start = Date.now();
    console.log(`[MCP] tools/call tool="${toolName}" args=${JSON.stringify(toolArgs)} id=${body.id}`);
    try {
      const result = await tool.handler(toolArgs);
      const ms = Date.now() - start;
      console.log(`[MCP] tools/call tool="${toolName}" ok=${!result.isError} ${ms}ms id=${body.id}`);
      return c.json({ jsonrpc: "2.0", id: body.id, result });
    } catch (err) {
      const ms = Date.now() - start;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[MCP] tools/call tool="${toolName}" error="${msg}" ${ms}ms id=${body.id}`);
      return c.json({
        jsonrpc: "2.0",
        id: body.id,
        result: { content: [{ type: "text", text: `Error: ${msg}` }], isError: true },
      });
    }
  }

  console.warn(`[MCP] unknown method="${body.method}" id=${body.id}`);
  return c.json({
    jsonrpc: "2.0",
    id: body.id,
    error: { code: -32601, message: `Unknown method: ${body.method}` },
  });
});

export default app;
