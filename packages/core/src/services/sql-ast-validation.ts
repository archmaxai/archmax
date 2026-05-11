import { DuckDBInstance } from "@duckdb/node-api";
import { withQueryTimeout } from "./duckdb";

/**
 * Structural SQL validator built on DuckDB's own parser via
 * `json_serialize_sql`. This is the sole SQL-safety layer between an
 * external caller (MCP `execute_query`, the semantic-model agent's
 * tools) and the project's federated DuckDB instance.
 *
 * Why use the parser directly: regex-based lexers cannot tokenize SQL,
 * so quoting variants (`"information_schema"."tables"`,
 * `U&"\006D\0061\0069\006E".x`, dollar-quoted statement separators,
 * mid-token comments inside `EXPLAIN ... ANALYZE`, etc.) can
 * systematically fool them. By using the *same* parser DuckDB will
 * execute against, the validator's view of the query and the engine's
 * view cannot disagree.
 *
 * The parser instance is dedicated to validation: no extensions, no
 * attached catalogs, `enable_external_access=false`. `json_serialize_sql`
 * is parse-only — it never invokes DuckDB's binder — so the parsing
 * instance does not need any of the project's source tables, scoped
 * views, or attached catalogs to validate a query.
 */

/** Validation modes. */
export type SqlAstValidationMode = "mcp" | "agent" | "view_query";

export interface SqlAstValidationOpts {
  /**
   * - `'mcp'`: strict mode used by the MCP `execute_query` tool and the
   *   agent's `runModelQuery` tool. Enforces that every BASE_TABLE
   *   reference has empty `schema_name` / `catalog_name` and that
   *   `table_name` / `schema_name` / `catalog_name` do not reference
   *   system catalogs, the project's connection slugs, or any
   *   `_scope_*` schema.
   * - `'agent'`: permissive mode used by the agent's general
   *   `executeQuery` tool — the agent legitimately uses fully-qualified
   *   `catalog.schema.table` references for schema exploration. The
   *   single-statement, statement-type allowlist, table-function
   *   allowlist, and scalar-function denylist still apply.
   * - `'view_query'`: gate for persistent `view_query` bodies. Allows
   *   attached `catalog.schema.table` source references (the legitimate
   *   shape of a view body), but still rejects system catalogs
   *   (`information_schema`, `pg_catalog`, `sqlite_master`, `main`,
   *   `temp`, `system`), `_scope_*`, and `duckdb_*`. This closes a
   *   privilege-escalation hole where an authored dataset could expose
   *   raw catalog metadata to any MCP token scoped to the model.
   */
  mode: SqlAstValidationMode;
  /** Project's active connection slugs. Only consulted in 'mcp' mode. */
  catalogSlugs?: string[];
}

// ── Parser instance ──────────────────────────────────────────────────

const PARSE_TIMEOUT_MS = 1_000;

let parserInstancePromise: Promise<DuckDBInstance> | null = null;

/**
 * Lazy-initialised, process-wide DuckDB instance dedicated to parsing
 * SQL via `json_serialize_sql`. No extensions, no attached catalogs,
 * `enable_external_access=false`. Each parse opens a fresh connection
 * from this shared instance and disconnects when done.
 */
async function getParserInstance(): Promise<DuckDBInstance> {
  if (!parserInstancePromise) {
    parserInstancePromise = (async () => {
      try {
        return await DuckDBInstance.create();
      } catch (err) {
        // Reset so a subsequent call retries instead of caching the failure.
        parserInstancePromise = null;
        throw err;
      }
    })();
  }
  return parserInstancePromise;
}

interface SerializeSqlPayload {
  error: boolean;
  error_type?: string;
  error_message?: string;
  error_subtype?: string;
  position?: string;
  statements?: Array<{ node: AstNode }>;
}

/**
 * Run `json_serialize_sql` against the given SQL on the dedicated
 * parsing connection. The SQL is passed via a bound parameter
 * (`CAST(? AS VARCHAR)`) so it is never interpolated into the query
 * we execute against the parser.
 */
