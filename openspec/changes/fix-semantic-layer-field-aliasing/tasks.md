## 1. Investigate and fix VIEW aliasing

- [x] 1.1 Reproduce the aliasing failure: create a DuckDB instance with a Postgres scanner attachment, define a field where `name != expression` (e.g., physical `personid` → logical `person_id`), and confirm the VIEW column is not queryable
- [x] 1.2 Identify root cause (quoting, case sensitivity, scanner-specific behavior) and fix `createScopedViews` in `packages/core/src/services/duckdb.ts`
- [x] 1.3 Add integration test in `packages/core/src/services/duckdb.test.ts` covering: simple aliasing (`personid` → `person_id`), computed expression aliasing (`a || b` → `full_name`), search_path query resolution, and passthrough (`id` → `id`)
- [x] 1.4 Add unit test in `packages/core/src/services/duckdb.test.ts` for `computeModelHash` to verify aliased fields affect the cache key

## 2. Update semantic model builder prompt

- [x] 2.1 Add field expression validation step between column inspection (4a) and YAML writing (4e): run `SELECT <expression> FROM <source> LIMIT 0` per field; fix or drop fields that fail
- [x] 2.2 Add naming rules section explaining: the view layer's aliasing mechanism (`expr AS "name"`), that the builder MAY rename fields (e.g., `personid` → `person_id`) and the expression provides the mapping, and that renaming is the point of a semantic layer
- [x] 2.3 Update metric guidance: change "dataset_name.column_name" to "dataset_name.field_name" with explicit note that `field_name` is the logical `name` from the field definition, and that metric expressions are shown verbatim to MCP consumer agents
- [x] 2.4 Add relationship column guidance: `from_columns`/`to_columns` MUST use logical field `name` values, not physical column names
- [x] 2.5 Update validated query guidance: column references in stored queries MUST use logical field names, not physical column names; the builder must rewrite columns when converting from validation SQL (run against physical tables) to stored SQL (using logical names)

## 3. Validated query column rewriting in digest (stretch)

- [x] 3.1 Build a column-level rewrite map from `field.expression → field.name` per dataset in `semantic-model-digest.ts`
- [x] 3.2 Apply column rewriting in `rewriteQueryColumns` to validated query SQL (chained after `rewriteQuerySources`)
- [x] 3.3 Add unit tests for column rewriting edge cases (word boundary matching, multiple replacements, no false positives on partial matches, computed expressions excluded)
