const ALLOWED_FIRST_KEYWORD = /^\s*(SELECT|WITH|EXPLAIN|DESCRIBE|SHOW|PRAGMA)\b/i;
const SEMICOLON_FOLLOWED_BY_STATEMENT = /;\s*\S/;

export function validateReadOnlySQL(sql: string): string | null {
  if (SEMICOLON_FOLLOWED_BY_STATEMENT.test(sql)) {
    return "Multiple statements are not allowed.";
  }
  if (!ALLOWED_FIRST_KEYWORD.test(sql)) {
    return "Only SELECT / WITH / EXPLAIN / DESCRIBE queries are allowed.";
  }
  return null;
}

/**
 * Validates SQL for scoped MCP queries. Checks:
 * 1. Read-only (SELECT/WITH/EXPLAIN/DESCRIBE only, no multi-statement)
 * 2. No direct catalog references — only bare dataset names allowed (resolved via search_path)
 * 3. No information_schema access
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

  if (/\b_scope_\w+\./i.test(sql)) {
    return "Do not use _scope_ prefixes. Use dataset names directly (e.g. FROM orders) — they resolve automatically via search_path.";
  }

  return null;
}
