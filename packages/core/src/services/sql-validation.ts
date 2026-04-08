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
 * 2. No direct catalog references — only _scope_<modelName>.* VIEWs allowed
 * 3. No information_schema access
 * 4. No cross-model scope access (_scope_<otherModel>.* rejected)
 */
export function validateScopedSQL(sql: string, catalogSlugs: string[], modelName: string): string | null {
  const readOnlyError = validateReadOnlySQL(sql);
  if (readOnlyError) return readOnlyError;

  for (const catalog of catalogSlugs) {
    const escaped = catalog.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escaped}\\.`, "i");
    if (pattern.test(sql)) {
      return (
        `Direct reference to catalog "${catalog}" is not allowed. ` +
        `Use _scope_${modelName}.* VIEW names instead (e.g. _scope_${modelName}."dataset").`
      );
    }
  }

  if (/\binformation_schema\b/i.test(sql)) {
    return `Querying information_schema is not allowed. Use the available _scope_${modelName}.* VIEWs.`;
  }

  const escapedModel = modelName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const crossScopePattern = new RegExp(`\\b_scope_(?!${escapedModel}\\b)\\w+\\.`, "i");
  if (crossScopePattern.test(sql)) {
    return `Cross-model scope access is not allowed. Only _scope_${modelName}.* VIEWs are accessible for this query.`;
  }

  return null;
}
