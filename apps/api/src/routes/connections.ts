import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v4";
import { connectDB } from "@archmax/core/infra/db";
import { Connection, CONNECTION_TYPES, SLUG_PATTERN, slugifyConnectionName, Project, type IConnectionDocument } from "@archmax/core/models/index";
import { deleteProjectDuckdbFile, disposeProjectInstance, getProjectInstance, testSingleConnection, withQueryTimeout } from "@archmax/core/services/duckdb";
import { encryptConnectionCredentials, decryptConnectionCredentials } from "@archmax/core/infra/crypto";
import { getEnv } from "@archmax/core/config/env";
import { AppError } from "../utils/errors";

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const CONNECTION_TEST_TIMEOUT_MS = 15_000;

const connectionConfigSchema = z.object({
  host: z.string().optional(),
  port: z.number().optional(),
  database: z.string().optional(),
  schema: z.string().regex(IDENTIFIER_RE, "Schema must be a valid SQL identifier").optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  uri: z.string().optional(),
  encrypt: z.boolean().optional(),
  endpoint: z.url("Endpoint must be a valid URL").optional(),
  warehouse: z.string().optional(),
  token: z.string().optional(),
  authorizationType: z.enum(["bearer", "oauth2"]).optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  oauth2ServerUri: z.string().optional(),
}).strict();

export const REDACTED_SENTINEL = "********";

function getEncryptionKey(): string | null {
  return getEnv().ENCRYPTION_KEY || null;
}

export function redactConnectionConfig(config: Record<string, unknown>): Record<string, unknown> {
  const decrypted = decryptConnectionCredentials(config, getEncryptionKey());
  const redacted = { ...decrypted };
  if (redacted.password) redacted.password = REDACTED_SENTINEL;
  if (redacted.token) redacted.token = REDACTED_SENTINEL;
  if (redacted.clientSecret) redacted.clientSecret = REDACTED_SENTINEL;
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

/**
 * Strip credential-bearing substrings out of a driver/DuckDB error
 * message before it is logged. Failed `ATTACH` and connection-test
 * errors commonly echo the raw DSN — including `password=...` or a
 * `proto://user:secret@host` URI — so the message is unsafe to log
 * verbatim and absolutely unsafe to return to the API caller.
 *
 * The redactor is *defensive*, not exhaustive: it covers the patterns
 * the project's drivers (DuckDB postgres / mysql / mssql, the iceberg
 * extension) emit. The route itself never returns this string to the
 * client; we only use it for the server-side diagnostic log.
 */
export function redactConnectionErrorMessage(message: string): string {
  let m = message;
  // URI-style credentials: `protocol://user:password@host` →
  // `protocol://***:***@host`. Caps the user/password segments so a
  // pathological message with no `@` cannot match across the whole
  // string.
  m = m.replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^\s/@:]{1,256}:[^\s/@]{1,256}@/g, "$1***:***@");
  // `key=value` credential pairs in DSN-style strings. Match
  // case-insensitively; stop at `;`, `,`, whitespace, or end.
  m = m.replace(/(password|pwd|secret|token|client_secret|clientsecret|api[_-]?key|access[_-]?key|auth)\s*=\s*[^;\s,]+/gi, "$1=********");
  return m;
}

function preserveOrEncryptField(
  merged: Record<string, unknown>,
  stored: Record<string, unknown>,
  field: string,
  key: string | null,
): void {
  const val = merged[field] as string | undefined;
  if (!val || val === REDACTED_SENTINEL) {
    if (stored[field]) {
      merged[field] = stored[field];
    } else {
      delete merged[field];
    }
  } else {
    merged[field] = key ? encryptConnectionCredentials({ [field]: val }, key)[field] : val;
  }
}

export function mergeConnectionConfig(
  incoming: Record<string, unknown>,
  stored: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...incoming };
  const key = getEncryptionKey();

  preserveOrEncryptField(merged, stored, "password", key);
  preserveOrEncryptField(merged, stored, "token", key);
  preserveOrEncryptField(merged, stored, "clientSecret", key);

  if (typeof merged.uri === "string" && uriContainsSentinel(merged.uri)) {
    if (typeof stored.uri === "string") {
      merged.uri = stored.uri;
    }
  } else if (typeof merged.uri === "string") {
    merged.uri = key ? encryptConnectionCredentials({ uri: merged.uri }, key).uri : merged.uri;
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

// `/reinit` accepts a single optional `reset` flag. When `reset=true`,
// the route deletes the project's persistent DuckDB file — a state-
// changing destructive operation. The query must be parsed through a
// Zod schema (rather than read straight off `c.req.query()`) so that
// values like `reset=evil`, `reset=true%00`, or arrays cannot reach the
// handler. Unknown keys are stripped by Zod's default behaviour.
const reinitQuerySchema = z.object({
  reset: z.enum(["true", "false"]).optional(),
});

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
    const encryptedConfig = encryptConnectionCredentials(
      body.connectionConfig as Record<string, unknown>,
      getEncryptionKey(),
    );
    const conn = await Connection.create({ ...body, connectionConfig: encryptedConfig, slug, project: projectId });
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
      const instance = await testSingleConnection(conn as IConnectionDocument);
      const db = await instance.connect();
      try {
        await withQueryTimeout(db, () => db.run("SELECT 1"), CONNECTION_TEST_TIMEOUT_MS);
      } finally {
        db.disconnectSync();
      }
      return c.json({ ok: true });
    } catch (err: unknown) {
      // Driver errors (DuckDB ATTACH failures, libpq, the iceberg
      // extension, …) commonly echo the raw connection string into
      // their messages — `host=… password=…` or `proto://user:secret@…`
      // — so returning the message verbatim leaks credentials to
      // anyone with API access (and into any captured response body).
      // Surface a generic message to the client and log a redacted
      // diagnostic server-side for ops debugging.
      const rawMessage = err instanceof Error ? err.message : String(err);
      const sanitized = redactConnectionErrorMessage(rawMessage);
      console.warn(
        `[connections.test] connection ${conn._id} (${conn.type}) test failed: ${sanitized}`,
      );
      return c.json({ ok: false, error: "Connection test failed" }, 400);
    }
  })
  .post("/reinit", zValidator("query", reinitQuerySchema), async (c) => {
    await connectDB();
    const projectId = c.req.param("projectId")!;
    const project = await Project.findById(projectId).lean();
    if (!project) throw AppError.notFound("Project not found");

    const reset = c.req.valid("query").reset === "true";

    try {
      await disposeProjectInstance(projectId);
      if (reset) {
        await deleteProjectDuckdbFile(projectId);
      }
      const connections = await Connection.find({ project: projectId, isActive: true }).lean();
      const instance = await getProjectInstance(
        projectId,
        connections as unknown as IConnectionDocument[],
        { readOnly: true },
      );
      const db = await instance.connect();
      let tableCount = 0;
      try {
        const result = await withQueryTimeout(db, () => db.run("SHOW ALL TABLES"));
        for await (const chunk of result) {
          tableCount += chunk.rowCount;
        }
      } finally {
        db.disconnectSync();
      }
      return c.json({ ok: true as const, tableCount });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Schema re-init failed";
      return c.json({ ok: false as const, error: message }, 400);
    }
  });

export default app;
