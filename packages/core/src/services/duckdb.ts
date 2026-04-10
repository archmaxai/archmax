import { createHash } from "node:crypto";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import type { IConnectionDocument } from "../models/Connection";
import type { SemanticModel } from "./semantic-model-schema";

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
  const cfg = conn.connectionConfig;

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
  try {
    await db.run(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    for (const ds of model.datasets) {
      if (ds.fields.length === 0) continue;
      const columns = ds.fields.map((f) => {
        const expr = f.expression.dialects[0]?.expression ?? f.name;
        return expr === f.name ? `"${f.name}"` : `${expr} AS "${f.name}"`;
      });
      const viewName = scopedViewName(model.name, ds.name);
      await db.run(
        `CREATE OR REPLACE VIEW ${viewName} AS SELECT ${columns.join(", ")} FROM ${ds.source}`,
      );
    }
    scopeViewCache.set(cacheKey, { hash });
  } finally {
    db.disconnectSync();
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

export async function hardenConnection(db: DuckDBConnection): Promise<void> {
  try {
    await db.run("SET enable_external_access = false");
    await db.run("SET threads = 2");
    await db.run("SET memory_limit = '512MB'");
    await db.run("SET lock_configuration = true");
  } catch {
    // Instance-level config may already be locked by a prior connection.
    // That's fine — the hardening settings are already in effect.
  }
}
