# Change: Rework MCP Tool Signatures

## Why

The current `get_datasets` tool accepts a flat `datasetNames: string[]` with a single `page` parameter, which means multi-dataset requests always return page 1 and the caller cannot paginate individual datasets independently within a batch call. Renaming `suggest_improvement` to `request_improvement` better communicates that the action creates a trackable request rather than an informal suggestion. The UI label "Improvements" is ambiguous — "Improvement Requests" makes the origin and purpose clearer.

## What Changes

- **BREAKING** — `get_datasets` input schema: replace `datasetNames: string[]` + `page: number` with `datasets: [{ name: string, page?: number }, ...]` so each dataset can specify its own page
- **BREAKING** — Rename MCP tool `suggest_improvement` → `request_improvement`
- Rename UI accordion title "Improvements" → "Improvement Requests"
- Rename empty-state text from "Improvements are suggested by MCP clients" → "Improvement requests are submitted by MCP clients"
- Update playground agent tool registration to match
- Update docs (MCP tools reference, MCP integration guide) and README to reflect new signatures and names

## Impact

- Affected specs: `mcp-server`
- Affected code:
  - `apps/api/src/mcp/archmax-server.ts` — tool registration schemas
  - `packages/core/src/services/mcp-tools.ts` — `getDatasetFields` function signature
  - `packages/core/src/services/playground-agent.ts` — playground tool mirror
  - `apps/frontend/src/routes/_auth/$projectId/models.tsx` — accordion title
  - `apps/docs/src/content/docs/reference/mcp-tools.mdx` — reference page
  - `apps/docs/src/content/docs/guides/mcp-integration.mdx` — guide page
  - `README.md` — MCP tools table
  - `openspec/project.md` — MCP Server domain context
