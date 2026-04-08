import { Hono } from "hono";
import { z } from "zod/v4";
import { zValidator } from "@hono/zod-validator";
import { connectDB } from "@archsem/core/infra/db";
import { Connection, Project, type IConnectionDocument } from "@archsem/core/models/index";
import { getProjectInstance } from "@archsem/core/services/duckdb";
import { AppError } from "../utils/errors";

function safeJson(c: { newResponse: (body: string, status: number, headers: Record<string, string>) => Response }, data: unknown): Response {
  const body = JSON.stringify(data, (_k, v) => typeof v === "bigint" ? Number(v) : v);
  return c.newResponse(body, 200, { "Content-Type": "application/json" });
}

const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 50;

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional().default(DEFAULT_PAGE_SIZE),
});

async function getInstanceForProject(projectId: string) {
  await connectDB();
  const project = await Project.findById(projectId).lean();
  if (!project) throw AppError.notFound("Project not found");

  const connections = (await Connection.find({
    project: projectId,
    isActive: true,
  }).lean()) as IConnectionDocument[];

  const instance = await getProjectInstance(projectId, connections, {
    readOnly: true,
  });

  return { instance, connections };
}

async function runQuery(projectId: string, sql: string) {
  const { instance } = await getInstanceForProject(projectId);
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

async function getValidDatabases(projectId: string): Promise<string[]> {
  const { rows } = await runQuery(projectId, "SHOW DATABASES");
  return rows.map((r) => String(r.database_name)).filter((n) => n !== "memory" && n !== "system" && n !== "temp");
}

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const app = new Hono()
  .get("/databases", async (c) => {
    const projectId = c.req.param("projectId")!;
    const databases = await getValidDatabases(projectId);
    return safeJson(c, databases.map((name) => ({ name })));
  })

  .get("/databases/:database/tables", async (c) => {
    const projectId = c.req.param("projectId")!;
    const database = c.req.param("database");

    const validDatabases = await getValidDatabases(projectId);
    if (!validDatabases.includes(database)) {
      throw AppError.notFound("Database not found");
    }

    await connectDB();
    const conn = await Connection.findOne({ project: projectId, slug: database }).lean();
    const schemaFilter = conn?.connectionConfig?.schema;

    let sql = `SELECT table_schema, table_name FROM information_schema.tables WHERE table_catalog = '${database}'`;
    if (schemaFilter && IDENTIFIER_RE.test(schemaFilter)) {
      sql += ` AND table_schema = '${schemaFilter}'`;
    }
    sql += ` ORDER BY table_schema, table_name`;

    const { rows } = await runQuery(projectId, sql);

    return safeJson(c,
      rows.map((r) => ({
        schema: String(r.table_schema),
        name: String(r.table_name),
      })),
    );
  })

  .get("/databases/:database/tables/:schema/:table/data", zValidator("query", paginationQuery), async (c) => {
    const projectId = c.req.param("projectId")!;
    const database = c.req.param("database");
    const schema = c.req.param("schema");
    const table = c.req.param("table");
    const { page, pageSize } = c.req.valid("query");

    if (!IDENTIFIER_RE.test(database) || !IDENTIFIER_RE.test(schema) || !IDENTIFIER_RE.test(table)) {
      throw AppError.badRequest("Invalid identifier");
    }

    const validDatabases = await getValidDatabases(projectId);
    if (!validDatabases.includes(database)) {
      throw AppError.notFound("Database not found");
    }

    const { instance } = await getInstanceForProject(projectId);
    const db = await instance.connect();
    try {
      const fqTable = `${database}.${schema}.${table}`;

      const tableCheck = await db.run(
        `SELECT 1 FROM information_schema.tables WHERE table_catalog = '${database}' AND table_schema = '${schema}' AND table_name = '${table}' LIMIT 1`,
      );
      let tableExists = false;
      for await (const chunk of tableCheck) {
        if (chunk.getRows().length > 0) tableExists = true;
      }
      if (!tableExists) {
        throw AppError.notFound("Table not found");
      }

      const countResult = await db.run(`SELECT COUNT(*) AS total FROM ${fqTable}`);
      let total = 0;
      for await (const chunk of countResult) {
        const rows = chunk.getRows();
        if (rows.length > 0) total = Number(rows[0][0]);
      }

      const offset = (page - 1) * pageSize;
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