async function serializeSqlToAst(sql: string): Promise<SerializeSqlPayload> {
  const instance = await getParserInstance();
  const db = await instance.connect();
  try {
    // Defence-in-depth: lock the parsing connection down even though the
    // shared instance has no extensions and no attached catalogs. May
    // throw if the option is already locked at instance scope — ignore.
    try {
      await db.run("SET enable_external_access = false");
    } catch {
      // intentionally swallowed
    }

    const prepared = await db.prepare(
      "SELECT json_serialize_sql(CAST(? AS VARCHAR), skip_default := true, format := false) AS ast",
    );
    prepared.bindVarchar(1, sql);
    const result = await withQueryTimeout(db, () => prepared.run(), PARSE_TIMEOUT_MS);
    const rows: unknown[][] = [];
    for await (const chunk of result) {
      for (const row of chunk.getRows()) rows.push(row);
    }
    const firstColumn = rows[0]?.[0];
    if (typeof firstColumn !== "string") {
      throw new Error("json_serialize_sql returned no row");
    }
    return JSON.parse(firstColumn) as SerializeSqlPayload;
  } finally {
    db.disconnectSync();
  }
}

// ── Lexical preprocessing (EXPLAIN / DESCRIBE) ───────────────────────

/**
 * Strip leading whitespace, single-line (`-- ...`) and block
 * (slash-star ... star-slash) comments, recursively. Used to peel
 * the leading keyword of a query before deciding how to dispatch to
 * the parser.
 */
function stripLeadingTrivia(sql: string): string {
  return sql.replace(/^(\s+|--[^\n]*\n?|\/\*[\s\S]*?\*\/)*/, "");
}

type PeelResult =
  | { ok: true; body: string }
  | { ok: false; error: string };

/**
 * Detect leading EXPLAIN (with optional intervening comments). Returns
 * the body that should be passed to the parser, or an error if the
 * EXPLAIN is followed by ANALYZE — including the comment-evasion
 * variant (`EXPLAIN <comment> ANALYZE`) that the lexical pre-filter's
 * regex misses because it scans byte-form text.
 */
function peelExplain(sql: string): PeelResult {
  const stripped = stripLeadingTrivia(sql);
  const m = /^EXPLAIN\b/i.exec(stripped);
  if (!m) return { ok: true, body: sql };
  const afterExplain = stripLeadingTrivia(stripped.slice(m[0].length));
  if (/^ANALYZE\b/i.test(afterExplain)) {
    return {
      ok: false,
      error:
        "EXPLAIN ANALYZE is not allowed (it executes the wrapped statement); " +
        "this includes comment-evasion variants such as `EXPLAIN <comment> ANALYZE`.",
    };
  }
  return { ok: true, body: afterExplain };
}

// ── AST allowlists / denylists ───────────────────────────────────────

/**
 * Top-level statement-shape node types accepted by the validator.
 * A query whose top-level node is anything else (INSERT_NODE,
 * UPDATE_NODE, COPY_NODE, …) — even though `json_serialize_sql`
 * already rejects those with "Only SELECT statements can be
 * serialized to json!" — is rejected on the AST layer too.
 */
const ALLOWED_QUERY_NODE_TYPES = new Set([
  "SELECT_NODE",
  "SET_OPERATION_NODE",
  "RECURSIVE_CTE_NODE",
]);

/**
 * From-table node types permitted anywhere inside the tree. Combined
 * with `ALLOWED_QUERY_NODE_TYPES` to form the full structural allowlist
 * applied by the walker.
 *
 * Expression-level `class`/`type` values (COLUMN_REF, FUNCTION,
 * CONSTANT, COMPARISON, OPERATOR, …) are NOT enumerated here — the
 * walker visits them only to dig for nested structural nodes and to
 * apply the scalar-function denylist; otherwise expression leaves are
 * unrestricted because the allowed-statement-type rule already
 * prevents side effects.
 */
const ALLOWED_FROM_TABLE_TYPES = new Set([
  "BASE_TABLE",
  "TABLE_FUNCTION",
  "JOIN",
  "SUBQUERY",
  "EMPTY",
  "EXPRESSION_LIST",
  "PIVOT",
  // DESCRIBE / SUMMARIZE wrap a SELECT in a SHOW_REF; allowed if its
  // show_type is DESCRIBE/SUMMARIZE (checked at the SHOW_REF site).
  "SHOW_REF",
]);

const ALLOWED_STRUCTURAL_NODE_TYPES = new Set([
  ...ALLOWED_QUERY_NODE_TYPES,
  ...ALLOWED_FROM_TABLE_TYPES,
]);

