# Change: Add per-project MCP page size configuration

## Why

The MCP digest pagination page size (`ITEMS_PER_PAGE = 50`) is a hardcoded global constant. Different projects have different schema sizes — a project with small datasets benefits from fewer items per page (less token noise), while a project with hundreds of fields may need larger pages to reduce round-trips. Making this configurable per project lets administrators tune the trade-off between context window usage and round-trip count for each project's MCP consumers.

## What Changes

- Add an optional `mcpPageSize` field to the Project model (default `50`, min `10`, max `200`)
- Accept `mcpPageSize` in project create/update API payloads
- Pass the project-specific page size through the MCP tool context into the digest service
- Replace the hardcoded `ITEMS_PER_PAGE` constant with a parameter accepted by digest functions
- Expose the setting in the project settings UI

## Impact

- Affected specs: `project-management`, `mcp-server`
- Affected code:
  - `packages/core/src/models/Project.ts` — add `mcpPageSize` field
  - `packages/core/src/services/semantic-model-digest.ts` — accept `itemsPerPage` parameter
  - `apps/api/src/mcp/semlayer-route.ts` — include `mcpPageSize` in `McpToolContext`
  - `apps/api/src/mcp/semlayer-server.ts` — pass page size to digest calls, update tool descriptions
  - `apps/api/src/routes/projects.ts` — add to create/update schemas
  - `apps/frontend/src/routes/_auth/$projectId/settings.tsx` — add number input for page size
