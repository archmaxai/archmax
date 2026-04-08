## 1. Project Model

- [x] 1.1 Add `mcpPageSize` field to `IProject` interface and `ProjectSchema` in `packages/core/src/models/Project.ts` (Number, optional, default `50`, min `10`, max `200`)

## 2. API

- [x] 2.1 Add `mcpPageSize` to `createSchema` and `updateSchema` in `apps/api/src/routes/projects.ts`
- [x] 2.2 Add `mcpPageSize` to `McpToolContext` interface in `apps/api/src/mcp/semlayer-server.ts`
- [x] 2.3 Pass `project.mcpPageSize` (or default `50`) into `McpToolContext` in `apps/api/src/mcp/semlayer-route.ts`
- [x] 2.4 Pass `ctx.mcpPageSize` to `SemanticModelDigest.overview()` and `.dataset()` calls in `semlayer-server.ts`
- [x] 2.5 Update MCP tool descriptions to say "configurable items per page" instead of hardcoded "50"

## 3. Digest Service

- [x] 3.1 Add `itemsPerPage` parameter to `SemanticModelDigest.overview()` and `.dataset()` methods
- [x] 3.2 Replace hardcoded `ITEMS_PER_PAGE` constant usage with the parameter (keep constant as default fallback)
- [x] 3.3 Update `paginate()` helper to accept `itemsPerPage` parameter
- [x] 3.4 Update tests in `semantic-model-digest.test.ts` to cover custom page sizes

## 4. Frontend

- [x] 4.1 Add MCP page size number input to the project settings page (`settings.tsx`)
- [x] 4.2 Wire the input to the project update mutation with `mcpPageSize` field
