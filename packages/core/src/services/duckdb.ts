import { rm } from "node:fs/promises";
import { join } from "node:path";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import { connectDB } from "../infra/db";
import { Connection, type IConnectionDocument } from "../models/index";
import type { SemanticModel } from "./semantic-model-schema";
import { decryptConnectionCredentials } from "../infra/crypto";
import {
  allowUnsignedExtensions,
  customFirebirdEnabled,
  firebirdExtensionRepository,
  getEnv,
} from "../config/env";
import { validateSqlAst } from "./sql-ast-validation";

const SAFE_PROJECT_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * Resolve the legacy on-disk DuckDB file path for a project, validating
 * `projectId` against the same regex `SemanticModelFileService` uses so we
 * never end up touching files outside `<ARCHMAX_DATA_DIR>/projects/`.
 *
 * Project instances are now in-memory and per-process (see
 * `setupProjectInstance`), so nothing creates this file anymore. It is kept
 * only so `deleteProjectDuckdbFile` can clean up a stale file left behind by
 * an older, file-backed build.
 */
export function duckdbFilePath(projectId: string): string {
  if (!projectId || !SAFE_PROJECT_ID.test(projectId)) {
    throw new Error(`Invalid projectId: must be alphanumeric (with ._-), got "${projectId}"`);
  }
  return join(getEnv().projectsDir, projectId, "duckdb.db");
}

async function deleteDuckdbFiles(path: string): Promise<void> {
  await rm(path, { force: true });
  await rm(`${path}.wal`, { force: true });
  await rm(`${path}.tmp`, { force: true, recursive: true });
}

/**
 * Create a fresh in-memory `DuckDBInstance`, applying the
 * `allow_unsigned_extensions` startup option when the operator has opted in
 * via `DUCKDB_ALLOW_UNSIGNED_EXTENSIONS` or enabled the custom Firebird
 * extension (`DUCKDB_ENABLE_CUSTOM_FIREBIRD`), which is itself unsigned. The
 * option can only be set at instance-creation time (not via `SET`), so every
 * call site that opens an instance routes through here to get a consistent
 * configuration.
 */
export async function createDuckDBInstance(): Promise<DuckDBInstance> {
  if (allowUnsignedExtensions() || customFirebirdEnabled()) {
    return DuckDBInstance.create(undefined, { allow_unsigned_extensions: "true" });
  }
  return DuckDBInstance.create();
}

// ── Query timeout helper ─────────────────────────────────────────────

export function getQueryTimeoutMs(): number {
  const configured = Number(process.env.QUERY_TIMEOUT_MS);
  return configured > 0 ? configured : 30_000;
}

/**
 * Raised when an in-flight DuckDB operation is aborted via an `AbortSignal`
 * (e.g. the user pressed "stop" on an agent run). Distinct from the
 * timeout error so callers can tell a user-cancellation apart from a
 * slow query and re-throw it to abort the whole run rather than swallowing
 * it into a recoverable tool result.
 */
export class QueryCancelledError extends Error {
  constructor(message = "Query cancelled") {
    super(message);
    this.name = "QueryCancelledError";
  }
}

/**
 * True for any error that represents a user/abort cancellation rather than a
 * genuine query failure. Matches our own `QueryCancelledError` as well as the
 * standard `AbortError` (`DOMException`/`Error` with `name === "AbortError"`)
 * that LangChain/LangGraph and `fetch` raise when an `AbortSignal` fires.
 */
export function isQueryCancelledError(err: unknown): boolean {
  if (err instanceof QueryCancelledError) return true;
  const name = (err as { name?: unknown } | null)?.name;
  return name === "QueryCancelledError" || name === "AbortError";
}

/**
 * Run an async operation against a DuckDB connection with a hard timeout and
 * optional cooperative cancellation.
 *
 * On timeout, `connection.interrupt()` is called to cancel the in-flight
 * query inside DuckDB, then the promise rejects with a timeout error.
 *
 * When an aborted `signal` is supplied, `connection.interrupt()` is likewise
 * called immediately so a long-running query stops promptly (rather than
 * blocking the agent run for up to the full timeout), and the promise rejects
 * with a `QueryCancelledError`. The timer and abort listener are always
 * cleaned up regardless of outcome.
 */
