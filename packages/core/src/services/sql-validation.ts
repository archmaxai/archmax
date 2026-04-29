// SHOW and PRAGMA are intentionally excluded: the public MCP `execute_query`
// contract is scoped to semantic-model views, and DuckDB metadata reads must
// not be exposed through this surface. Internal callers that need metadata
// (e.g. data-browser routes) execute those statements directly without going
// through this validator.
const ALLOWED_FIRST_KEYWORD = /^\s*(SELECT|WITH|EXPLAIN|DESCRIBE)\b/i;
const SEMICOLON_FOLLOWED_BY_STATEMENT = /;\s*\S/;

// EXPLAIN ANALYZE in DuckDB *executes* the wrapped statement, so unrestricted
// EXPLAIN is not actually read-only — `EXPLAIN ANALYZE INSERT/CREATE/...`
// would mutate. Only allow `EXPLAIN SELECT ...` and `EXPLAIN WITH ...`.
const EXPLAIN_PREFIX = /^\s*EXPLAIN\b/i;
const EXPLAIN_ANALYZE_PREFIX = /^\s*EXPLAIN\s+ANALYZE\b/i;
const EXPLAIN_FOLLOWED_BY_READ = /^\s*EXPLAIN\s+(SELECT|WITH)\b/i;

// DuckDB metadata table functions and system schemas/catalogs that bypass the
// scoped semantic-model views. These are reachable from a plain SELECT and so
// are not caught by the first-keyword allowlist; deny them explicitly. The
// dynamic SQL-functions matcher catches `duckdb_tables()`, `duckdb_columns()`,
// `duckdb_secrets()`, `duckdb_settings()`, etc. — anything in that family.
const FORBIDDEN_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bduckdb_[a-z_]+\s*\(/i, label: "DuckDB metadata functions (duckdb_*)" },
  { re: /\bpg_catalog\b/i, label: "pg_catalog" },
  { re: /\bsqlite_master\b/i, label: "sqlite_master" },
  { re: /\b(main|temp|system)\.[a-z_]/i, label: "system schemas (main/temp/system)" },
  // External readers. `enable_external_access=false` blocks these in the
  // default DuckDB sandbox, but Iceberg-enabled projects keep external
  // access on, so we deny at the validator layer for defence-in-depth.
  { re: /\bread_(csv|csv_auto|parquet|parquet_auto|json|json_auto|ndjson|blob|text)\s*\(/i, label: "external file readers (read_*)" },
];

/** Strip leading single-line (`--`) and block SQL comments. */
function stripLeadingComments(sql: string): string {
  return sql.replace(/^(\s*(--[^\n]*\n|\/\*[\s\S]*?\*\/))*\s*/, "");
}

export function validateReadOnlySQL(sql: string): string | null {
  if (SEMICOLON_FOLLOWED_BY_STATEMENT.test(sql)) {
    return "Multiple statements are not allowed.";
  }
  const stripped = stripLeadingComments(sql);
  if (!ALLOWED_FIRST_KEYWORD.test(stripped)) {
    return "Only SELECT / WITH / EXPLAIN / DESCRIBE queries are allowed.";
  }

  if (EXPLAIN_PREFIX.test(stripped)) {
    if (EXPLAIN_ANALYZE_PREFIX.test(stripped)) {
      return "EXPLAIN ANALYZE is not allowed (it executes the wrapped statement).";
    }
    if (!EXPLAIN_FOLLOWED_BY_READ.test(stripped)) {
      return "EXPLAIN is only allowed wrapping SELECT or WITH queries.";
    }
  }

  return null;
}

/**
 * Validates SQL for scoped MCP queries. Checks:
 * 1. Read-only (SELECT/WITH/EXPLAIN/DESCRIBE only, no multi-statement,
 *    no EXPLAIN ANALYZE)
 * 2. No direct catalog references — only bare dataset names allowed
 *    (resolved via search_path)
 * 3. No DuckDB metadata namespaces or table functions (information_schema,
 *    duckdb_*, pg_catalog, sqlite_master, main./temp./system. schemas,
 *    read_csv/parquet/json/blob)
 * 4. No explicit _scope_ schema references — search_path handles resolution
 */
export function validateScopedSQL(sql: string, catalogSlugs: string[]): string | null {
  const readOnlyError = validateReadOnlySQL(sql);
  if (readOnlyError) return readOnlyError;

  for (const catalog of catalogSlugs) {
    const escaped = catalog.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\.`, "i");
    if (pattern.test(sql)) {
      return (
        `Direct reference to catalog "${catalog}" is not allowed. ` +
        `Use dataset names directly (e.g. FROM orders) — they resolve automatically.`
      );
    }
  }

  if (/\binformation_schema\b/i.test(sql)) {
    return "Querying information_schema is not allowed. Use dataset names directly.";
  }

  for (const { re, label } of FORBIDDEN_PATTERNS) {
    if (re.test(sql)) {
      return `Reference to ${label} is not allowed. Use semantic-model dataset names directly.`;
    }
  }

  if (/\b_scope_\w+\./i.test(sql)) {
    return "Do not use _scope_ prefixes. Use dataset names directly (e.g. FROM orders) — they resolve automatically via search_path.";
  }

  return null;
}
