import { DuckDBInstance } from "@duckdb/node-api";
import { withQueryTimeout } from "./duckdb";

/**
 * Structural SQL validator built on DuckDB's own parser via
 * `json_serialize_sql`. Layered AFTER the lexical pre-filter
 * (`validateReadOnlySQL` / `validateScopedSQL`) and BEFORE the query is
 * handed to the project's federated DuckDB instance.
 *
 * Rationale (see `openspec/changes/add-structural-sql-safety/design.md`):
 * the regex layer cannot tokenize SQL, which means quoting variants
 * (`"information_schema"."tables"`, `U&"\006D\0061\0069\006E".x`,
 * dollar-quoted statement separators, mid-token comments inside
 * `EXPLAIN ... ANALYZE`, etc.) can systematically fool it. By using
 * the *same* parser DuckDB will execute against, the validator's view
 * of the query and the engine's view cannot disagree.
 *
 * The parser instance is dedicated to validation: no extensions, no
 * attached catalogs, `enable_external_access=false`. `json_serialize_sql`
 * is parse-only — it never invokes DuckDB's binder — so the parsing
 * instance does not need any of the project's source tables, scoped
 * views, or attached catalogs to validate a query.
 */

/** Validation modes. */
export type SqlAstValidationMode = "mcp" | "agent";

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
    // Defence-in-depth: even though the parser instance has no extensions
    // and no attached catalogs, lock the parsing connection down further.
    try { await db.run("SET enable_external_access = false"); } catch { /* already set */ }

    const prepared = await db.prepare(
      "SELECT json_serialize_sql(CAST(? AS VARCHAR), skip_default := true, format := false) AS ast",
    );
    prepared.bindVarchar(1, sql);
    const result = await withQueryTimeout(db, () => prepared.run(), PARSE_TIMEOUT_MS);
    const rows: unknown[] = [];
    for await (const chunk of result) {
      for (const row of chunk.getRows()) rows.push(row);
    }
    const json = rows[0]?.[0 as keyof typeof rows[0]];
    if (typeof json !== "string") {
      throw new Error("json_serialize_sql returned no row");
    }
    return JSON.parse(json) as SerializeSqlPayload;
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

/**
 * Detect leading EXPLAIN (with optional intervening comments). Returns
 * the body that should be passed to the parser, or an error if the
 * EXPLAIN is followed by ANALYZE — including the comment-evasion
 * variant (`EXPLAIN <comment> ANALYZE`) that the lexical pre-filter's
 * regex misses because it scans byte-form text.
 */
function peelExplain(sql: string): { body: string; error?: string } {
  const stripped = stripLeadingTrivia(sql);
  const m = /^EXPLAIN\b/i.exec(stripped);
  if (!m) return { body: sql };
  const afterExplain = stripLeadingTrivia(stripped.slice(m[0].length));
  if (/^ANALYZE\b/i.test(afterExplain)) {
    return {
      body: sql,
      error:
        "EXPLAIN ANALYZE is not allowed (it executes the wrapped statement); " +
        "this includes comment-evasion variants such as `EXPLAIN /* … */ ANALYZE`.",
    };
  }
  return { body: afterExplain };
}

// ── AST allowlists / denylists ───────────────────────────────────────

/**
 * Top-level statement-shape node types accepted by the validator.
 * A query whose top-level node is anything else (INSERT_NODE,
 * UPDATE_NODE, COPY_NODE, …) — even though `json_serialize_sql`
 * already rejects those with "Only SELECT statements can be
 * serialized to json!" — is rejected on the AST layer too.
 */
const ALLOWED_TOP_LEVEL_NODE_TYPES = new Set([
  "SELECT_NODE",
  "SET_OPERATION_NODE",
  "RECURSIVE_CTE_NODE",
]);

