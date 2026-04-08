# Change: Add scoped execute_query MCP tool and remove list_connections

## Why
MCP tokens scope access to specific semantic models, but today the MCP server cannot execute queries and still exposes raw connection metadata via `list_connections`. Adding a secure `execute_query` tool lets AI agents run DuckDB queries that are automatically scoped to only the fields defined in a single semantic model at a time, while removing `list_connections` eliminates unnecessary data leakage.

## What Changes
- **BREAKING**: Remove `list_connections` tool from MCP-exposed tools
- Add `execute_query` MCP tool that runs read-only SQL against the project's DuckDB instance
- `execute_query` requires a `modelName` parameter — scopes each call to a single semantic model
- Scope query access using DuckDB VIEWs generated from the selected model's datasets — only fields defined in that model are queryable
- VIEW naming convention: `_scope."<datasetName>"` — directly derivable from dataset names shown in `get_semantic_model` / `get_dataset`
- Enforce read-only mode globally for all MCP queries (SQL keyword validation + `READ_ONLY` ATTACH)
- Tool description explains the convention; no redundant VIEW listing (agents discover datasets via semantic model tools)
- Annotate `get_semantic_model` overview with VIEW names per dataset
- Harden the DuckDB connection for MCP queries (`enable_external_access = false`, `lock_configuration = true`, resource limits)
- Validate SQL to reject references to raw attached catalogs (defense-in-depth beyond VIEWs)
- Add explicit read-only constraint to the semantic model agent's system prompt

## Impact
- Affected specs: `mcp-server`, `semantic-model-agent`, `project-management`, `mcp-token-management`
- Affected code:
  - `apps/api/src/mcp/semlayer-server.ts` — remove list_connections, add execute_query with modelName param and VIEW scoping
  - `packages/core/src/services/duckdb.ts` — add helpers for VIEW creation (single model) and instance hardening
  - `packages/core/src/services/semantic-model-digest.ts` — annotate dataset rows with VIEW names
  - `apps/api/src/mcp/semlayer-route.ts` — pass token permission through to tool context
  - `packages/core/prompts/semantic-model-agent.md` — reinforce read-only instructions
  - `packages/core/src/services/agent.ts` — update system prompt builder, always enforce read-only