export async function withQueryTimeout<T>(
  connection: DuckDBConnection,
  operation: () => Promise<T>,
  timeoutMs: number = getQueryTimeoutMs(),
  signal?: AbortSignal,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      try { connection.interrupt(); } catch { /* best-effort */ }
      reject(new Error(`Query timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
  });

  const racers: Array<Promise<T>> = [operation(), timeoutPromise];

  if (signal) {
    const abortPromise = new Promise<never>((_resolve, reject) => {
      if (signal.aborted) {
        try { connection.interrupt(); } catch { /* best-effort */ }
        reject(new QueryCancelledError());
        return;
      }
      onAbort = () => {
        try { connection.interrupt(); } catch { /* best-effort */ }
        reject(new QueryCancelledError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
    racers.push(abortPromise);
  }

  try {
    return await Promise.race(racers);
  } finally {
    clearTimeout(timer);
    if (signal && onAbort) signal.removeEventListener("abort", onAbort);
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

// ── Per-project materialisation mutex ────────────────────────────────
//
// `CREATE OR REPLACE VIEW` is an ALTER on the DuckDB catalog. When several
// MCP requests for the same model land together, each runs its own
// materialisation pass and they race to (re)create the same scoped views,
// which DuckDB aborts with "TransactionContext Error: Catalog write-write
// conflict on alter". The tail-chaining promise mutex below serialises
// materialisation per project so concurrent callers queue instead of
// colliding. The map is pruned once a project's queue drains so it does
// not grow unbounded.
const materialiseTails = new Map<string, Promise<unknown>>();

export function withProjectMaterialiseLock<T>(
  projectId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const tail = materialiseTails.get(projectId) ?? Promise.resolve();
  // Run `operation` once the previous pass settles, regardless of whether
  // it resolved or rejected, so one failed pass never wedges the queue.
  const result = tail.then(operation, operation);
  const newTail = result.then(
    () => {},
    () => {},
  );
  materialiseTails.set(projectId, newTail);
  void newTail.finally(() => {
    if (materialiseTails.get(projectId) === newTail) {
      materialiseTails.delete(projectId);
    }
  });
  return result;
}

// ── Project DuckDB instance cache ────────────────────────────────────

interface ProjectDuckDB {
  instance: DuckDBInstance;
  attachedSlugs: Set<string>;
  loadedExtensions: Set<string>;
  readOnly: boolean;
  /**
   * Number of in-flight callers (query slots / materialisation passes) that
   * currently hold a live connection on `instance`. Incremented for the
   * duration of a `withRecoverableProjectInstance` op and decremented when it
   * settles. A self-heal `disposeProjectInstance` must NOT `closeSync()` the
   * native instance while this is non-zero, or those callers hit DuckDB
   * use-after-close.
   */
  refCount: number;
  /**
   * Set when `disposeProjectInstance` wanted to close this instance but had
   * to defer because `refCount > 0`. The last `releaseInstanceRef` then
   * performs the deferred `closeSync()`.
   */
  closePending: boolean;
}

/**
 * Take a usage reference on the project's currently-cached instance, but only
 * if it is the same `DuckDBInstance` the caller is about to run against. The
 * lookup + increment is synchronous (no `await` between them) so it cannot
 * race a concurrent dispose. Returns the held entry, or `undefined` if the
 * cache no longer points at `instance` (in which case the caller simply runs
 * without a ref — its instance is already detached from the cache).
 */
function acquireInstanceRef(
  projectId: string,
  instance: DuckDBInstance,
): ProjectDuckDB | undefined {
  const entry = projectInstances.get(projectId);
  if (entry && entry.instance === instance) {
    entry.refCount++;
    return entry;
  }
  return undefined;
}

/**
 * Release a usage reference taken by `acquireInstanceRef`. When the last ref
 * on an entry that `disposeProjectInstance` already evicted is released, the
 * deferred `closeSync()` runs here.
 */
function releaseInstanceRef(entry: ProjectDuckDB): void {
  entry.refCount--;
  if (entry.refCount <= 0 && entry.closePending) {
    entry.closePending = false;
    try {
      entry.instance.closeSync();
    } catch {
      // best-effort — instance may already be closed
    }
  }
}

const projectInstances = new Map<string, ProjectDuckDB>();
const setupLocks = new Map<string, Promise<void>>();

/**
 * Upper bound on how many times `withRecoverableProjectInstance` will re-fetch
 * the cached instance when a concurrent dispose/replace keeps detaching it
 * before the caller can take a usage ref. A single retry is the normal case;
 * the bound only guards against a pathological dispose storm.
 */
const MAX_INSTANCE_ACQUIRE_ATTEMPTS = 16;

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
    case "firebird":
      return "firebird";
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
    case "firebird": {
      // The custom (unsigned) Firebird extension takes a key=value DSN. The
      // `database` value is an opaque path/alias as seen on the Firebird host
      // (e.g. `C:\firebird.fdb`), not a local file path. Default port 3050 and
      // charset UTF8 mirror the Firebird defaults.
      const port = cfg.port ?? 3050;
      const charset = cfg.charset ?? "UTF8";
      return `host=${cfg.host} port=${port} database=${cfg.database} user=${cfg.user} password=${cfg.password} charset=${charset}`;
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
 * Closes the underlying (in-memory) `DuckDBInstance` on a best-effort basis
 * and removes the entry (including its attached-slug and loaded-extension
 * bookkeeping) from the cache so the next `getProjectInstance` call rebuilds
 * from scratch. Used to force re-reading of upstream schemas when they have
 * changed, and by `withRecoverableProjectInstance` to drop an invalidated
 * instance.
 *
 * Because instances are in-memory, disposing simply frees the process's copy:
 * the next `getProjectInstance(projectId, …)` builds a fresh empty instance,
 * re-attaches every active connection, and rematerialises scoped VIEWs on the
 * next query. Nothing persists across dispose.
 */
export async function disposeProjectInstance(projectId: string): Promise<void> {
  while (setupLocks.has(projectId)) {
    await setupLocks.get(projectId);
  }
  const entry = projectInstances.get(projectId);
  if (!entry) return;
  // Evict immediately so the next getProjectInstance rebuilds from scratch,
  // but only close the native instance once no in-flight caller still holds a
  // connection on it. Setup locks are drained above; query slots and
  // materialisation passes are tracked via refCount. Closing under an active
  // ref would tear DuckDB state out from beneath a running query.
  projectInstances.delete(projectId);
  if (entry.refCount > 0) {
    entry.closePending = true;
    return;
  }
  try {
    entry.instance.closeSync();
  } catch {
    // best-effort — instance may already be closed
  }
}

/**
 * Dispose every cached `DuckDBInstance` and wait for in-flight setup locks
 * to drain. Intended for graceful shutdown handlers (SIGTERM/SIGINT) so each
 * project's in-memory instance is released cleanly before exit.
 */
export async function disposeAllProjectInstances(): Promise<void> {
  const ids = Array.from(projectInstances.keys());
  await Promise.all(ids.map((id) => disposeProjectInstance(id)));
}

/**
 * Best-effort removal of any legacy on-disk `duckdb.db` (and its WAL/temp side
 * files) for a project. Project instances are in-memory now, so this no longer
 * affects live state — it only cleans up a stale file left behind by an older,
 * file-backed build. Still wired into the `connections/reinit?reset=true` flow
 * so an operator's "reset" reclaims that disk space. Safe to call when the
 * file does not exist.
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

/**
 * Detect a *fatal instance-level* DuckDB failure: the entire `DuckDBInstance`
 * has entered an unrecoverable state and MUST be torn down and rebuilt before
 * it can serve any further query. This is categorically different from
 * `isTransientDuckdbError` (a per-connection/per-query fault that a retry on
 * the SAME instance can clear).
 *
 * When DuckDB's federated scanners (postgres/mysql/mssql) lose their upstream
 * connection pool, DuckDB poisons the whole database and every subsequent
 * statement — including `instance.connect()` and the `CREATE SCHEMA` issued
 * during view materialisation — throws the same error until the instance is
 * recreated:
 *
 *   FATAL Error: Failed: database has been invalidated because of a previous
 *   fatal error. The database must be restarted prior to being used again.
 *   Original error: "PooledConnection::GetConnection - no connection available"
 *
 * Because the instance is cached per project in `projectInstances`, a single
 * such fault would otherwise wedge every query for that project for the rest
 * of the process lifetime. Callers run their DuckDB work through
 * `withRecoverableProjectInstance` so the cache self-heals on the next call.
 *
 * Only the DuckDB *invalidation/restart* phrases are treated as fatal. The
 * trailing pool phrases (`PooledConnection::GetConnection`, `no connection
 * available`) are deliberately NOT matched on their own: they also appear in
 * ordinary, non-fatal upstream/query faults, and classifying those as fatal
 * would force an unnecessary project-wide dispose + full re-ATTACH (expensive,
 * and it amplifies the credential-bearing setup-error path). In a genuine
 * instance-invalidation the pool phrase always rides along with the
 * invalidation message, so matching the invalidation/restart text is both
 * sufficient and safe.
 */
export function isFatalInstanceError(message: string): boolean {
  return /database has been invalidated|must be restarted prior to being used/i.test(
    message,
  );
}

/**
 * Run `op` against the project's cached DuckDB instance, transparently
 * disposing and rebuilding the instance and retrying ONCE when an attempt
 * fails with a fatal instance-invalidation error (see `isFatalInstanceError`).
 *
 * `op` receives a live `DuckDBInstance` and is responsible for opening and
 * closing its own connection(s). It MUST let DuckDB errors propagate (rather
 * than swallowing them into a result value) so the fatal-error detection can
 * fire; non-fatal errors are re-thrown immediately without a rebuild.
 *
 * A poisoned instance breaks `instance.connect()` itself, so both the
 * `getProjectInstance` setup and the `op` body are covered. Only one rebuild
 * is attempted: if the freshly built instance also fails fatally (e.g. the
 * upstream database is genuinely down) the error propagates so the caller can
 * surface it.
 */
export async function withRecoverableProjectInstance<T>(
  projectId: string,
  connections: IConnectionDocument[],
  options: { readOnly?: boolean } | undefined,
  op: (instance: DuckDBInstance) => Promise<T>,
): Promise<T> {
  let rebuilt = false;
  // Bounds the acquire-retry path below so a pathological dispose storm cannot
  // spin forever; in practice the cache stabilises within a single retry.
  let acquireAttempts = 0;
  for (;;) {
    // Hold a usage ref on the cached instance for the lifetime of `op` so a
    // concurrent self-heal (another request hitting a fatal error for the
    // same project) defers its `closeSync()` until our query/materialisation
    // has released the instance — never closing native state underneath an
    // in-flight query. `getProjectInstance` stays inside the try so a fatal
    // failure during setup/ATTACH still triggers the one-shot rebuild.
    let held: ProjectDuckDB | undefined;
    try {
      const instance = await getProjectInstance(projectId, connections, options);
      // `getProjectInstance` awaits (setup locks / ATTACH), so between it
      // resolving and us taking a ref another task could have disposed or
      // replaced the cached entry. `acquireInstanceRef` increments the ref
      // synchronously and only succeeds while the cache still points at this
      // exact `instance`; if it returns `undefined`, our `instance` is already
      // detached from the cache (and may be mid-close), so running `op` on it
      // would risk DuckDB use-after-close. Re-fetch a fresh, ref-counted
      // instance instead of querying a stale one.
      held = acquireInstanceRef(projectId, instance);
      if (!held) {
        if (++acquireAttempts > MAX_INSTANCE_ACQUIRE_ATTEMPTS) {
          throw new Error(
            `Could not acquire a stable DuckDB instance for project ${projectId} after repeated disposals`,
          );
        }
        continue;
      }
      acquireAttempts = 0;
      return await op(instance);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!rebuilt && isFatalInstanceError(message)) {
        rebuilt = true;
        if (held) {
          // Tear down the *specific* instance we ran against — not whatever is
          // cached now. While we held a ref, a concurrent dispose/extension
          // rebuild could have evicted our (poisoned) entry and installed a
          // fresh healthy instance under this projectId; disposing by id alone
          // would wrongly close that healthy instance. Evict our entry only if
          // the cache still points at it, mark it `closePending`, then release
          // our ref so the close happens now if we are the last in-flight user
          // (otherwise the last releaser closes it). The next iteration's
          // getProjectInstance rebuilds from scratch.
          if (projectInstances.get(projectId) === held) {
            projectInstances.delete(projectId);
          }
          held.closePending = true;
          releaseInstanceRef(held);
          held = undefined;
        } else {
          // No ref was ever taken — the fatal failure happened during
          // setup/ATTACH (before acquisition), so fall back to disposing by id
          // to clear any partially-built cached entry.
          await disposeProjectInstance(projectId);
        }
        continue;
      }
      throw err;
    } finally {
      if (held) releaseInstanceRef(held);
    }
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
    // In-memory, per-process database. A single persistent `duckdb.db` file
    // cannot be opened by more than one process at a time — the API and the
    // BullMQ worker run as separate node processes (see `entrypoint.sh`), and
    // each keeps its own `projectInstances` cache, so a shared on-disk file
    // collides with DuckDB's whole-file lock:
    //   "IO Error: Could not set lock on file ... Conflicting lock is held in
    //    /usr/local/bin/node (PID …)".
    // Nothing relies on cross-process or cross-restart persistence: scoped
    // `_scope_*` VIEWs are rebuilt by `materialiseModelViews` on every query
    // (no hash cache) and connections are re-attached whenever a fresh
    // instance is created, so an in-memory database is functionally
    // equivalent without the lock contention.
    const instance = await createDuckDBInstance();
    entry = {
      instance,
      attachedSlugs: new Set(),
      loadedExtensions: new Set(),
      readOnly,
      refCount: 0,
      closePending: false,
    };
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

/**
 * Install and/or load a DuckDB extension on the project's cached instance.
 * Used by the federation console; mutates in-memory extension state only.
 */
export async function ensureProjectExtensionLoaded(
  projectId: string,
  extension: string,
  options?: { fromCommunity?: boolean; loadOnly?: boolean; fromSource?: string },
): Promise<void> {
  await connectDB();
  const connections = await Connection.find({ project: projectId, isActive: true }).lean();
  await getProjectInstance(projectId, connections, { readOnly: true });
  const entry = projectInstances.get(projectId);
  if (!entry) {
    throw new Error(`No DuckDB instance for project ${projectId}`);
  }

  if (options?.loadOnly) {
    const db = await entry.instance.connect();
    try {
      await db.run(`LOAD ${extension}`);
    } finally {
      db.disconnectSync();
    }
    entry.loadedExtensions.add(extension);
    return;
  }

  if (!entry.loadedExtensions.has(extension)) {
    await installAndLoadExtension(entry.instance, extension, {
      fromCommunity: options?.fromCommunity,
      fromSource: options?.fromSource,
    });
    entry.loadedExtensions.add(extension);
    return;
  }

  const db = await entry.instance.connect();
  try {
    await db.run(`LOAD ${extension}`);
  } finally {
    db.disconnectSync();
  }
}

async function installAndLoadExtension(
  instance: DuckDBInstance,
  ext: string,
  options?: { fromCommunity?: boolean; fromSource?: string },
): Promise<void> {
  const db = await instance.connect();
  try {
    // The custom (unsigned) Firebird extension is installed from a custom
    // repository: set `custom_extension_repository` then a plain INSTALL,
    // rather than the `INSTALL <ext> FROM '<source>'` shape. The repo is
    // single-quote escaped before interpolation.
    if (ext === "firebird") {
      const repo = firebirdExtensionRepository().replace(/'/g, "''");
      await db.run(`SET custom_extension_repository = '${repo}'`);
      await db.run("INSTALL firebird");
      await db.run("LOAD firebird");
      return;
    }
    // A custom source (env-gated unsigned install) wins over the community
    // repository. The source is single-quote escaped before interpolation.
    let installSuffix: string;
    if (options?.fromSource) {
      installSuffix = ` FROM '${options.fromSource.replace(/'/g, "''")}'`;
    } else {
      const fromCommunity = options?.fromCommunity ?? COMMUNITY_EXTENSIONS.has(ext);
      installSuffix = fromCommunity ? " FROM community" : "";
    }
    await db.run(`INSTALL ${ext}${installSuffix}`);
    await db.run(`LOAD ${ext}`);
    if (ext === "mysql") {
      // These are DuckDB *settings* registered by the mysql extension (set via
      // `SET`), NOT ATTACH connection-string keys — putting them in the DSN
      // makes the connection-string parser reject the attach. `force` makes an
      // exhausted client-side pool open an extra connection instead of failing
      // with "PooledConnection::GetConnection - no connection available" under
      // join fan-out + concurrent agent workloads; 32 raises the ceiling. Set
      // GLOBAL so the per-query connections (not just this one) inherit it, and
      // before any ATTACH so the catalog's pool is created with these values.
      // Already the modern extension defaults, but pinned here so behavior is
      // stable across extension versions. Guarded for older builds that may not
      // expose these settings.
      try {
        await db.run("SET GLOBAL mysql_pool_acquire_mode = 'force'");
        await db.run("SET GLOBAL mysql_pool_size = 32");
      } catch (err) {
        console.warn("[duckdb] Failed to apply mysql pool settings:", err);
      }
    }
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

  const instance = await createDuckDBInstance();
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
  const instance = await createDuckDBInstance();
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
  // `fieldSchema` only requires `name: z.string().min(1)`, so an
  // authored field name could contain `"` or other punctuation. Always
  // route through `quoteIdentifier` (which doubles embedded `"`) so a
  // name like `a", bar AS "baz` cannot break out of the projection
  // and turn the inferred body into a structurally-valid SELECT that
  // exposes columns the model never declared. Caller (`materialiseModelViews`)
  // additionally rejects field names containing control characters.
  const columns = dataset.fields.map((f) => {
    const quotedName = quoteIdentifier(f.name);
    const expr = f.expression?.dialects?.[0]?.expression ?? f.name;
    if (expr === f.name) return quotedName;
    if (SIMPLE_IDENT_RE.test(expr)) return `${quoteIdentifier(expr)} AS ${quotedName}`;
    return `${expr} AS ${quotedName}`;
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

const VIEW_MATERIALISE_MAX_ATTEMPTS = 3;
const VIEW_MATERIALISE_RETRY_BASE_MS = 250;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Heuristic: does a DuckDB/extension error message describe a *transient*
 * connection-level fault (a cold attach handshake, a dropped upstream pool
 * connection, an upstream temporarily unavailable) rather than a permanent
 * authoring problem (bad column, syntax error in the view body)?
 *
 * Only transient faults are retried by `materialiseModelViews`. A genuine
 * binder/catalog error (e.g. a `view_query` referencing a column that does
 * not exist) is NOT transient, so it fails fast and surfaces immediately.
 * Our own query-timeout sentinel ("Query timed out after Ns") is also NOT
 * matched here — a slow bind already consumed its full per-view budget, so
 * retrying it would only stack more multi-second waits.
 *
 * A DuckDB catalog "write-write conflict" IS treated as transient: it is a
 * concurrency abort that succeeds on a re-run once the competing
 * transaction commits. `withProjectMaterialiseLock` already serialises
 * passes within this process, but classifying the conflict as retryable is
 * a cheap safety net for any residual contention.
 */
export function isTransientDuckdbError(message: string): boolean {
  // Match multi-word phrases / contextualised tokens only. Bare substrings
  // like `network` or `EOF` are deliberately avoided: a permanent binder
  // error referencing an identifier such as `network_bytes` or a column
  // named `eof` must NOT be misclassified as transient and retried.
  return /connection (error|reset|refused|timed out)|could not connect|failed to connect|server closed|terminating connection|broken pipe|i\/o error|network (is unreachable|error)|temporarily unavailable|too many clients|unexpected eof|write-write conflict/i.test(
    message,
  );
}

/**
 * Run a DuckDB operation, retrying with linear backoff only when the
 * failure looks like a transient connection fault (see
 * `isTransientDuckdbError`). Returns a discriminated result instead of
 * throwing so callers can record a per-dataset failure without aborting
 * the rest of the materialisation loop.
 *
 * When `deadlineMs` (an absolute `Date.now()` epoch) is supplied, the
 * helper never starts an attempt or sleeps a backoff that would run past
 * it. This lets callers enforce a single overall wall-clock budget across
 * many retried operations so a slow/unavailable upstream cannot tie up
 * resources for `attempts * timeout` per item.
 */
export async function retryOnTransientDuckdbError(
  op: () => Promise<void>,
  opts?: { maxAttempts?: number; baseDelayMs?: number; deadlineMs?: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const maxAttempts = opts?.maxAttempts ?? VIEW_MATERIALISE_MAX_ATTEMPTS;
  const baseDelayMs = opts?.baseDelayMs ?? VIEW_MATERIALISE_RETRY_BASE_MS;
  const deadlineMs = opts?.deadlineMs;
  let lastError = "";
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
      return { ok: false, error: lastError || "Materialisation time budget exceeded." };
    }
    try {
      await op();
      return { ok: true };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt === maxAttempts || !isTransientDuckdbError(lastError)) {
        return { ok: false, error: lastError };
      }
      const backoff = baseDelayMs * attempt;
      if (deadlineMs !== undefined && Date.now() + backoff >= deadlineMs) {
        return { ok: false, error: lastError };
      }
      await delay(backoff);
    }
  }
  return { ok: false, error: lastError };
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
 * - Resilient to transient faults: each `CREATE OR REPLACE VIEW` is retried
 *   with linear backoff when it fails with a transient connection error
 *   (see `retryOnTransientDuckdbError`), so a cold upstream connection on
 *   the first call no longer surfaces a permanent-sounding "ask the
 *   maintainer" error. Permanent failures (validator rejection, binder
 *   error) are not retried.
 * - Time-bounded: the whole pass (all views, all retries and backoffs)
 *   shares a single wall-clock budget equal to one query timeout, so a
 *   slow/unavailable upstream cannot let materialisation run past the
 *   advertised `execute_query` timeout. Once the budget is exhausted the
 *   remaining datasets fail fast.
 * - Error-isolated: validator or DuckDB failures on one dataset never
 *   abort the materialisation of the rest. The previous VIEW (if any) is
 *   left in place and a warning is logged.
 */
