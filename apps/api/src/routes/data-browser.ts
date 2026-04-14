import { Hono, type Context } from "hono";
import { z } from "zod/v4";
import { zValidator } from "@hono/zod-validator";
import { connectDB } from "@archmax/core/infra/db";
import { Connection, Project } from "@archmax/core/models/index";
import { getProjectInstance } from "@archmax/core/services/duckdb";
import { AppError } from "../utils/errors";

type ProjectInstance = Awaited<ReturnType<typeof getProjectInstance>>;

function safeJson(c: Context, data: unknown): Response {
  const body = JSON.stringify(data, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
  return c.newResponse(body, 200, { "Content-Type": "application/json" });
}

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 50;

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional().default(DEFAULT_PAGE_SIZE),
});

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const SYSTEM_SCHEMA_EXCLUSION = [
  "information_schema",
  "pg_catalog",
  "pg_toast",
  "performance_schema",
  "mysql",
  "sys",
]
  .map((s) => `'${s}'`)
  .join(", ");

const INTERNAL_DATABASES = new Set(["memory", "system", "temp"]);

async function getProjectDuckDB(projectId: string): Promise<ProjectInstance> {
  await connectDB();
  const project = await Project.findById(projectId).lean();
  if (!project) throw AppError.notFound("Project not found");

  const connections = await Connection.find({ project: projectId, isActive: true }).lean();
  return getProjectInstance(projectId, connections, { readOnly: true });
}

async function collectRows(instance: ProjectInstance, sql: string): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
  const db = await instance.connect();
  try {
    const result = await db.run(sql);
    const columns = result.columnNames();
    const rows: Record<string, unknown>[] = [];
    for await (const chunk of result) {
      for (const row of chunk.getRows()) {
        const obj: Record<string, unknown> = {};
        for (let i = 0; i < columns.length; i++) {
          obj[columns[i]] = row[i];
        }
        rows.push(obj);
      }
    }
    return { columns, rows };
  } finally {
    db.disconnectSync();
  }
}

async function getValidDatabases(instance: ProjectInstance): Promise<string[]> {
  const { rows } = await collectRows(instance, "SHOW DATABASES");
  return rows
    .map((r) => String(r.database_name))
    .filter((n) => !INTERNAL_DATABASES.has(n));
}

function assertValidIdentifier(value: string): void {
  if (!IDENTIFIER_RE.test(value)) throw AppError.badRequest("Invalid identifier");
}

const app = new Hono()
  .get("/databases", async (c) => {
    const projectId = c.req.param("projectId") as string;
    const instance = await getProjectDuckDB(projectId);
    const databases = await getValidDatabases(instance);
    return safeJson(c, databases.map((name) => ({ name })));
  })

  .get("/databases/:database/tables", async (c) => {
    const projectId = c.req.param("projectId") as string;
    const database = c.req.param("database");
    assertValidIdentifier(database);

    const instance = await getProjectDuckDB(projectId);
    const validDatabases = await getValidDatabases(instance);
    if (!validDatabases.includes(database)) {
      throw AppError.notFound("Database not found");
    }

    await connectDB();
    const conn = await Connection.findOne({ project: projectId, slug: database }).lean();
    const schemaFilter = conn?.connectionConfig?.schema;

    let sql = `SELECT table_schema, table_name FROM information_schema.tables WHERE table_catalog = '${database}'`;
    if (schemaFilter && IDENTIFIER_RE.test(schemaFilter)) {
      sql += ` AND table_schema = '${schemaFilter}'`;
    } else {
      sql += ` AND LOWER(table_schema) NOT IN (${SYSTEM_SCHEMA_EXCLUSION})`;
    }
    sql += ` ORDER BY table_schema, table_name`;

    const { rows } = await collectRows(instance, sql);

    return safeJson(
      c,
      rows.map((r) => ({
        schema: String(r.table_schema),
        name: String(r.table_name),
      })),
    );
  })

  .get("/databases/:database/tables/:schema/:table/data", zValidator("query", paginationQuery), async (c) => {
    const projectId = c.req.param("projectId") as string;
    const database = c.req.param("database");
    const schema = c.req.param("schema");
    const table = c.req.param("table");
    assertValidIdentifier(database);
    assertValidIdentifier(schema);
    assertValidIdentifier(table);

    const { page, pageSize } = c.req.valid("query");

    const instance = await getProjectDuckDB(projectId);

    const fqTable = `${database}.${schema}.${table}`;
    const offset = (page - 1) * pageSize;

    const db = await instance.connect();
    try {
      const existsResult = await db.run(
        `SELECT 1 FROM information_schema.tables WHERE table_catalog = '${database}' AND table_schema = '${schema}' AND table_name = '${table}' LIMIT 1`,
      );
      let exists = false;
      for await (const chunk of existsResult) {
        if (chunk.getRows().length > 0) exists = true;
      }
      if (!exists) throw AppError.notFound("Table not found");

      const countResult = await db.run(`SELECT COUNT(*) FROM ${fqTable}`);
      let total = 0;
      for await (const chunk of countResult) {
        const rows = chunk.getRows();
        if (rows.length > 0) total = Number(rows[0][0] ?? 0);
      }

      const dataResult = await db.run(`SELECT * FROM ${fqTable} LIMIT ${pageSize} OFFSET ${offset}`);
      const columnNames = dataResult.columnNames();
      const columnTypes = dataResult.columnTypes().map((t) => t.toString());
      const columns = columnNames.map((name, i) => ({ name, type: columnTypes[i] }));

      const rows: Record<string, unknown>[] = [];
      for await (const chunk of dataResult) {
        for (const row of chunk.getRows()) {
          const obj: Record<string, unknown> = {};
          for (let i = 0; i < columnNames.length; i++) {
            obj[columnNames[i]] = row[i];
          }
          rows.push(obj);
        }
      }

      return safeJson(c, { columns, rows, total, page, pageSize });
    } finally {
      db.disconnectSync();
    }
  });

export default app;