/**
 * Structural node types permitted anywhere inside the tree. Anything
 * else with a `type` field that we recognize as structural causes
 * rejection (fail-closed default for new DuckDB AST shapes).
 *
 * Expression-level `class`/`type` values (COLUMN_REF, FUNCTION,
 * CONSTANT, COMPARISON, OPERATOR, …) are NOT enumerated here — the
 * walker visits them only to dig for nested structural nodes and to
 * apply the scalar-function denylist; otherwise expression leaves are
 * unrestricted because the allowed-statement-type rule already
 * prevents side effects.
 */
const ALLOWED_STRUCTURAL_NODE_TYPES = new Set([
  // Query-shape nodes
  "SELECT_NODE",
  "SET_OPERATION_NODE",
  "RECURSIVE_CTE_NODE",
  // From-table nodes
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
 * dollar-quoted, …) cannot evade the check. The `_scope_*` rule is
 * a prefix match — any schema beginning with `_scope_` (regardless of
 * case or quoting) is rejected.
 */
const FORBIDDEN_TABLE_NAMESPACES = new Set([
  "information_schema",
  "pg_catalog",
  "sqlite_master",
  "main",
  "temp",
  "system",
]);

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

  const type = typeof node["type"] === "string" ? (node["type"] as string) : null;
  const klass = typeof node["class"] === "string" ? (node["class"] as string) : null;

  // Apply structural allowlist for known query-shape / from-table types.
  // Expression types (COLUMN_REF, CONSTANT, FUNCTION, COMPARISON, …) and
  // modifiers (ORDER_MODIFIER, LIMIT_MODIFIER, …) fall through to a
  // recursive descent; only `function_name` denylist is applied to them.
  if (type && isStructuralType(type) && !ALLOWED_STRUCTURAL_NODE_TYPES.has(type)) {
    return `Unsupported statement shape (AST node type "${type}" is not on the read-only allowlist).`;
  }

  if (type === "BASE_TABLE" && opts.mode === "mcp") {
    // BASE_TABLE checks (system-catalog, `_scope_*`, catalog/schema-
    // qualified) are MCP-only. The agent path legitimately reads
    // information_schema for schema exploration and uses
    // `catalog.schema.table` references for attached connections (see
    // openspec/changes/add-structural-sql-safety/specs/semantic-model-
    // agent/spec.md "Agent explores database schema" /
    // "Catalog references remain allowed in agent path"); only the
    // table-function and scalar-function rules apply there.
    const err = checkBaseTable(node, opts);
    if (err) return err;
  }

  if (type === "TABLE_FUNCTION") {
    const fn = isObject(node["function"]) ? (node["function"] as AstNode) : null;
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
 */
function isStructuralType(type: string): boolean {
  // Heuristic: structural query nodes end in `_NODE`; from-table nodes
  // are an explicit small set; everything else is treated as an
  // expression/modifier and skipped by this gate.
  if (type.endsWith("_NODE")) return true;
  return (
    type === "BASE_TABLE" ||
    type === "TABLE_FUNCTION" ||
    type === "JOIN" ||
    type === "SUBQUERY" ||
    type === "EMPTY" ||
    type === "EXPRESSION_LIST" ||
    type === "PIVOT" ||
    type === "SHOW_REF"
  );
}

function checkBaseTable(node: AstNode, opts: SqlAstValidationOpts): string | null {
  const tableName = lc(node["table_name"]);
  const schemaName = lc(node["schema_name"]);
  const catalogName = lc(node["catalog_name"]);

  // The system-catalog / `_scope_*` rule applies in BOTH modes — the
  // agent path legitimately uses fully-qualified `catalog.schema.table`
  // references for *user* schemas (e.g. `Shopify.public.orders`) but
  // never for DuckDB / Postgres / SQLite system schemas, which would
  // bypass the semantic layer's read-only contract.
  for (const candidate of [tableName, schemaName, catalogName]) {
    if (!candidate) continue;
    if (FORBIDDEN_TABLE_NAMESPACES.has(candidate)) {
      return (
        `Reference to system catalog/schema "${candidate}" is not allowed. ` +
        `Use semantic-model dataset names directly.`
      );
    }
    if (candidate.startsWith("_scope_")) {
      return (
        `Direct reference to internal scoped schema "${candidate}" is not allowed. ` +
        `Use dataset names directly — they resolve automatically via search_path.`
      );
    }
  }

  if (opts.mode === "mcp") {
    if (catalogName) {
      const slugMatch = (opts.catalogSlugs ?? []).some((s) => s.toLowerCase() === catalogName);
      // Reject any catalog reference in MCP mode — only bare dataset
      // names are valid (resolved via `search_path = _scope_<model>`).
      // Phrasing differs depending on whether the catalog is one of
      // *this* project's connection slugs (more actionable error) or
      // an unrelated catalog name (still rejected).
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
      // Bare-name rule: a non-empty schema is always rejected in MCP
      // mode (system-catalog check above already rejected the
      // dangerous ones; this rejects user schemas too — `public.orders`,
      // `dbo.foo`, etc.).
      return (
        `Schema-qualified table reference "${node["schema_name"]}.${node["table_name"]}" ` +
        `is not allowed. Use dataset names directly — they resolve automatically via search_path.`
      );
    }
  }

  return null;
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Read the kill-switch flag once at module load. Defaults to `true`
 * (validator on) if unset or any value other than the literal string
 * `"false"`. The flag exists only to bypass the structural validator
 * if a DuckDB upgrade ever breaks `json_serialize_sql`; the lexical
 * pre-filter, connection hardening, READ_ONLY ATTACH, and search_path
 * scoping are unaffected.
 */
const SQL_VALIDATION_AST_ENABLED = process.env.SQL_VALIDATION_AST !== "false";

export function isSqlAstValidationEnabled(): boolean {
  return SQL_VALIDATION_AST_ENABLED;
}

/**
 * Validate the structure of a SQL query using DuckDB's own parser.
 *
 * Returns `null` on accept, or a human-readable rejection message on
 * deny. Failures are returned as data — never thrown — so callers can
 * forward the message into their existing `{ isError: true, text }`
 * response shape without changing control flow.
 *
 * Layered AFTER the lexical pre-filter (`validateReadOnlySQL` /
 * `validateScopedSQL`) and BEFORE the query is handed to the
 * project's federated DuckDB instance. The lexical pre-filter handles
 * obvious junk on the deny path at zero parse cost; this validator
 * pays for one DuckDB parse on the accept path (~sub-millisecond).
 */
export async function validateSqlAst(
  sql: string,
  opts: SqlAstValidationOpts,
): Promise<string | null> {
  if (!SQL_VALIDATION_AST_ENABLED) return null;

  // Decompose EXPLAIN / DESCRIBE prefixes so the body is what we hand
  // to `json_serialize_sql` (which only serializes SELECT statements).
  // EXPLAIN ANALYZE — including comment-evasion variants — is rejected
  // here because the lexical regex's `^\s*EXPLAIN\s+ANALYZE\b` does
  // not see past mid-token block comments.
  const explainPeel = peelExplain(sql);
  if (explainPeel.error) return explainPeel.error;
  let body = explainPeel.body;

  // DESCRIBE wraps its argument in a SHOW_REF inside a synthesized
  // SELECT_NODE; `json_serialize_sql` accepts that shape, so we let
  // DESCRIBE flow through to the parser unchanged. The walker rejects
  // any non-DESCRIBE/SUMMARIZE SHOW_REF show_type and walks the
  // wrapped query so disallowed table functions inside
  // `DESCRIBE SELECT * FROM read_parquet(...)` are still caught.
  body = body.trimStart();

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

  const root = statements[0]!.node;
  const rootType = typeof root.type === "string" ? root.type : "";
  if (!ALLOWED_TOP_LEVEL_NODE_TYPES.has(rootType)) {
    return (
      `Unsupported statement shape: top-level node "${rootType}" is not a SELECT/CTE/UNION. ` +
      `Only read-only queries (SELECT / WITH / set operations) are allowed.`
    );
  }

  return walk(root, opts);
}
