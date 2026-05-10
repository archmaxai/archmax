import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import type { IConnectionDocument } from "../models/Connection";
import type { SemanticModel } from "./semantic-model-schema";
import { decryptConnectionCredentials } from "../infra/crypto";
import { getEnv } from "../config/env";
import { validateSqlAst } from "./sql-ast-validation";

const SAFE_PROJECT_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * Resolve the persistent DuckDB file path for a project, validating
 * `projectId` against the same regex `SemanticModelFileService` uses so we
 * never end up writing outside `<ARCHMAX_DATA_DIR>/projects/`.
 */
export function duckdbFilePath(projectId: string): string {
  if (!projectId || !SAFE_PROJECT_ID.test(projectId)) {
    throw new Error(`Invalid projectId: must be alphanumeric (with ._-), got "${projectId}"`);
  }
  return join(getEnv().projectsDir, projectId, "duckdb.db");
}

async function ensureDuckdbFileDir(path: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
}

async function deleteDuckdbFiles(path: string): Promise<void> {
  await rm(path, { force: true });
  await rm(`${path}.wal`, { force: true });
  await rm(`${path}.tmp`, { force: true, recursive: true });
}

// ── Query timeout helper ─────────────────────────────────────────────

export function getQueryTimeoutMs(): number {
  const configured = Number(process.env.QUERY_TIMEOUT_MS);
  return configured > 0 ? configured : 30_000;
}

/**
 * Run an async operation against a DuckDB connection with a hard timeout.
 * On timeout, `connection.interrupt()` is called to cancel the in-flight
 * query inside DuckDB, then the promise rejects with a timeout error.
 * The timer is always cleaned up regardless of outcome.
 */