/**
 * Allowed `function_name` values for `TABLE_FUNCTION` nodes. Any
 * other table-function reference — `read_csv*`, `read_parquet*`,
 * `read_json*`, `read_blob*`, `read_text*`, `read_file*`,
 * `parse_sql`, `json_serialize_sql`, anything beginning with
 * `duckdb_`, `glob`, `pg_*` — is rejected.
 */
const ALLOWED_TABLE_FUNCTIONS = new Set([
  "generate_series",
  "range",
  "unnest",
  "repeat",
  "from_json",
  "values",
]);

/**
 * Forbidden BASE_TABLE schemas / catalogs / table-names. Matched
 * case-insensitively against the AST's parser-canonicalised name, so
 * quoting variants (`"information_schema"`, `"INFORMATION_SCHEMA"`,
 * dollar-quoted, …) cannot evade the check.
 *
 * Two prefix rules also apply to every name component:
 *   - `_scope_*`  — internal scoped schemas; never referenced directly
 *   - `duckdb_*`  — DuckDB metadata views that expose the host catalog
 *                   (`duckdb_columns`, `duckdb_tables`, `duckdb_secrets`,
 *                   …). The function form `duckdb_<x>()` is also denied
 *                   via the table-function allowlist and the scalar-
 *                   function denylist; this prefix rule covers the
 *                   bare-table form `SELECT * FROM duckdb_columns`.
 */
const FORBIDDEN_TABLE_NAMESPACES = new Set([
  "information_schema",
  "pg_catalog",
  "sqlite_master",
  "main",
  "temp",
  "system",
]);

const FORBIDDEN_TABLE_NAME_PREFIXES = ["_scope_", "duckdb_"];

/**
 * Predicates against a `function_name` (already lowercased) that
 * cause rejection when seen on a scalar `FUNCTION` node. The
 * `_scope_*` schema rule and the table-function allowlist already
 * cover *table-shaped* invocations of the same names — this set
 * tightens scalar use-sites such as `SELECT pg_read_file('/etc/x')`.
 */
function isForbiddenScalarFunction(name: string): boolean {
  return (
    name.startsWith("read_") ||
    name.startsWith("pg_read_") ||
    name === "pg_ls_dir" ||
    name.startsWith("duckdb_") ||
    name === "nextval" ||
    name === "currval" ||
    name === "parse_sql" ||
    name === "json_serialize_sql"
  );
}

// ── AST walker ───────────────────────────────────────────────────────

type AstNode = Record<string, unknown>;

