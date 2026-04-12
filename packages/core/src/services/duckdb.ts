import { createHash } from "node:crypto";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import type { IConnectionDocument } from "../models/Connection";
import type { SemanticModel } from "./semantic-model-schema";
import { decryptConnectionCredentials } from "../infra/crypto";
import { getEnv } from "../config/env";

interface ProjectDuckDB {
  instance: DuckDBInstance;
  attachedConnections: Set<string>;
  readOnly: boolean;
}

const projectInstances = new Map<string, ProjectDuckDB>();

export const COMMUNITY_EXTENSIONS = new Set(["mssql"]);

function extensionForType(type: string): string | null {
  switch (type) {
    case "postgres":
      return "postgres";
    case "mysql":
      return "mysql";
    case "mssql":
      return "mssql";
    case "sqlite":
      return "sqlite";
    default:
      return null;
  }
}

export function buildAttachString(conn: IConnectionDocument): string {
  const key = getEnv().ENCRYPTION_KEY || null;
  const raw = typeof (conn.connectionConfig as any).toObject === "function"
    ? (conn.connectionConfig as any).toObject()
    : conn.connectionConfig;
  const cfg = decryptConnectionCredentials(
    raw as Record<string, unknown>,
    key,
  ) as typeof conn.connectionConfig;

  if (cfg.uri) {
    return cfg.uri;
  }

  switch (conn.type) {
    case "postgres": {
      const port = cfg.port ?? 5432;
      return `host=${cfg.host} port=${port} dbname=${cfg.database} user=${cfg.user} password=${cfg.password}`;
    }
    case "mssql": {
      const port = cfg.port ?? 1433;
      const encrypt = (cfg.encrypt ?? true) ? "yes" : "no";
      return `Server=${cfg.host},${port};Database=${cfg.database};User Id=${cfg.user};Password=${cfg.password};Encrypt=${encrypt}`;
    }
    case "mysql": {
      const port = cfg.port ?? 3306;
      return `host=${cfg.host} port=${port} database=${cfg.database} user=${cfg.user} password=${cfg.password}`;
    }
    case "sqlite":
      return cfg.database ?? "";
    default:
      return cfg.uri ?? "";
  }
}

export async function getProjectInstance(
  projectId: string,
  connections: IConnectionDocument[],
  options?: { readOnly?: boolean },
): Promise<DuckDBInstance> {
  const readOnly = options?.readOnly ?? true;
  let entry = projectInstances.get(projectId);

  if (!entry) {
    const instance = await DuckDBInstance.create();
    entry = { instance, attachedConnections: new Set(), readOnly };
    projectInstances.set(projectId, entry);
  }

  for (const conn of connections) {
    const connId = conn._id.toString();
    if (entry.attachedConnections.has(connId)) continue;
    await attachConnection(entry, conn);
  }

  return entry.instance;
}

