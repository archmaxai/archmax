import { connectDB } from "../infra/db";
import { allowUnsignedExtensions } from "../config/env";
import { Connection, Project, type IConnectionDocument } from "../models/index";
import {
  buildAttachString,
  COMMUNITY_EXTENSIONS,
  ensureProjectExtensionLoaded,
  getProjectInstance,
  getQueryTimeoutMs,
  isQueryCancelledError,
  redactConnectionSecrets,
  withQueryTimeout,
} from "./duckdb";

type ProjectDuckDBInstance = Awaited<ReturnType<typeof getProjectInstance>>;

const EXTENSION_NAME_RE = /^[a-z][a-z0-9_]*$/;

const CONSOLE_ALLOWED_KEYWORDS = new Set([
  "SELECT",
  "WITH",
  "SHOW",
  "DESCRIBE",
  "EXPLAIN",
]);

const CONSOLE_DENIED_KEYWORDS = new Set([
  "INSERT",
  "UPDATE",
  "DELETE",
  "COPY",
  "ATTACH",
  "DETACH",
  "CREATE",
  "DROP",
  "INSTALL",
  "LOAD",
  "ALTER",
  "TRUNCATE",
  "GRANT",
  "REVOKE",
]);

export const PREINSTALLED_EXTENSIONS = [
  { name: "postgres", fromCommunity: false },
  { name: "mysql", fromCommunity: false },
  { name: "sqlite", fromCommunity: false },
  { name: "mssql", fromCommunity: true },
  { name: "iceberg", fromCommunity: false },
  { name: "httpfs", fromCommunity: false },
  { name: "avro", fromCommunity: false },
] as const;

export interface DuckdbConsoleSetup {
  preinstalledExtensions: Array<{ name: string; installSql: string; loadSql: string }>;
  connections: Array<{ slug: string; type: string; attachSql: string }>;
  exampleQuery: string;
}

export interface DuckdbConsoleQueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
}

function extensionTypeLabel(type: string): string | null {
  switch (type) {
    case "postgres":
      return "postgres";
    case "mysql":
      return "mysql";
    case "mssql":
      return "mssql";
    case "sqlite":
      return "sqlite";
    case "firebird":
      return "firebird";
    default:
      return null;
  }
}

function getFirstKeyword(sql: string): string {
  const stripped = sql.replace(/^(\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)*/i, "");
  const match = stripped.match(/^([a-z]+)/i);
  return match ? match[1].toUpperCase() : "";
}

export function validateConsoleQuerySql(sql: string): void {
  const trimmed = sql.trim();
  if (!trimmed) {
    throw new Error("SQL must not be empty");
  }
  const withoutTrailing = trimmed.replace(/;+\s*$/, "");
  if (withoutTrailing.includes(";")) {
    throw new Error("Only a single SQL statement is allowed");
  }
  const keyword = getFirstKeyword(trimmed);
  if (!keyword) {
    throw new Error("Could not determine statement type");
  }
  if (CONSOLE_DENIED_KEYWORDS.has(keyword)) {
    throw new Error(`Statement type ${keyword} is not allowed in the federation console`);
  }
  if (!CONSOLE_ALLOWED_KEYWORDS.has(keyword)) {
    throw new Error(`Statement type ${keyword} is not allowed; use SELECT, WITH, SHOW, DESCRIBE, or EXPLAIN`);
  }
}

export interface ParsedExtensionSql {
  extension: string;
  loadOnly: boolean;
  fromCommunity: boolean;
  /**
   * Custom install source (repository URL or path) for an env-gated unsigned
   * extension install (`INSTALL <ext> FROM '<source>'`). Undefined for the
   * signed/community shapes.
   */
  fromSource?: string;
}

