# Change: Fix semantic layer field aliasing and prevent physical name leaks

## Why

When a semantic model field's logical `name` differs from its physical `expression` (e.g., `name: "person_id"` with `expression: "personid"`), `createScopedViews` generates `SELECT personid AS "person_id" FROM source`. This aliasing silently fails in some DuckDB configurations (particularly with the Postgres scanner), dropping the field from the VIEW. The digest and error hints still advertise the field, causing LLM agents to reference columns that don't exist. Additionally, the semantic model builder prompt has no guidance on field expression validation, the name/expression relationship, or the use of logical names in metrics and relationships.

## What Changes

- **Fix VIEW aliasing** — investigate and fix why `expr AS "name"` fails in `createScopedViews` when using DuckDB foreign data scanners; add integration test coverage for the aliasing path
- **Builder field validation** — update the semantic model agent prompt to validate each field expression before writing YAML, explain the name/expression aliasing mechanism, and clarify that metrics and relationships must use logical field names
- **Validated query column rewriting** — update the digest's `rewriteQuerySources` to also rewrite physical column names to logical field names in validated query SQL (lower priority; builder prompt changes reduce the likelihood of physical names appearing)

## Impact

- Affected specs: `mcp-server` (Scoped DuckDB VIEWs), `semantic-model-agent` (new requirement)
- Affected code:
  - `packages/core/src/services/duckdb.ts` — `createScopedViews` aliasing fix + tests
  - `packages/core/prompts/semantic-model-agent.md` — field validation step, naming rules
  - `packages/core/src/services/semantic-model-digest.ts` — column rewriting in validated queries (stretch)
