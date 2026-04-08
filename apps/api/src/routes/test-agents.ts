import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { connectDB } from "@archsem/core/infra/db";
import { TestAgent } from "@archsem/core/models/index";
import { encrypt, decrypt } from "@archsem/core/infra/crypto";
import { getEnv } from "@archsem/core/config/env";
import { AppError } from "../utils/errors";

export function maskApiKey(encryptedKey: string): string {
  if (!encryptedKey) return "";
  return "sk-...****";
}

function getEncryptionKey(): string | null {
  return getEnv().ENCRYPTION_KEY || null;
}

export function stripApiKey(agent: Record<string, unknown>): Record<string, unknown> {
  const { encryptedApiKey, ...rest } = agent;
  return { ...rest, apiKeySet: !!encryptedApiKey, apiKeyMasked: maskApiKey(encryptedApiKey as string) };
}

const createSchema = z.object({
  name: z.string().min(1),
  semanticModels: z.array(z.string()).default([]),
  systemPrompt: z.string().min(1),
  llmBaseUrl: z.string().min(1),
  apiKey: z.string().min(1),
  llmModel: z.string().min(1),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  semanticModels: z.array(z.string()).optional(),
  systemPrompt: z.string().min(1).optional(),
  llmBaseUrl: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
  llmModel: z.string().min(1).optional(),
});

const app = new Hono()
  .get("/", async (c) => {
    await connectDB();
    const projectId = c.req.param("projectId")!;
    const agents = await TestAgent.find({ project: projectId }).sort({ createdAt: -1 }).lean();
    return c.json(agents.map((a: Record<string, unknown>) => stripApiKey(a)));
  })
  .get("/:agentId", async (c) => {
    await connectDB();
    const agent = await TestAgent.findOne({
      _id: c.req.param("agentId"),
      project: c.req.param("projectId")!,
    }).lean();
    if (!agent) throw AppError.notFound("Test agent not found");
    return c.json(stripApiKey(agent as unknown as Record<string, unknown>));
  })
  .post("/", zValidator("json", createSchema), async (c) => {
    await connectDB();
    const projectId = c.req.param("projectId")!;
    const body = c.req.valid("json");
    const { apiKey, ...rest } = body;

    const key = getEncryptionKey();
    const encryptedApiKey = key ? encrypt(apiKey, key) : apiKey;

    const agent = await TestAgent.create({ ...rest, encryptedApiKey, project: projectId });
    return c.json(stripApiKey(agent.toObject() as unknown as Record<string, unknown>), 201);
  })
  .put("/:agentId", zValidator("json", updateSchema), async (c) => {
    await connectDB();
    const query = { _id: c.req.param("agentId"), project: c.req.param("projectId")! };
    const existing = await TestAgent.findOne(query).lean();
    if (!existing) throw AppError.notFound("Test agent not found");

    const body = c.req.valid("json");
    const update: Record<string, unknown> = { ...body };

    if (body.apiKey) {
      const key = getEncryptionKey();
      update.encryptedApiKey = key ? encrypt(body.apiKey, key) : body.apiKey;
      delete update.apiKey;
    } else {
      delete update.apiKey;
    }

    const agent = await TestAgent.findOneAndUpdate(query, { $set: update }, { new: true }).lean();
    if (!agent) throw AppError.notFound("Test agent not found");
    return c.json(stripApiKey(agent as unknown as Record<string, unknown>));
  })
  .post("/:agentId/test-connection", async (c) => {
    await connectDB();
    const agent = await TestAgent.findOne({
      _id: c.req.param("agentId"),
      project: c.req.param("projectId")!,
    }).lean();
    if (!agent) throw AppError.notFound("Test agent not found");

    const raw = (agent as any).encryptedApiKey as string;
    if (!raw) return c.json({ ok: false, error: "No API key configured" }, 400);

    const key = getEncryptionKey();
    let apiKey: string;
    try {
      apiKey = key ? decrypt(raw, key) : raw;
    } catch {
      return c.json({ ok: false, error: "Failed to decrypt API key" }, 500);
    }

    const baseUrl = ((agent as any).llmBaseUrl as string).replace(/\/+$/, "");
    const model = (agent as any).llmModel as string;

    try {
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Say hi" }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(body || `HTTP ${res.status}`);
      }
      return c.json({ ok: true });
    } catch (err: any) {
      const message = err?.name === "TimeoutError"
        ? "Request timed out after 15s"
        : err?.message || "Connection test failed";
      return c.json({ ok: false, error: message }, 400);
    }
  })
  .delete("/:agentId", async (c) => {
    await connectDB();
    const agent = await TestAgent.findOne({
      _id: c.req.param("agentId"),
      project: c.req.param("projectId")!,
    });
    if (!agent) throw AppError.notFound("Test agent not found");
    await agent.softDelete();
    return c.json({ ok: true });
  });

export default app;
