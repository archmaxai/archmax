# Change: Add stored query support to MCP tools

## Why
AI agents frequently need to re-run the same query with different parameters (e.g. pagination, filtering variations, drill-downs). Today they must resend the full SQL text each time, wasting tokens and adding latency. Stored queries let agents reference a previous query by ID and optionally override parameters, enabling efficient multi-step analytical workflows.

## What Changes
- `execute_query` gains a `store` boolean parameter (default `true`) and returns a `storedQueryId` in its response when storing is enabled
- `execute_query` tool description is updated to explain the stored query ID and how to use it with `execute_stored_query`
- New `execute_stored_query` tool that re-executes a previously stored query by ID, with optional parameter overrides
- New `StoredQuery` Mongoose model to persist query text, parameters, model name, and project/token association
- Stored queries are project-scoped and auto-expire (TTL) to prevent unbounded growth

## Impact
- Affected specs: `mcp-server`
- Affected code:
  - `packages/core/src/models/StoredQuery.ts` (new model)
  - `packages/core/src/models/index.ts` (re-export)
  - `packages/core/src/services/mcp-tools.ts` (modify `executeScopedQuery` return, add stored-query helpers)
  - `apps/api/src/mcp/archmax-server.ts` (modify `execute_query` registration, add `execute_stored_query` tool)
