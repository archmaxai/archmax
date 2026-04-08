import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { connectDB } from "@semlayer/core/infra/db";
import { Connection, CONNECTION_TYPES, SLUG_PATTERN, slugifyConnectionName, Project, type IConnectionDocument } from "@semlayer/core/models/index";
import { getProjectInstance } from "@semlayer/core/services/duckdb";
import { AppError } from "../utils/errors";

const connectionConfigSchema = z.object({
  host: z.string().optional(),
  port: z.number().optional(),
  database: z.string().optional(),
  schema: z.string().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  uri: z.string().optional(),
}).passthrough();

export const REDACTED_SENTINEL = "********";

export function redactConnectionConfig(config: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...config };
  if (redacted.password) redacted.password = REDACTED_SENTINEL;
  if (typeof redacted.uri === "string") {
    try {
      const url = new URL(redacted.uri);
      if (url.password) {
        url.password = REDACTED_SENTINEL;
        redacted.uri = url.toString();
      }
    } catch {
      // not a valid URL, leave as-is
    }
  }
  return redacted;
}

function uriContainsSentinel(uri: string): boolean {
  try {
    return decodeURIComponent(new URL(uri).password) === REDACTED_SENTINEL;
  } catch {
    return false;
  }
}

export function mergeConnectionConfig(
  incoming: Record<string, unknown>,
  stored: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...incoming };

  const pw = merged.password as string | undefined;
  if (!pw || pw === REDACTED_SENTINEL) {
    if (stored.password) {
      merged.password = stored.password;
    } else {
      delete merged.password;
    }
  }

  if (typeof merged.uri === "string" && uriContainsSentinel(merged.uri)) {
    if (typeof stored.uri === "string") {
      merged.uri = stored.uri;
    }
  }

  return merged;
}

function redactConnection(conn: Record<string, unknown>): Record<string, unknown> {
  if (conn.connectionConfig && typeof conn.connectionConfig === "object") {
    return { ...conn, connectionConfig: redactConnectionConfig(conn.connectionConfig as Record<string, unknown>) };
  }
  return conn;
}

const slugSchema = z.string().regex(SLUG_PATTERN, "Slug must start with a letter or underscore and contain only alphanumeric characters and underscores");

const createSchema = z.object({
  name: z.string().min(1),
  slug: slugSchema.optional(),
  type: z.enum(CONNECTION_TYPES),
  connectionConfig: connectionConfigSchema,
  description: z.string().optional().default(""),
  isActive: z.boolean().optional().default(true),
});

const updateSchema = createSchema.partial();

const app = new Hono()
  .get("/", async (c) => {
    await connectDB();
    const projectId = c.req.param("projectId")!;
    const connections = await Connection.find({ project: projectId }).sort({ createdAt: -1 }).lean();
    return c.json(connections.map((c) => redactConnection(c as unknown as Record<string, unknown>)));
  })
  .get("/:id", async (c) => {
    await connectDB();
    const conn = await Connection.findOne({
      _id: c.req.param("id"),
      project: c.req.param("projectId")!,
    }).lean();
    if (!conn) throw AppError.notFound("Connection not found");
    return c.json(redactConnection(conn as unknown as Record<string, unknown>));
  })
  .post("/", zValidator("json", createSchema), async (c) => {
    await connectDB();
    const projectId = c.req.param("projectId")!;
    const project = await Project.findById(projectId).lean();
    if (!project) throw AppError.notFound("Project not found");

    const body = c.req.valid("json");
    const slug = body.slug || slugifyConnectionName(body.name);
    const conn = await Connection.create({ ...body, slug, project: projectId });
    return c.json(redactConnection(conn.toObject() as unknown as Record<string, unknown>), 201);
  })
  .put("/:id", zValidator("json", updateSchema), async (c) => {
    await connectDB();
    const query = { _id: c.req.param("id"), project: c.req.param("projectId")! };
    const existing = await Connection.findOne(query).lean();
    if (!existing) throw AppError.notFound("Connection not found");

    const body = c.req.valid("json");
    if (body.connectionConfig) {
      body.connectionConfig = mergeConnectionConfig(
        body.connectionConfig as Record<string, unknown>,
        (existing.connectionConfig ?? {}) as Record<string, unknown>,
      );
    }

    const conn = await Connection.findOneAndUpdate(query, { $set: body }, { new: true }).lean();
    if (!conn) throw AppError.notFound("Connection not found");
    return c.json(redactConnection(conn as unknown as Record<string, unknown>));
  })
  .delete("/:id", async (c) => {
    await connectDB();
    const conn = await Connection.findOne({
      _id: c.req.param("id"),
      project: c.req.param("projectId")!,
    });
    if (!conn) throw AppError.notFound("Connection not found");

    await conn.softDelete();
    return c.json({ ok: true });
  })
  .post("/:id/test", async (c) => {
    await connectDB();
    const projectId = c.req.param("projectId")!;
    const conn = await Connection.findOne({
      _id: c.req.param("id"),
      project: projectId,
    });
    if (!conn) throw AppError.notFound("Connection not found");

    try {
      const instance = await getProjectInstance(
        projectId,
        [conn] as IConnectionDocument[],
        { readOnly: true },
      );
      const db = await instance.connect();
      try {
        await db.run("SELECT 1");
      } finally {
        db.disconnectSync();
      }
      return c.json({ ok: true });
    } catch {
      return c.json(
        { ok: false, error: "Connection test failed. Check your connection settings and try again." },
        400,
      );
    }
  });

export default app;
