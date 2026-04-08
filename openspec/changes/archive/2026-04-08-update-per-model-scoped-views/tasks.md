## 1. Core: Per-model schema creation and caching

- [x] 1.1 Update `createScopedViews` in `packages/core/src/services/duckdb.ts` to accept `modelName` and create views under `_scope_<modelName>` schema instead of `_scope`
- [x] 1.2 Add content-hash cache (`Map<string, { hash: string }>`) keyed by `projectId:modelName` to skip view recreation when model hasn't changed
- [x] 1.3 Update `scopedViewName` to accept `modelName` and return `_scope_<modelName>."<datasetName>"`
- [x] 1.4 Add `invalidateScopedViews(projectId, modelName?)` function to clear cache entries (called on publish or model change)

## 2. SQL validation: Per-model scope enforcement

- [x] 2.1 Update `validateScopedSQL` in `packages/core/src/services/sql-validation.ts` to accept `modelName` parameter
- [x] 2.2 Add regex check rejecting `_scope_<otherModel>.*` references (any `_scope_` prefix that doesn't match the requested model)
- [x] 2.3 Update existing tests and add new tests for cross-model scope rejection
- [x] 2.4 Update error messages to reference `_scope_<modelName>.*` naming convention

## 3. MCP server: Wire up per-model scoping

- [x] 3.1 Update `execute_query` handler in `apps/api/src/mcp/semlayer-server.ts` to pass `modelName` to `createScopedViews` and `validateScopedSQL`
- [x] 3.2 Update `execute_query` tool description to document `_scope_<modelName>."<datasetName>"` convention
- [x] 3.3 Update `get_semantic_model` digest to annotate datasets with `_scope_<modelName>."<datasetName>"` VIEW names
- [x] 3.4 Compute content hash from model YAML and pass to view creation for cache comparison

## 4. Cleanup

- [x] 4.1 Remove old `_scope` schema references from codebase (error messages, comments, prompts)
- [x] 4.2 Wire `invalidateScopedViews` into publish route to clear cache on re-publish