async function attachConnection(entry: ProjectDuckDB, conn: IConnectionDocument): Promise<void> {
  const ext = extensionForType(conn.type);
  if (!ext) return;

  const db = await entry.instance.connect();
  try {
    const installSuffix = COMMUNITY_EXTENSIONS.has(ext) ? " FROM community" : "";
    await db.run(`INSTALL ${ext}${installSuffix}`);
    await db.run(`LOAD ${ext}`);

    const connStr = buildAttachString(conn).replace(/'/g, "''");
    const readOnlyClause = entry.readOnly ? ", READ_ONLY" : "";
    await db.run(`ATTACH '${connStr}' AS ${conn.slug} (TYPE ${ext.toUpperCase()}${readOnlyClause})`);
    entry.attachedConnections.add(conn._id.toString());
  } finally {
    db.disconnectSync();
  }
}

/**
 * Create a fresh DuckDB instance, attach a single connection, and return it.
 * Used for connectivity tests so results are not affected by cached state.
 */
export async function testSingleConnection(conn: IConnectionDocument): Promise<DuckDBInstance> {
  const ext = extensionForType(conn.type);
  if (!ext) throw new Error(`Unsupported connection type: ${conn.type}`);

  const instance = await DuckDBInstance.create();
  const db = await instance.connect();
  try {
    const installSuffix = COMMUNITY_EXTENSIONS.has(ext) ? " FROM community" : "";
    await db.run(`INSTALL ${ext}${installSuffix}`);
    await db.run(`LOAD ${ext}`);

    const connStr = buildAttachString(conn).replace(/'/g, "''");
    await db.run(`ATTACH '${connStr}' AS ${conn.slug} (TYPE ${ext.toUpperCase()}, READ_ONLY)`);
  } finally {
    db.disconnectSync();
  }
  return instance;
}


// ── Scoped VIEWs for MCP ──────────────────────────────────────────────

const scopeViewCache = new Map<string, { hash: string }>();

export function scopeSchemaName(modelName: string): string {
  return `_scope_${modelName}`;
}

export function scopedViewName(modelName: string, datasetName: string): string {
  return `${scopeSchemaName(modelName)}."${datasetName}"`;
}

export function computeModelHash(model: SemanticModel): string {
  const h = createHash("sha256");
  for (const ds of model.datasets) {
    h.update(ds.name);
    h.update(ds.source);
    for (const f of ds.fields) {
      h.update(f.name);
      h.update(f.expression.dialects[0]?.expression ?? f.name);
    }
  }
  return h.digest("hex").slice(0, 16);
}

export async function createScopedViews(
  instance: DuckDBInstance,
  projectId: string,
  model: SemanticModel,
): Promise<void> {
  const cacheKey = `${projectId}:${model.name}`;
  const hash = computeModelHash(model);
  const cached = scopeViewCache.get(cacheKey);
  if (cached && cached.hash === hash) return;

  const schema = scopeSchemaName(model.name);
  const db = await instance.connect();
  const viewErrors: Array<{ dataset: string; field: string; error: string }> = [];
  try {
    await db.run(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    for (const ds of model.datasets) {
      if (ds.fields.length === 0) continue;

      const validColumns: string[] = [];
      for (const f of ds.fields) {
        const expr = f.expression.dialects[0]?.expression ?? f.name;
        const col = expr === f.name ? `"${f.name}"` : `${expr} AS "${f.name}"`;
        try {
          await db.run(`SELECT ${col} FROM ${ds.source} LIMIT 0`);
          validColumns.push(col);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          viewErrors.push({ dataset: ds.name, field: f.name, error: msg });
        }
      }

      if (validColumns.length === 0) continue;
      const viewName = scopedViewName(model.name, ds.name);
      await db.run(
        `CREATE OR REPLACE VIEW ${viewName} AS SELECT ${validColumns.join(", ")} FROM ${ds.source}`,
      );
    }
    scopeViewCache.set(cacheKey, { hash });
  } finally {
    db.disconnectSync();
  }

  if (viewErrors.length > 0) {
    const summary = viewErrors
      .map((e) => `  ${e.dataset}.${e.field}: ${e.error}`)
      .join("\n");
    console.warn(
      `[createScopedViews] Skipped ${viewErrors.length} invalid field expression(s) in model "${model.name}":\n${summary}`,
    );
  }
}

export function invalidateScopedViews(projectId: string, modelName?: string): void {
  if (modelName) {
    scopeViewCache.delete(`${projectId}:${modelName}`);
  } else {
    for (const key of scopeViewCache.keys()) {
      if (key.startsWith(`${projectId}:`)) {
        scopeViewCache.delete(key);
      }
    }
  }
}

export function getAttachedCatalogSlugs(
  connections: IConnectionDocument[],
): string[] {
  return connections.map((c) => c.slug);
}

export async function hardenConnection(db: DuckDBConnection, searchPath?: string): Promise<void> {
  // Each SET is independent so one failure doesn't skip the rest.
  // Security settings are applied once at the instance level; subsequent
  // connections silently ignore the "already set" error.
  try { await db.run("SET enable_external_access = false"); } catch { /* already set */ }
  try { await db.run("SET threads = 2"); } catch { /* already set */ }
  try { await db.run("SET memory_limit = '512MB'"); } catch { /* already set */ }
  // search_path must succeed per-connection — it controls which model's
  // scoped views are visible for this particular query.
  if (searchPath) await db.run(`SET search_path = '${searchPath}'`);
  // Not setting lock_configuration: it's instance-wide in DuckDB and would
  // prevent search_path changes on subsequent connections. SQL validation
  // (validateReadOnlySQL) blocks SET statements as the primary guard.
}