export async function materialiseModelViews(
  instance: DuckDBInstance,
  projectId: string,
  model: SemanticModel,
  signal?: AbortSignal,
): Promise<MaterialiseViewsResult> {
  // Serialise per project: concurrent passes racing on the same scoped
  // VIEWs abort with a DuckDB catalog write-write conflict (see
  // `withProjectMaterialiseLock`).
  return withProjectMaterialiseLock(projectId, () =>
    materialiseModelViewsLocked(instance, model, signal),
  );
}

async function materialiseModelViewsLocked(
  instance: DuckDBInstance,
  model: SemanticModel,
  signal?: AbortSignal,
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
  // A cold upstream connection (notably the first Postgres bind after
  // ATTACH) can take well over the old 10s cap to resolve the remote
  // table's schema while DuckDB binds `CREATE OR REPLACE VIEW`. Rather than
  // an aggressive per-view cap, bound the *entire* materialisation pass
  // (every view + every retry/backoff) by a single wall-clock budget equal
  // to one query timeout. This keeps a slow/unavailable upstream from
  // tying up resources for `datasets * attempts * timeout` while still
  // giving a slow-but-valid first call enough room to succeed — in
  // practice only the first view pays the cold-connection cost; the rest
  // reuse the now-warm attach. Once the budget is spent, remaining views
  // fail fast.
  const materialiseDeadline = Date.now() + getQueryTimeoutMs();

  const db = await instance.connect();
  try {
    await withQueryTimeout(db, () => db.run(`CREATE SCHEMA IF NOT EXISTS ${schema}`), 5_000, signal);
    for (const ds of model.datasets) {
      // Stop promptly when the agent run was cancelled mid-materialisation
      // instead of grinding through the remaining datasets (each of which can
      // pay a cold-connection cost up to the shared deadline).
      if (signal?.aborted) throw new QueryCancelledError();
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

      // Same control-character gate for field names: `quoteIdentifier`
      // doubles embedded `"` but cannot make a name with a NUL or
      // newline safe to embed in a multi-line `SELECT` projection.
      // Without this, a field name like `id\nUNION ALL SELECT * FROM
      // secret_table` could survive AST validation as two structurally
      // valid statements and expose data the dataset never declared.
      const badField = (ds.fields ?? []).find((f) => /[\u0000-\u001F]/.test(f.name));
      if (badField) {
        const errMsg = `Field name "${badField.name}" contains a control character; refusing to materialise.`;
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
      const created = await retryOnTransientDuckdbError(
        async () => {
          // Per-attempt timeout = whatever remains of the shared budget, so
          // the total materialisation pass can never exceed it.
          const remaining = materialiseDeadline - Date.now();
          await withQueryTimeout(
            db,
            () => db.run(`CREATE OR REPLACE VIEW ${viewName} AS ${viewQuery}`),
            Math.max(1, remaining),
            signal,
          );
        },
        { deadlineMs: materialiseDeadline },
      );
      // A cancellation surfaces as a non-transient failure from the retry
      // helper; re-raise it so the run aborts instead of being recorded as a
      // per-dataset materialisation failure.
      if (signal?.aborted) throw new QueryCancelledError();
      if (created.ok) {
        result.materialised.push(ds.name);
        if (wasInferred) result.inferred.push(ds.name);
      } else {
        console.warn(
          `[materialiseModelViews] Skipped dataset "${ds.name}" in model "${model.name}": DuckDB error during CREATE OR REPLACE VIEW (${created.error})`,
        );
        result.failed.push({ dataset: ds.name, error: created.error });
      }
    }
  } finally {
    db.disconnectSync();
  }

  return result;
}

/**
 * Redact upstream connection secrets from a DuckDB/extension error message
 * before it crosses any client, log, or LLM boundary.
 *
 * `buildAttachString` / `attachIcebergCatalog` interpolate decrypted
 * credentials into the `ATTACH` / `CREATE SECRET` SQL we hand to DuckDB
 * (`password=…`, `Password=…;`, a `postgresql://user:pw@host` URI, or an
 * iceberg bearer `TOKEN '…'`). When ATTACH/setup fails, DuckDB frequently
 * echoes the offending statement — including those secrets — back in the
 * error message. The MCP/agent recovery catches surface that message to the
 * caller and persist it in call logs, so scrub the known secret shapes here
 * first. This is intentionally conservative (redacts the secret value, keeps
 * the surrounding error text) so genuine query errors stay actionable.
 */
export function redactConnectionSecrets(message: string): string {
  return message
    // key=value credential fields. Postgres/MySQL attach strings are
    // space-delimited (`password=pw`); MSSQL is `;`-delimited
    // (`Password=pw;`). Stop the value at the first `;` or whitespace.
    .replace(/\b(password|pwd)\s*=\s*[^;\s]+/gi, "$1=***")
    // URI userinfo: `scheme://user:password@host` → keep the user, drop the secret.
    .replace(/(\/\/[^:@/\s]+):[^@/\s]+@/g, "$1:***@")
    // Iceberg bearer token in `CREATE [TEMPORARY] SECRET … TOKEN '…'`.
    // The body may contain `''`-escaped quotes, so consume those too.
    .replace(/(\bTOKEN\s+)'(?:[^']|'')*'/gi, "$1'***'");
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