export function parseExtensionSql(sql: string, allowUnsigned = false): ParsedExtensionSql {
  const trimmed = sql.trim().replace(/;+\s*$/, "");
  if (trimmed.includes(";")) {
    throw new Error("Only a single statement is allowed");
  }

  // INSTALL <extension> FROM '<source>' — unsigned/custom-source install.
  // Only honoured when the operator has enabled unsigned extensions; the
  // single-quoted source may contain '' as an escaped quote.
  const sourceMatch = trimmed.match(/^install\s+([a-z][a-z0-9_]*)\s+from\s+'((?:[^']|'')*)'\s*$/i);
  if (sourceMatch) {
    if (!allowUnsigned) {
      throw new Error("SQL must be INSTALL <extension> [FROM community] or LOAD <extension>");
    }
    const extension = sourceMatch[1].toLowerCase();
    if (!EXTENSION_NAME_RE.test(extension)) {
      throw new Error("Invalid extension name");
    }
    const fromSource = sourceMatch[2].replace(/''/g, "'");
    return { extension, loadOnly: false, fromCommunity: false, fromSource };
  }

  const installMatch = trimmed.match(/^install\s+([a-z][a-z0-9_]*)(?:\s+from\s+community)?\s*$/i);
  if (installMatch) {
    const extension = installMatch[1].toLowerCase();
    if (!EXTENSION_NAME_RE.test(extension)) {
      throw new Error("Invalid extension name");
    }
    const fromCommunity = /\bfrom\s+community\b/i.test(trimmed);
    return { extension, loadOnly: false, fromCommunity };
  }

  const loadMatch = trimmed.match(/^load\s+([a-z][a-z0-9_]*)\s*$/i);
  if (loadMatch) {
    const extension = loadMatch[1].toLowerCase();
    if (!EXTENSION_NAME_RE.test(extension)) {
      throw new Error("Invalid extension name");
    }
    return { extension, loadOnly: true, fromCommunity: false };
  }

  throw new Error("SQL must be INSTALL <extension> [FROM community] or LOAD <extension>");
}