function isObject(value: unknown): value is AstNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function lc(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

/**
 * Recursive walk that returns the first rejection reason encountered,
 * or `null` if every node passes. Invariant: structural rules (allowed
 * node types, BASE_TABLE / TABLE_FUNCTION restrictions, scalar-
 * function denylist) are applied *at every depth* — there is no
 * "top-level only" carve-out, so quoting / nesting cannot smuggle a
 * forbidden node past the validator.
 */
function walk(node: unknown, opts: SqlAstValidationOpts): string | null {
  if (Array.isArray(node)) {
    for (const item of node) {
      const err = walk(item, opts);
      if (err) return err;
    }
    return null;
  }
  if (!isObject(node)) return null;

  const rawType = node["type"];
  const type = typeof rawType === "string" ? rawType : null;
  const rawClass = node["class"];
  const klass = typeof rawClass === "string" ? rawClass : null;

  // Apply structural allowlist for known query-shape / from-table types.
  // Expression types (COLUMN_REF, CONSTANT, FUNCTION, COMPARISON, …) and
  // modifiers (ORDER_MODIFIER, LIMIT_MODIFIER, …) fall through to a
  // recursive descent; only `function_name` denylist is applied to them.
  if (type && isStructuralType(type) && !ALLOWED_STRUCTURAL_NODE_TYPES.has(type)) {
    return `Unsupported statement shape (AST node type "${type}" is not on the read-only allowlist).`;
  }

  if (type === "BASE_TABLE") {
    // Universal denies — platform-internal namespaces that no caller
    // (MCP, agent, or view_query) is ever allowed to reach directly.
    const universalErr = checkBaseTableUniversalDeny(node);
    if (universalErr) return universalErr;
    // MCP-only denies — system catalogs AND catalog/schema-qualified refs.
    if (opts.mode === "mcp") {
      const mcpErr = checkBaseTableMcpOnly(node, opts);
      if (mcpErr) return mcpErr;
    }
    // view_query — system catalogs only (catalog/schema refs allowed,
    // since view bodies legitimately attach to `catalog.schema.table`).
    if (opts.mode === "view_query") {
      const sysErr = checkBaseTableSystemNamespace(node);
      if (sysErr) return sysErr;
    }
  }

  if (type === "TABLE_FUNCTION") {
    const fnNode = node["function"];
    const fn = isObject(fnNode) ? fnNode : null;
    const fnName = lc(fn?.["function_name"]);
    if (!fnName) {
      return "Unsupported statement shape (table function with no resolvable name).";
    }
    if (!ALLOWED_TABLE_FUNCTIONS.has(fnName)) {
      return (
        `Reference to table function "${fnName}" is not allowed. ` +
        `Use semantic-model dataset names directly.`
      );
    }
  }

  if (type === "SHOW_REF") {
    const showType = lc(node["show_type"]);
    if (showType !== "describe" && showType !== "summarize") {
      return `Unsupported metadata operation (SHOW_REF show_type "${showType}").`;
    }
    // Walk the wrapped query so disallowed table functions / forbidden
    // schemas inside `DESCRIBE SELECT * FROM read_parquet(...)` are
    // still caught.
  }

  if (klass === "FUNCTION" || type === "FUNCTION") {
    const fnName = lc(node["function_name"]);
    if (fnName && isForbiddenScalarFunction(fnName)) {
      return `Reference to function "${fnName}" is not allowed.`;
    }
  }

  for (const value of Object.values(node)) {
    const err = walk(value, opts);
    if (err) return err;
  }
  return null;
}

/**
 * A `type` value is treated as "structural" when it is something we
 * recognize as a query-shape or from-table node. Expression `type`
 * values (e.g. `COMPARE_EQUAL`, `VALUE_CONSTANT`, `FUNCTION`,
 * `OPERATOR`, …) are not structural and fall through to the
 * recursive descent.
 *
 * Heuristic: any `_NODE`-suffixed name is structural (ensures unknown
 * future query nodes like a hypothetical `INSERT_NODE` fail closed),
 * plus the explicit from-table set above.
 */
function isStructuralType(type: string): boolean {
  return type.endsWith("_NODE") || ALLOWED_FROM_TABLE_TYPES.has(type);
}

/**
 * Universal BASE_TABLE denies — invoked in BOTH `mcp` and `agent`
 * modes. These cover platform-internal namespaces that no caller is
 * ever allowed to reach: the `_scope_*` schemas the MCP path
 * synthesises for model isolation, and the DuckDB metadata views
 * (`duckdb_columns`, `duckdb_tables`, `duckdb_secrets`, …) that would
 * leak host-catalog state regardless of which API surface called us.
 */
function checkBaseTableUniversalDeny(node: AstNode): string | null {
  const tableName = lc(node["table_name"]);
  const schemaName = lc(node["schema_name"]);
  const catalogName = lc(node["catalog_name"]);

  for (const candidate of [tableName, schemaName, catalogName]) {
    if (!candidate) continue;
    for (const prefix of FORBIDDEN_TABLE_NAME_PREFIXES) {
      if (candidate.startsWith(prefix)) {
        if (prefix === "_scope_") {
          return (
            `Direct reference to internal scoped schema "${candidate}" is not allowed. ` +
            `Use dataset names directly — they resolve automatically via search_path.`
          );
        }
        return (
          `Direct reference to DuckDB metadata "${candidate}" is not allowed. ` +
          `Use semantic-model dataset names directly.`
        );
      }
    }
  }

  return null;
}

/**
 * Reject BASE_TABLE references whose any name segment hits the
 * `FORBIDDEN_TABLE_NAMESPACES` set (`information_schema`, `pg_catalog`,
 * `sqlite_master`, `main`, `temp`, `system`). Shared by `mcp` and
 * `view_query` modes; the agent path explicitly skips this gate
 * because `information_schema` exploration is part of its workflow.
 */
function checkBaseTableSystemNamespace(node: AstNode): string | null {
  const tableName = lc(node["table_name"]);
  const schemaName = lc(node["schema_name"]);
  const catalogName = lc(node["catalog_name"]);

  for (const candidate of [tableName, schemaName, catalogName]) {
    if (!candidate) continue;
    if (FORBIDDEN_TABLE_NAMESPACES.has(candidate)) {
      return (
        `Reference to system catalog/schema "${candidate}" is not allowed. ` +
        `Use semantic-model dataset names directly.`
      );
    }
  }
  return null;
}

/**
 * MCP-only BASE_TABLE checks: forbids system catalogs/schemas
 * (`information_schema`, `pg_catalog`, `sqlite_master`, `main`,
 * `temp`, `system`) and any catalog/schema-qualified table reference.
 * The agent path skips this gate because schema exploration via
 * `information_schema.tables` and `catalog.schema.table` references
 * is part of the agent's documented workflow.
 */
function checkBaseTableMcpOnly(node: AstNode, opts: SqlAstValidationOpts): string | null {
  const sysErr = checkBaseTableSystemNamespace(node);
  if (sysErr) return sysErr;

  const schemaName = lc(node["schema_name"]);
  const catalogName = lc(node["catalog_name"]);

  if (catalogName) {
    // Phrasing differs depending on whether the catalog is one of
    // *this* project's connection slugs (more actionable error) or an
    // unrelated catalog name (still rejected).
    const slugMatch = (opts.catalogSlugs ?? []).some((s) => s.toLowerCase() === catalogName);
    if (slugMatch) {
      return (
        `Direct reference to catalog "${node["catalog_name"]}" is not allowed. ` +
        `Use dataset names directly (e.g. FROM orders) — they resolve automatically.`
      );
    }
    return (
      `Direct catalog references are not allowed in MCP execute_query. ` +
      `Use dataset names directly (e.g. FROM orders) — they resolve automatically via search_path.`
    );
  }

  if (schemaName) {
    return (
      `Schema-qualified table reference "${node["schema_name"]}.${node["table_name"]}" ` +
      `is not allowed. Use dataset names directly — they resolve automatically via search_path.`
    );
  }

  return null;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Validate the structure of a SQL query using DuckDB's own parser.
 *
 * Returns `null` on accept, or a human-readable rejection message on
 * deny. Failures are returned as data — never thrown — so callers can
 * forward the message into their existing `{ isError: true, text }`
 * response shape without changing control flow.
 *
 * Runs BEFORE the query is handed to the project's federated DuckDB
 * instance. This is the **sole** SQL-safety layer for `execute_query`
 * and the agent tools; there is no fallback validator and no kill-
 * switch. If `json_serialize_sql` ever fails to parse a query, the
 * query is rejected with a parser-error message. Operators who need
 * to bypass validation must roll back the deployment, not flip a
 * config flag.
 */
export async function validateSqlAst(
  sql: string,
  opts: SqlAstValidationOpts,
): Promise<string | null> {
  // Strip leading EXPLAIN (rejecting EXPLAIN ANALYZE, including comment-
  // evasion variants) before the parser, since `json_serialize_sql`
  // only accepts SELECT statements. DESCRIBE flows through unchanged —
  // it parses as a SHOW_REF inside a synthesized SELECT_NODE that the
  // walker handles via the SHOW_REF show_type allowlist.
  const peeled = peelExplain(sql);
  if (!peeled.ok) return peeled.error;
  const body = peeled.body.trimStart();

  let payload: SerializeSqlPayload;
  try {
    payload = await serializeSqlToAst(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return `Could not parse query for structural validation: ${msg}`;
  }

  if (payload.error) {
    const reason = payload.error_message ?? payload.error_type ?? "unknown parser error";
    return `Could not parse query: ${reason}`;
  }

  const statements = payload.statements ?? [];
  if (statements.length !== 1) {
    return `Multiple statements are not allowed (got ${statements.length}).`;
  }

  const root = statements[0]?.node;
  if (!root) {
    return "Could not parse query: empty statement.";
  }
  const rootType = typeof root.type === "string" ? root.type : "";
  if (!ALLOWED_QUERY_NODE_TYPES.has(rootType)) {
    return (
      `Unsupported statement shape: top-level node "${rootType}" is not a SELECT/CTE/UNION. ` +
      `Only read-only queries (SELECT / WITH / set operations) are allowed.`
    );
  }

  return walk(root, opts);
}
