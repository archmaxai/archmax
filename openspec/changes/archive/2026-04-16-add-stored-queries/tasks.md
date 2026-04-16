## 1. StoredQuery model
- [x] 1.1 Create `packages/core/src/models/StoredQuery.ts` with Mongoose schema (project, tokenId, modelName, sql, params, createdAt, TTL index)
- [x] 1.2 Export from `packages/core/src/models/index.ts`

## 2. Core service changes
- [x] 2.1 Add `storeQuery` helper in `mcp-tools.ts` that persists a StoredQuery and returns its ID
- [x] 2.2 Add `executeStoredQuery` function in `mcp-tools.ts` that loads a StoredQuery by ID, validates scope, and delegates to `executeScopedQuery`
- [x] 2.3 Update `EXECUTE_QUERY_DESCRIPTION` to mention storedQueryId and `execute_stored_query`

## 3. MCP tool registration
- [x] 3.1 Update `execute_query` registration in `archmax-server.ts`: add `store` param to input schema, persist when `store=true`, include `storedQueryId` in response JSON
- [x] 3.2 Register new `execute_stored_query` tool in `archmax-server.ts` with `storedQueryId` and optional `params` input schema

## 4. Tests
- [x] 4.1 Unit tests for `storeQuery` and `executeStoredQuery` helpers
- [x] 4.2 E2E tests for stored query flow (store, re-run, param override, invalid ID)

## 5. Documentation
- [x] 5.1 Update `apps/docs` MCP tools reference to document `store` param and `execute_stored_query` tool