export function buildRedactedAttachSql(conn: IConnectionDocument): string {
  if (conn.type === "iceberg") {
    const cfg = conn.connectionConfig;
    const warehouse = String(cfg?.warehouse ?? "<warehouse>").replace(/'/g, "''");
    const endpoint = String(cfg?.endpoint ?? "<endpoint>").replace(/'/g, "''");
    const secretName = `${conn.slug}_secret`;
    return [
      `CREATE TEMPORARY SECRET ${secretName} (TYPE iceberg, TOKEN '********')`,
      `ATTACH '${warehouse}' AS ${conn.slug} (TYPE iceberg, ENDPOINT '${endpoint}', SECRET '${secretName}')`,
    ].join(";\n");
  }

  const ext = extensionTypeLabel(conn.type);
  if (!ext) {
    return `-- Manual attach required for connection type: ${conn.type}`;
  }

  const connStr = redactConnectionSecrets(buildAttachString(conn)).replace(/'/g, "''");
  return `ATTACH '${connStr}' AS ${conn.slug} (TYPE ${ext.toUpperCase()}, READ_ONLY)`;
}

async function collectQueryRows(
  instance: ProjectDuckDBInstance,
  sql: string,
): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
  const db = await instance.connect();
  try {
    const result = await withQueryTimeout(db, () => db.run(sql)) as Awaited<ReturnType<typeof db.run>>;
    const columns = result.columnNames();
    const rows: Record<string, unknown>[] = [];
    for await (const chunk of result) {
      for (const row of chunk.getRows()) {
        const obj: Record<string, unknown> = {};
        for (let i = 0; i < columns.length; i++) {
          const val = row[i];
          obj[columns[i]] = typeof val === "bigint" ? Number(val) : val;
        }
        rows.push(obj);
      }
    }
    return { columns, rows };
  } finally {
    db.disconnectSync();
  }
}

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

async function buildExampleQuery(
  projectId: string,
  connections: IConnectionDocument[],
): Promise<string> {
  if (connections.length === 0) {
    return "-- Add an active connection under Data Sources, then run e.g. SELECT * FROM <slug>.<schema>.<table> LIMIT 10";
  }

  const instance = await getProjectInstance(projectId, connections, { readOnly: true });
  const slugs = new Set(connections.map((c) => c.slug));

  try {
    const { rows: dbRows } = await collectQueryRows(instance, "SHOW DATABASES");
    const databases = dbRows
      .map((r) => String(r.database_name))
      .filter((n) => slugs.has(n));

    for (const database of databases) {
      const conn = connections.find((c) => c.slug === database);
      const schemaFilter = conn?.connectionConfig?.schema;
      let sql = `SELECT table_schema, table_name FROM information_schema.tables WHERE table_catalog = '${database}'`;
      if (schemaFilter && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaFilter)) {
        sql += ` AND table_schema = '${schemaFilter}'`;
      } else {
        sql += ` AND LOWER(table_schema) NOT IN (${SYSTEM_SCHEMA_EXCLUSION})`;
      }
      sql += " ORDER BY table_schema, table_name LIMIT 1";

      const { rows } = await collectQueryRows(instance, sql);
      if (rows.length > 0) {
        const schema = String(rows[0].table_schema);
        const table = String(rows[0].table_name);
        return `SELECT * FROM ${database}.${schema}.${table} LIMIT 10`;
      }
    }
  } catch {
    // fall through to slug-only placeholder
  }

  const slug = connections[0].slug;
  return `SELECT * FROM ${slug}.<schema>.<table> LIMIT 10`;
}

export async function getDuckdbConsoleSetup(projectId: string): Promise<DuckdbConsoleSetup> {
  await connectDB();
  const project = await Project.findById(projectId).lean();
  if (!project) {
    throw new Error("Project not found");
  }

  const connections = await Connection.find({ project: projectId, isActive: true }).lean();
  const preinstalledExtensions = PREINSTALLED_EXTENSIONS.map(({ name, fromCommunity }) => {
    const suffix = fromCommunity || COMMUNITY_EXTENSIONS.has(name) ? " FROM community" : "";
    return {
      name,
      installSql: `INSTALL ${name}${suffix}`,
      loadSql: `LOAD ${name}`,
    };
  });

  return {
    preinstalledExtensions,
    connections: connections.map((conn) => ({
      slug: conn.slug,
      type: conn.type,
      attachSql: buildRedactedAttachSql(conn),
    })),
    exampleQuery: await buildExampleQuery(projectId, connections),
  };
}

export async function executeDuckdbConsoleQuery(
  projectId: string,
  sql: string,
): Promise<DuckdbConsoleQueryResult> {
  validateConsoleQuerySql(sql);
  await connectDB();
  const project = await Project.findById(projectId).lean();
  if (!project) {
    throw new Error("Project not found");
  }

  const connections = await Connection.find({ project: projectId, isActive: true }).lean();
  const instance = await getProjectInstance(projectId, connections, { readOnly: true });

  const started = Date.now();
  try {
    const { columns, rows } = await collectQueryRows(instance, sql.trim().replace(/;+\s*$/, ""));
    return {
      columns,
      rows,
      rowCount: rows.length,
      durationMs: Date.now() - started,
    };
  } catch (err) {
    if (isQueryCancelledError(err)) {
      throw new Error(`Query timed out after ${getQueryTimeoutMs()}ms`);
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(redactConnectionSecrets(message));
  }
}

export async function installDuckdbConsoleExtension(
  projectId: string,
  sql: string,
): Promise<{ extension: string }> {
  const parsed = parseExtensionSql(sql, allowUnsignedExtensions());
  await connectDB();
  const project = await Project.findById(projectId).lean();
  if (!project) {
    throw new Error("Project not found");
  }

  try {
    await ensureProjectExtensionLoaded(projectId, parsed.extension, {
      fromCommunity: parsed.fromCommunity,
      loadOnly: parsed.loadOnly,
      fromSource: parsed.fromSource,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(redactConnectionSecrets(message));
  }

  return { extension: parsed.extension };
}
