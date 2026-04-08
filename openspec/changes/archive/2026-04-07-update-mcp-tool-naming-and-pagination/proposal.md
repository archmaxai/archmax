# Change: Rename MCP tools and add scoped pagination

## Why

The current MCP tool names (`get_semantic_model_overview`, `get_dataset_fields`) are overly specific and inconsistent with the rest of the tool naming convention. `get_dataset_fields` is misleading because it returns a full dataset digest (description, metadata, validated queries) — not just fields. Additionally, the overview tool dumps all datasets, relationships, and metrics in a single response with no pagination, which becomes unwieldy for large models (50+ datasets, 100+ relationships). The dataset tool paginates at 25 fields per page, which is too small for typical field browsing.

## What Changes

- **BREAKING**: Rename `get_semantic_model_overview` → `get_semantic_model`
- **BREAKING**: Rename `get_dataset_fields` → `get_dataset`
- Add scoped pagination to `get_semantic_model`: new optional `scope` parameter (`"datasets"`, `"relationships"`, `"metrics"`) with independent pagination per scope
- Increase default page size from 25 to 50 for `get_dataset` fields
- Default page size of 50 items per section for `get_semantic_model` scoped pagination
- Update `SemanticModelDigest` to support scoped overview output and the new page sizes

## Impact
- Affected specs: `mcp-server` (tool names and behavior)
- Affected code:
  - `apps/api/src/mcp/semlayer-server.ts` — tool registration names and parameters
  - `packages/core/src/services/semantic-model-digest.ts` — `FIELDS_PER_PAGE` increase, `overview()` signature change for scoped pagination
  - `packages/core/src/services/semantic-model-digest.test.ts` — update tests for new page sizes and scoped output
  - `packages/core/prompts/semantic-model-agent.md` — update tool name references (if present)
  - `openspec/project.md` — update MCP tool list in domain context
