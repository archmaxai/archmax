# Change: Per-model scoped VIEW schemas

## Why

The current `_scope` schema is shared across all `execute_query` calls within a project's DuckDB instance. Views are recreated on every call, and concurrent calls for different models can overwrite each other's views. Moving to per-model schemas (`_scope_<modelName>`) eliminates the race condition and allows views to be created once and reused.

## What Changes

- Views move from a shared `_scope` schema to per-model schemas named `_scope_<modelName>` (e.g., `_scope_ecommerce`)
- Views are created lazily on first `execute_query` for a model and cached until the model changes (publish or file modification)
- SQL validation restricts queries to only the `_scope_<modelName>.*` tables for the model specified in the `execute_query` call
- Agent SQL syntax changes from `_scope."dataset"` to `_scope_<modelName>."dataset"`
- The `get_semantic_model` overview updates VIEW name annotations to reflect the new schema naming

## Impact

- Affected specs: `mcp-server` (Scoped DuckDB VIEWs, Execute Query Tool, SQL Validation)
- Affected code: `packages/core/src/services/duckdb.ts`, `packages/core/src/services/sql-validation.ts`, `apps/api/src/mcp/semlayer-server.ts`