export async function withQueryTimeout<T>(
  connection: DuckDBConnection,
  operation: () => Promise<T>,
  timeoutMs: number = getQueryTimeoutMs(),
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      try { connection.interrupt(); } catch { /* best-effort */ }
      reject(new Error(`Query timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation(), timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
}

// ── Per-project query concurrency limiter ────────────────────────────

function getMaxConcurrentQueries(): number {
  const configured = Number(process.env.MAX_CONCURRENT_QUERIES);
  return configured > 0 ? configured : 10;
}

class Semaphore {
  private waiting: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];
  private count: number;
  constructor(private readonly max: number) { this.count = max; }

  async acquire(timeoutMs?: number): Promise<void> {
    if (this.count > 0) { this.count--; return; }
    return new Promise<void>((resolve, reject) => {
      const entry = { resolve, reject };
      this.waiting.push(entry);
      if (timeoutMs !== undefined && timeoutMs > 0) {
        const timer = setTimeout(() => {
          const idx = this.waiting.indexOf(entry);
          if (idx !== -1) {
            this.waiting.splice(idx, 1);
            reject(new Error(`Query slot unavailable — ${this.max} queries already running for this project. Try again shortly.`));
          }
        }, timeoutMs);
        const origResolve = entry.resolve;
        entry.resolve = () => { clearTimeout(timer); origResolve(); };
      }
    });
  }

  release(): void {
    const next = this.waiting.shift();
    if (next) { next.resolve(); } else { this.count++; }
  }
}

const projectSemaphores = new Map<string, Semaphore>();

function getProjectSemaphore(projectId: string): Semaphore {
  let sem = projectSemaphores.get(projectId);
  if (!sem) {
    sem = new Semaphore(getMaxConcurrentQueries());
    projectSemaphores.set(projectId, sem);
  }
  return sem;
}

/**
 * Acquire a per-project query slot, run the operation, then release.
 * Prevents unbounded concurrent queries from exhausting DuckDB resources.
 * If all slots are occupied, waits up to the query timeout before rejecting.
 */
export async function withProjectQuerySlot<T>(
  projectId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const sem = getProjectSemaphore(projectId);
  await sem.acquire(getQueryTimeoutMs());
  try {
    return await operation();
  } finally {
    sem.release();
  }
}

// ── Project DuckDB instance cache ────────────────────────────────────

interface ProjectDuckDB {
  instance: DuckDBInstance;
  attachedSlugs: Set<string>;
  loadedExtensions: Set<string>;
  readOnly: boolean;
}

const projectInstances = new Map<string, ProjectDuckDB>();
const setupLocks = new Map<string, Promise<void>>();

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

/**
 * Dispose the cached DuckDB instance for a project, if any.
 *
 * Closes the underlying `DuckDBInstance` on a best-effort basis and removes
 * the entry (including its attached-slug and loaded-extension bookkeeping)
 * from the cache so the next `getProjectInstance` call rebuilds from scratch.
 * Used to force re-reading of upstream schemas when they have changed.
 *
 * The on-disk `duckdb.db` file is NOT deleted here — the file lock is simply
 * released so a subsequent `getProjectInstance(projectId, …)` reopens the
 * same file with all previously persisted scoped VIEWs intact. Callers that
 * want a clean slate must additionally call `deleteProjectDuckdbFile`.
 */
export async function disposeProjectInstance(projectId: string): Promise<void> {
  while (setupLocks.has(projectId)) {
    await setupLocks.get(projectId);
  }
  const entry = projectInstances.get(projectId);
  if (!entry) return;
  projectInstances.delete(projectId);
  try {
    entry.instance.closeSync();
  } catch {
    // best-effort — instance may already be closed
  }
}

/**
 * Dispose every cached `DuckDBInstance` and wait for in-flight setup locks
 * to drain. Intended for graceful shutdown handlers (SIGTERM/SIGINT) so the
 * file lock on every project's `duckdb.db` is released before exit.
 */
export async function disposeAllProjectInstances(): Promise<void> {
  const ids = Array.from(projectInstances.keys());
  await Promise.all(ids.map((id) => disposeProjectInstance(id)));
}

/**
 * Delete the on-disk `duckdb.db` (and its WAL/temp side files) for a project.
 * Used by the `connections/reinit?reset=true` flow when an operator wants a
 * clean slate. Safe to call when the file does not exist; safe to call after
 * `disposeProjectInstance` has released the file lock.
 */
export async function deleteProjectDuckdbFile(projectId: string): Promise<void> {
  await deleteDuckdbFiles(duckdbFilePath(projectId));
}

export async function getProjectInstance(
  projectId: string,
  connections: IConnectionDocument[],
  options?: { readOnly?: boolean },
): Promise<DuckDBInstance> {
  const entry = projectInstances.get(projectId);
  if (entry && isReady(entry, connections)) {
    return entry.instance;
  }

  while (setupLocks.has(projectId)) {
    await setupLocks.get(projectId);
  }

  const afterWait = projectInstances.get(projectId);
  if (afterWait && isReady(afterWait, connections)) {
    return afterWait.instance;
  }

  let resolve!: () => void;
  const lock = new Promise<void>((r) => { resolve = r; });
  setupLocks.set(projectId, lock);

  try {
    return await setupProjectInstance(projectId, connections, options);
  } finally {
    setupLocks.delete(projectId);
    resolve();
  }
}

const ICEBERG_EXTENSIONS = ["iceberg", "httpfs"] as const;

function isReady(entry: ProjectDuckDB, connections: IConnectionDocument[]): boolean {
  return connections.every((conn) => {
    if (conn.type === "iceberg") {
      return ICEBERG_EXTENSIONS.every((e) => entry.loadedExtensions.has(e)) && entry.attachedSlugs.has(conn.slug);
    }
    const ext = extensionForType(conn.type);
    return (!ext || entry.loadedExtensions.has(ext)) && entry.attachedSlugs.has(conn.slug);
  });
}

async function setupProjectInstance(
  projectId: string,
  connections: IConnectionDocument[],
  options?: { readOnly?: boolean },
): Promise<DuckDBInstance> {
  const readOnly = options?.readOnly ?? true;
  let entry = projectInstances.get(projectId);

  if (entry) {
    const needsNewExtension = connections.some((conn) => {
      if (conn.type === "iceberg") {
        return ICEBERG_EXTENSIONS.some((e) => !entry!.loadedExtensions.has(e));
      }
      const ext = extensionForType(conn.type);
      return ext && !entry!.loadedExtensions.has(ext);
    });
    if (needsNewExtension) {
      projectInstances.delete(projectId);
      entry = undefined;
    }
  }

  if (!entry) {
    const path = duckdbFilePath(projectId);
    await ensureDuckdbFileDir(path);
    const instance = await DuckDBInstance.create(path);
    entry = { instance, attachedSlugs: new Set(), loadedExtensions: new Set(), readOnly };
    projectInstances.set(projectId, entry);
  }

  for (const conn of connections) {
    if (entry.attachedSlugs.has(conn.slug)) continue;
    await attachConnection(entry, conn);
  }

  const hasIceberg = connections.some((c) => c.type === "iceberg");
  if (!hasIceberg) {
    await disableExternalAccess(entry.instance);
  }

  return entry.instance;
}

async function installAndLoadExtension(
  instance: DuckDBInstance,
  ext: string,
): Promise<void> {
  const db = await instance.connect();
  try {
    const installSuffix = COMMUNITY_EXTENSIONS.has(ext) ? " FROM community" : "";
    await db.run(`INSTALL ${ext}${installSuffix}`);
    await db.run(`LOAD ${ext}`);
  } finally {
    db.disconnectSync();
  }
}

const ATTACH_TIMEOUT_MS = 30_000;

async function attachConnection(entry: ProjectDuckDB, conn: IConnectionDocument): Promise<void> {
  if (conn.type === "iceberg") {
    await attachIcebergCatalog(entry, conn);
    return;
  }

  const ext = extensionForType(conn.type);
  if (!ext) return;

  if (!entry.loadedExtensions.has(ext)) {
    await installAndLoadExtension(entry.instance, ext);
    entry.loadedExtensions.add(ext);
  }

  const db = await entry.instance.connect();
  try {
    const connStr = buildAttachString(conn).replace(/'/g, "''");
    const readOnlyClause = entry.readOnly ? ", READ_ONLY" : "";
    await withQueryTimeout(
      db,
      () => db.run(`ATTACH '${connStr}' AS ${conn.slug} (TYPE ${ext.toUpperCase()}${readOnlyClause})`),
      ATTACH_TIMEOUT_MS,
    );
    entry.attachedSlugs.add(conn.slug);
  } finally {
    db.disconnectSync();
  }
}

function icebergSecretName(slug: string): string {
  return `${slug}_secret`;
}

function getDecryptedIcebergConfig(conn: IConnectionDocument) {
  const key = getEnv().ENCRYPTION_KEY || null;
  const raw = typeof (conn.connectionConfig as any).toObject === "function"
    ? (conn.connectionConfig as any).toObject()
    : conn.connectionConfig;
  return decryptConnectionCredentials(raw as Record<string, unknown>, key);
}

async function attachIcebergCatalog(entry: ProjectDuckDB, conn: IConnectionDocument): Promise<void> {
  for (const ext of ICEBERG_EXTENSIONS) {
    if (!entry.loadedExtensions.has(ext)) {
      await installAndLoadExtension(entry.instance, ext);
      entry.loadedExtensions.add(ext);
    }
  }

  const cfg = getDecryptedIcebergConfig(conn);
  const secretName = icebergSecretName(conn.slug);
  const token = (cfg.token as string).replace(/'/g, "''");
  const warehouse = (cfg.warehouse as string).replace(/'/g, "''");
  const endpoint = (cfg.endpoint as string).replace(/'/g, "''");

  const db = await entry.instance.connect();
  try {
    // `TEMPORARY` keeps the bearer token in process memory only — without it
    // DuckDB persists the secret to `~/.duckdb/stored_secrets/` *and* to the
    // project's persistent `duckdb.db` file, both of which are unacceptable
    // exposure surfaces for an iceberg credential.
    await db.run(`CREATE TEMPORARY SECRET ${secretName} (TYPE iceberg, TOKEN '${token}')`);
    await withQueryTimeout(
      db,
      () => db.run(
        `ATTACH '${warehouse}' AS ${conn.slug} (TYPE iceberg, ENDPOINT '${endpoint}', SECRET '${secretName}')`,
      ),
      ATTACH_TIMEOUT_MS,
    );
    entry.attachedSlugs.add(conn.slug);
  } finally {
    db.disconnectSync();
  }
}

export async function detachIcebergCatalog(instance: DuckDBInstance, slug: string): Promise<void> {
  const db = await instance.connect();
  try {
    await db.run(`DETACH ${slug}`);
    await db.run(`DROP SECRET IF EXISTS ${icebergSecretName(slug)}`);
  } finally {
    db.disconnectSync();
  }
}

async function disableExternalAccess(instance: DuckDBInstance): Promise<void> {
  const db = await instance.connect();
  try {
    try { await db.run("SET enable_external_access = false"); } catch { /* already set */ }
  } finally {
    db.disconnectSync();
  }
}

/**
 * Create a fresh DuckDB instance, attach a single connection, and return it.
 * Used for connectivity tests so results are not affected by cached state.
 */
export async function testSingleConnection(conn: IConnectionDocument): Promise<DuckDBInstance> {
  if (conn.type === "iceberg") {
    return testIcebergConnection(conn);
  }

  const ext = extensionForType(conn.type);
  if (!ext) throw new Error(`Unsupported connection type: ${conn.type}`);

  const instance = await DuckDBInstance.create();
  await installAndLoadExtension(instance, ext);

  const db = await instance.connect();
  try {
    const connStr = buildAttachString(conn).replace(/'/g, "''");
    await db.run(`ATTACH '${connStr}' AS ${conn.slug} (TYPE ${ext.toUpperCase()}, READ_ONLY)`);
  } finally {
    db.disconnectSync();
  }
  return instance;
}

async function testIcebergConnection(conn: IConnectionDocument): Promise<DuckDBInstance> {
  const instance = await DuckDBInstance.create();
  for (const ext of ICEBERG_EXTENSIONS) {
    await installAndLoadExtension(instance, ext);
  }

  const cfg = getDecryptedIcebergConfig(conn);
  const secretName = icebergSecretName(conn.slug);
  const token = (cfg.token as string).replace(/'/g, "''");
  const warehouse = (cfg.warehouse as string).replace(/'/g, "''");
  const endpoint = (cfg.endpoint as string).replace(/'/g, "''");

  const db = await instance.connect();
  try {
    await db.run(`CREATE TEMPORARY SECRET ${secretName} (TYPE iceberg, TOKEN '${token}')`);
    await db.run(
      `ATTACH '${warehouse}' AS ${conn.slug} (TYPE iceberg, ENDPOINT '${endpoint}', SECRET '${secretName}')`,
    );
    await db.run("SHOW ALL TABLES");
  } finally {
    db.disconnectSync();
  }
  return instance;
}

// ── Scoped VIEWs for MCP ──────────────────────────────────────────────

export function scopeSchemaName(modelName: string): string {
  return `_scope_${modelName}`;
}

/**
 * Double any embedded `"` inside a quoted SQL identifier. The standard
 * SQL escape for a `"` inside a `"..."`-quoted identifier is `""`.
 * Used by `scopedViewName` so that a dataset name like `weird"name`
 * cannot break out of `_scope_<model>."<dataset>"` and inject DDL.
 */
function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export function scopedViewName(modelName: string, datasetName: string): string {
  return `${scopeSchemaName(modelName)}.${quoteIdentifier(datasetName)}`;
}

export interface MaterialiseViewsResult {
  /**
   * Datasets whose view was successfully (re-)materialised. Includes both
   * datasets that authored their own `view_query` and datasets where the
   * platform inferred a default mirror view from `dataset.source` and
   * `dataset.fields` (see `inferred` below).
   */
  materialised: string[];
  /**
   * Strict subset of `materialised`: datasets whose view body was inferred
   * by the platform because no `view_query` was authored. Inference is a
   * best-effort fallback for the simplest case (mirror every declared field
   * straight from `dataset.source`); authored `view_query` always wins when
   * present.
   */
  inferred: string[];
  /**
   * Datasets that were skipped because they have neither an authored
   * `view_query` nor enough information to infer one (no `fields`, or a
   * blank/missing `source`). Callers (MCP `execute_query`, agent
   * `runModelQuery`) translate this into an `isError: true` response.
   */
  missingViewQuery: string[];
  /**
   * Datasets whose view body (authored or inferred) was rejected by the
   * SQL validator or failed at `CREATE OR REPLACE VIEW` time. The previous
   * VIEW (if any) is left in place; a warning has already been logged.
   */
  failed: Array<{ dataset: string; error: string }>;
}

const SIMPLE_IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Synthesise a "mirror" view body for a dataset that has not authored
 * its own `view_query`. The inferred body projects every declared
 * `field.name` straight from `dataset.source` (using `<expression> AS
 * "<name>"` when the physical column expression differs from the
 * field's logical name).
 *
 * Returns `null` when inference is impossible — i.e. when the dataset
 * has no `fields` or no `source`. Callers MUST surface the missing-
 * view_query error in that case rather than synthesising a degenerate
 * `SELECT *` (which would expose every physical column the engine can
 * see, including ones not declared in the model).
 *
 * Authored `view_query` always wins over the inferred body. Inference
 * is a fallback for the simplest authoring shape only — anything that
 * needs row filters, denormalising joins, or computed columns must be
 * authored explicitly.
 *
 * The body returned here is fed into `validateViewQuery` and through
 * the same `CREATE OR REPLACE VIEW` path as authored bodies, so the
 * structural SQL validator gates inferred bodies just as strictly as
 * authored ones (no `_scope_*` / `duckdb_*` references, no forbidden
 * scalar/table functions, etc.).
 */
export function inferDefaultViewQuery(
  dataset: SemanticModel["datasets"][number],
): string | null {
  if (!dataset.source || dataset.source.trim().length === 0) return null;
  if (!dataset.fields || dataset.fields.length === 0) return null;
  const columns = dataset.fields.map((f) => {
    const expr = f.expression?.dialects?.[0]?.expression ?? f.name;
    if (expr === f.name) return `"${f.name}"`;
    if (SIMPLE_IDENT_RE.test(expr)) return `"${expr}" AS "${f.name}"`;
    return `${expr} AS "${f.name}"`;
  });
  return `SELECT\n  ${columns.join(",\n  ")}\nFROM ${dataset.source}`;
}

/**
 * Validate a single dataset's `view_query` body before wrapping it in
 * `CREATE OR REPLACE VIEW ... AS <view_query>`.
 *
 * Uses the dedicated `view_query` validation mode, which permits
 * `catalog.schema.table` references for attached connections — the
 * legitimate shape of a view body — while still rejecting:
 *   - non-SELECT/WITH/EXPLAIN/DESCRIBE statements (DROP, CREATE,
 *     INSERT, multi-statement payloads, EXPLAIN ANALYZE, …)
 *   - external file readers (`read_csv`, `read_parquet`, …)
 *   - DuckDB metadata (`duckdb_*` table or function form)
 *   - `_scope_*` cross-references between models
 *   - system catalogs (`information_schema`, `pg_catalog`,
 *     `sqlite_master`, `main`, `temp`, `system`) — closes a privilege-
 *     escalation hole where a view body could expose raw catalog
 *     metadata to any MCP token scoped to the model
 *   - sequence side effects (`nextval`, `currval`)
 *   - file/directory readers (`pg_read_file`, `pg_ls_dir`, …)
 */
async function validateViewQuery(viewQuery: string): Promise<string | null> {
  return validateSqlAst(viewQuery, { mode: "view_query" });
}

/**
 * (Re-)materialise every per-model scoped VIEW for `model` against the
 * project's persistent DuckDB instance.
 *
 * - Stateless: called on every model-scoped query (`execute_query`,
 *   `runModelQuery`). Idempotency is provided by `CREATE OR REPLACE VIEW`,
 *   not by an in-memory hash cache.
 * - Authored-then-inferred: a dataset's authored `view_query` (in its
 *   COMMON custom extension) is preferred. When absent, a default mirror
 *   body is inferred from `dataset.source` and `dataset.fields` (see
 *   `inferDefaultViewQuery`). Datasets where inference is impossible
 *   (no fields, no source) land in `missingViewQuery`.
 * - Validator-gated: every view body — authored or inferred — is rejected
 *   by the structural SQL validator before being wrapped, so a malformed
 *   body never reaches DuckDB.
 * - Error-isolated: validator or DuckDB failures on one dataset never
 *   abort the materialisation of the rest. The previous VIEW (if any) is
 *   left in place and a warning is logged.
 */
export async function materialiseModelViews(
  instance: DuckDBInstance,
  _projectId: string,
  model: SemanticModel,
): Promise<MaterialiseViewsResult> {
  const result: MaterialiseViewsResult = {
    materialised: [],
    inferred: [],
    missingViewQuery: [],
    failed: [],
  };

  // Identifier-safety gate. `model.name` is interpolated UNQUOTED into
  // `_scope_<model>` (CREATE SCHEMA, hardenConnection's search_path,
  // stripScopedSchemaQualifier's regex), so it must match a strict
  // SQL identifier rule — `name: z.string().min(1)` in the YAML schema
  // is too permissive to gate DDL interpolation. Fail closed and mark
  // every dataset as failed so callers (`execute_query`, `runModelQuery`)
  // refuse to reuse any pre-existing scoped views with the same prefix.
  if (!SIMPLE_IDENT_RE.test(model.name)) {
    const errMsg =
      `Model name "${model.name}" is not a valid SQL identifier ` +
      `(must match [a-zA-Z_][a-zA-Z0-9_]*); refusing to materialise views.`;
    console.warn(`[materialiseModelViews] ${errMsg}`);
    for (const ds of model.datasets) {
      result.failed.push({ dataset: ds.name, error: errMsg });
    }
    return result;
  }

  const schema = scopeSchemaName(model.name);
  const perViewTimeout = Math.min(getQueryTimeoutMs(), 10_000);

  const db = await instance.connect();
  try {
    await withQueryTimeout(db, () => db.run(`CREATE SCHEMA IF NOT EXISTS ${schema}`), 5_000);
    for (const ds of model.datasets) {
      // Reject embedded NULs / control characters that would corrupt
      // the resulting `CREATE OR REPLACE VIEW` even after quote
      // doubling. Any other character is safely handled by
      // `quoteIdentifier`'s `"` doubling — including hyphens, dots,
      // and embedded `"` — so we don't gate on SIMPLE_IDENT_RE here.
      if (/[\u0000-\u001F]/.test(ds.name)) {
        const errMsg = `Dataset name contains a control character; refusing to materialise.`;
        console.warn(`[materialiseModelViews] Skipped dataset "${ds.name}" in model "${model.name}": ${errMsg}`);
        result.failed.push({ dataset: ds.name, error: errMsg });
        continue;
      }

      const authored = extractViewQueryFromExtensions(ds);
      let viewQuery: string | null = authored;
      let wasInferred = false;
      if (!viewQuery) {
        viewQuery = inferDefaultViewQuery(ds);
        wasInferred = viewQuery !== null;
      }
      if (!viewQuery) {
        result.missingViewQuery.push(ds.name);
        continue;
      }

      const validatorError = await validateViewQuery(viewQuery);
      if (validatorError) {
        const msg = `[materialiseModelViews] Skipped dataset "${ds.name}" in model "${model.name}": validator rejected ${wasInferred ? "inferred default" : "view_query"} (${validatorError})`;
        console.warn(msg);
        result.failed.push({ dataset: ds.name, error: validatorError });
        continue;
      }

      const viewName = scopedViewName(model.name, ds.name);
      try {
        await withQueryTimeout(
          db,
          () => db.run(`CREATE OR REPLACE VIEW ${viewName} AS ${viewQuery}`),
          perViewTimeout,
        );
        result.materialised.push(ds.name);
        if (wasInferred) result.inferred.push(ds.name);
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.warn(
          `[materialiseModelViews] Skipped dataset "${ds.name}" in model "${model.name}": DuckDB error during CREATE OR REPLACE VIEW (${errMsg})`,
        );
        result.failed.push({ dataset: ds.name, error: errMsg });
      }
    }
  } finally {
    db.disconnectSync();
  }

  return result;
}

/**
 * Strip any `_scope_<modelName>.` qualifier from a DuckDB error message
 * before it is surfaced to an agent or MCP client. The internal schema
 * name is platform-private; tooling on the consumer side reasons about
 * datasets by their bare name.
 */
export function stripScopedSchemaQualifier(message: string, modelName: string): string {
  // Match both unquoted and quoted forms, e.g. `_scope_ecommerce.orders` or
  // `"_scope_ecommerce"."orders"` and replace with the bare dataset ref.
  const safe = modelName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const unquoted = new RegExp(`_scope_${safe}\\.`, "g");
  const quoted = new RegExp(`"_scope_${safe}"\\.`, "g");
  return message.replace(unquoted, "").replace(quoted, "");
}

function extractViewQueryFromExtensions(dataset: SemanticModel["datasets"][number] & { viewQuery?: string | null }): string | null {
  // Prefer the decorated `viewQuery` populated by SemanticModelFileService.
  // Fall back to parsing the COMMON extension JSON for callers that pass a
  // hand-built model (tests, future scripts) without going through the
  // file service.
  if (typeof dataset.viewQuery === "string" && dataset.viewQuery.length > 0) {
    return dataset.viewQuery;
  }
  const ext = dataset.custom_extensions?.find((e) => e.vendor_name === "COMMON");
  if (!ext) return null;
  try {
    const parsed = JSON.parse(ext.data) as { view_query?: unknown };
    if (typeof parsed.view_query === "string" && parsed.view_query.length > 0) {
      return parsed.view_query;
    }
  } catch {
    // ignore — return null below
  }
  return null;
}

export function getAttachedCatalogSlugs(
  connections: IConnectionDocument[],
): string[] {
  return connections.map((c) => c.slug);
}

export async function hardenConnection(db: DuckDBConnection, searchPath?: string, opts?: { allowExternalAccess?: boolean }): Promise<void> {
  if (!opts?.allowExternalAccess) {
    try { await db.run("SET enable_external_access = false"); } catch { /* already set */ }
  }
  try { await db.run("SET threads = 2"); } catch { /* already set */ }
  try { await db.run("SET memory_limit = '512MB'"); } catch { /* already set */ }
  if (searchPath) await db.run(`SET search_path = '${searchPath}'`);
}
