## 1. Core — get_datasets schema change

- [x] 1.1 Update `getDatasetFields` in `packages/core/src/services/mcp-tools.ts` to accept `datasets: { name: string; page?: number }[]` instead of `datasetNames: string[]` + flat `page`
- [x] 1.2 Update `get_datasets` Zod schema in `apps/api/src/mcp/archmax-server.ts` to use `datasets: z.array(z.object({ name: z.string(), page: z.number().optional() })).min(1).max(10)`
- [x] 1.3 Update `get_datasets` tool in `packages/core/src/services/playground-agent.ts` to match new schema
- [x] 1.4 Update unit tests for `getDatasetFields` in `packages/core/src/services/mcp-tools.test.ts`

## 2. Core — rename suggest_improvement → request_improvement

- [x] 2.1 Rename tool registration from `"suggest_improvement"` to `"request_improvement"` in `apps/api/src/mcp/archmax-server.ts`
- [x] 2.2 Update tool description to say "Submit an improvement request" instead of "Submit an improvement suggestion"
- [x] 2.3 Rename tool in `packages/core/src/services/playground-agent.ts`

## 3. Frontend — rename accordion title

- [x] 3.1 Change accordion title from `Improvements` to `Improvement Requests` in `apps/frontend/src/routes/_auth/$projectId/models.tsx`
- [x] 3.2 Change empty-state text from "Improvements are suggested by MCP clients" to "Improvement requests are submitted by MCP clients"

## 4. Documentation

- [x] 4.1 Update `apps/docs/src/content/docs/reference/mcp-tools.mdx` — fix `get_datasets` parameters and rename `suggest_improvement` → `request_improvement`
- [x] 4.2 Update `apps/docs/src/content/docs/guides/mcp-integration.mdx` — tool table
- [x] 4.3 Update `README.md` — MCP tools table
- [x] 4.4 Update `openspec/project.md` — MCP Server domain context listing

## 5. Verification

- [x] 5.1 Run `pnpm typecheck` to verify no type errors
- [x] 5.2 Run `pnpm lint` to verify build passes
