## 1. Remove list_connections from MCP tools
- [x] 1.1 Delete the `list_connections` tool registration from `semlayer-server.ts`

## 2. Add scoped VIEW creation infrastructure
- [x] 2.1 Add a `createScopedViews` function in `packages/core/src/services/duckdb.ts` that takes a DuckDB instance and a single semantic model, and creates `_scope."<datasetName>"` VIEWs with only the fields from the model definitions
- [x] 2.2 Add a `getAttachedCatalogSlugs` helper that returns the list of attached catalog slugs for a project's connections
- [x] 2.3 Add a `hardenConnection` helper that applies `enable_external_access = false`, `lock_configuration = true`, and resource limits to a DuckDB connection
- [x] 2.4 Simplify `scopedViewName` to take only `datasetName` (no model prefix): `_scope."<datasetName>"`

## 3. Implement execute_query MCP tool
- [x] 3.1 Add `execute_query` tool registration in `semlayer-server.ts` with input schema (modelName: string, sql: string, params: array) and MCP tool annotations
- [x] 3.2 Implement the tool handler: validate modelName scope access, read the single model from disk, call `createScopedViews`, validate SQL (read-only + catalog reference check), open hardened connection, prepare + bind + execute, return results (capped at 1000 rows, 30s timeout)
- [x] 3.3 Static tool description explaining the `_scope."<datasetName>"` naming convention (no dynamic VIEW enumeration)
- [x] 3.4 Log execute_query calls via McpCallLog (SQL query + row count, not full result data)

## 4. VIEW name discoverability in model overview
- [x] 4.1 Update `SemanticModelDigest.overview` to annotate each dataset row with its `_scope."<datasetName>"` VIEW name

## 5. SQL validation for MCP queries
- [x] 5.1 Extract `validateReadOnlySQL` from `agent.ts` into a shared utility in `packages/core/src/services/sql-validation.ts`
- [x] 5.2 Add `validateScopedSQL` function that checks SQL text does not reference raw catalog names (case-insensitive word-boundary match against attached catalog slugs) + blocks information_schema
- [x] 5.3 Write unit tests for `validateScopedSQL` covering: valid _scope references, rejected raw catalog references, edge cases

## 6. Semantic model agent read-only reinforcement
- [x] 6.1 Add explicit read-only constraint language to `packages/core/prompts/semantic-model-agent.md`
- [x] 6.2 Update `buildConnectionContext` in `agent.ts` to include read-only notice
- [x] 6.3 Make `validateReadOnlySQL` always applied in the agent's `executeQuery` tool

## 7. Testing
- [x] 7.1 Write tests for `createScopedViews`: verify VIEWs created with correct columns, scoped fields only, computed expressions, skip empty datasets, model switching replaces VIEWs
- [x] 7.2 Write tests for `hardenConnection`: verify external access disabled and configuration locked
- [x] 7.3 Write tests for `scopedViewName`: verify simplified `_scope."<datasetName>"` format
