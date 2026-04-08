## 1. MCP Server

- [x] 1.1 Remove `list_documents` tool registration from `apps/api/src/mcp/semlayer-server.ts`
- [x] 1.2 Remove `read_document` tool registration from `apps/api/src/mcp/semlayer-server.ts`
- [x] 1.3 Remove `DocumentFileService` import and `getDocService` helper (no longer used in MCP server)

## 2. Validation

- [x] 2.1 Verify the MCP server starts without errors
- [x] 2.2 Verify remaining MCP tools (`list_semantic_models`, `get_semantic_model`, `get_datasets`, `execute_query`) still work
